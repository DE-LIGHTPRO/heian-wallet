/**
 * CSV Parser with ENS Support (Vanilla JS Version)
 */

class CSVENSParser {
  constructor(ensService) {
    this.ensService = ensService;
  }

  async parseCSV(csvText, onProgress = null) {
    const lines = csvText.trim().split('\n');
    const payments = [];
    const errors = [];
    
    const startIndex = lines[0].toLowerCase().includes('recipient') ? 1 : 0;
    const dataLines = lines.slice(startIndex);
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      
      if (!line) continue;
      
      const parts = this.parseCSVLine(line);
      
      if (parts.length < 2) {
        errors.push({
          line: i + startIndex + 1,
          content: line,
          error: 'Invalid format (need at least recipient,amount)'
        });
        continue;
      }
      
      const [recipientInput, amountStr, ...memoParts] = parts;
      const recipient = recipientInput.trim();
      const amount = amountStr.trim();
      const memo = memoParts.join(',').trim();
      
      if (!amount || isNaN(parseFloat(amount))) {
        errors.push({
          line: i + startIndex + 1,
          content: line,
          error: 'Invalid amount'
        });
        continue;
      }
      
      let resolvedAddress = recipient;
      let displayName = recipient;
      let isENS = false;
      
      if (this.ensService.isENSName(recipient)) {
        try {
          const address = await this.ensService.resolveName(recipient);
          
          if (address) {
            resolvedAddress = address;
            displayName = recipient;
            isENS = true;
          } else {
            errors.push({
              line: i + startIndex + 1,
              content: line,
              error: `ENS name not found: ${recipient}`
            });
            continue;
          }
        } catch (error) {
          errors.push({
            line: i + startIndex + 1,
            content: line,
            error: `Failed to resolve ENS: ${recipient}`
          });
          continue;
        }
      } else if (!ethers.isAddress(recipient)) {
        errors.push({
          line: i + startIndex + 1,
          content: line,
          error: `Invalid address or ENS name: ${recipient}`
        });
        continue;
      }
      
      payments.push({
        recipient: resolvedAddress,
        displayName: displayName,
        amount: amount,
        memo: memo || '',
        isENS: isENS,
        lineNumber: i + startIndex + 1
      });
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: dataLines.length,
          percent: Math.round(((i + 1) / dataLines.length) * 100)
        });
      }
    }
    
    return {
      payments,
      errors,
      summary: {
        total: dataLines.length,
        successful: payments.length,
        failed: errors.length,
        ensResolved: payments.filter(p => p.isENS).length
      }
    };
  }

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  static generateExampleCSV() {
    return `recipient,amount,memo
vitalik.eth,100,December salary
nick.eth,50,Freelance work
0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb,75,Design work`;
  }

  static validateCSV(csvText) {
    const lines = csvText.trim().split('\n');
    
    if (lines.length === 0) {
      return { valid: false, error: 'CSV file is empty' };
    }
    
    if (lines.length === 1) {
      return { valid: false, error: 'CSV has no data rows' };
    }
    
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('recipient') || firstLine.includes('address');
    const dataRows = hasHeader ? lines.length - 1 : lines.length;
    
    return {
      valid: true,
      hasHeader,
      rows: dataRows,
      total: lines.length
    };
  }
}

if (typeof window !== 'undefined') {
  window.CSVENSParser = CSVENSParser;
}
