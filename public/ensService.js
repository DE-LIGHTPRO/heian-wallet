/**
 * ENS Service for HEIAN Wallet (Vanilla JS Version)
 * Works with Chrome Extension without React
 */

class ENSService {
  constructor() {
    // Use Ethereum mainnet for ENS
    // Replace 'demo' with your Alchemy API key
    this.provider = new ethers.providers.JsonRpcProvider(
      'https://eth-mainnet.g.alchemy.com/v2/kZXgwC36g-a_voOSIuhYJ' // ← CHANGE THIS TO YOUR KEY
    );
    
    // Cache for performance
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  async resolveName(name) {
    if (!name || !name.endsWith('.eth')) {
      return null;
    }

    // Check cache first
    const cacheKey = `resolve:${name}`;
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const address = await this.provider.resolveName(name);
      
      if (address) {
        this._setCache(cacheKey, address);
        console.log(`✅ Resolved ${name} → ${address}`);
      }
      
      return address;
    } catch (error) {
      console.error(`❌ ENS resolution failed for ${name}:`, error);
      return null;
    }
  }

  async lookupAddress(address) {
    if (!address || !ethers.isAddress(address)) {
      return null;
    }

    const cacheKey = `lookup:${address}`;
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const name = await this.provider.lookupAddress(address);
      
      if (name) {
        this._setCache(cacheKey, name);
        console.log(`✅ Lookup ${address} → ${name}`);
      }
      
      return name;
    } catch (error) {
      console.error(`❌ ENS lookup failed for ${address}:`, error);
      return null;
    }
  }

  async getAvatar(name) {
    if (!name || !name.endsWith('.eth')) {
      return null;
    }

    const cacheKey = `avatar:${name}`;
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const resolver = await this.provider.getResolver(name);
      
      if (!resolver) {
        return null;
      }

      const avatar = await resolver.getAvatar();
      const avatarUrl = avatar?.url || null;
      
      if (avatarUrl) {
        this._setCache(cacheKey, avatarUrl);
        console.log(`✅ Avatar for ${name}: ${avatarUrl}`);
      }
      
      return avatarUrl;
    } catch (error) {
      console.error(`❌ Avatar fetch failed for ${name}:`, error);
      return null;
    }
  }

  isENSName(input) {
    return input && typeof input === 'string' && input.endsWith('.eth');
  }

  async batchResolve(names) {
    const results = {};
    
    await Promise.all(
      names.map(async (name) => {
        const address = await this.resolveName(name);
        results[name] = address;
      })
    );
    
    return results;
  }

  formatDisplayName(addressOrName, ensName = null) {
    if (ensName) {
      return ensName;
    }

    if (this.isENSName(addressOrName)) {
      return addressOrName;
    }

    if (ethers.isAddress(addressOrName)) {
      return `${addressOrName.slice(0, 6)}...${addressOrName.slice(-4)}`;
    }

    return addressOrName;
  }

  _getFromCache(key) {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    const { value, timestamp } = cached;
    const now = Date.now();
    
    if (now - timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return value;
  }

  _setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
    console.log('🧹 ENS cache cleared');
  }
}

// Make it available globally for Chrome extension
if (typeof window !== 'undefined') {
  window.ENSService = ENSService;
}
