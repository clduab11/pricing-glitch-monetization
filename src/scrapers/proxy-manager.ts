import axios from 'axios';
import Redis from 'ioredis';

interface Proxy {
  id: string;
  url: string;
  username?: string;
  password?: string;
  country?: string;
  isHealthy: boolean;
  lastUsed: Date;
  failureCount: number;
}

export class ProxyManager {
  private redisClient: Redis;
  private proxyProvider: string;

  constructor(proxyProvider = 'brightdata') {
    this.proxyProvider = proxyProvider;
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      lazyConnect: true,
    });
  }

  async initialize(): Promise<void> {
    await this.redisClient.connect();
    await this.loadProxies();
  }

  private async loadProxies(): Promise<void> {
    // Load proxies from provider API or config
    const proxies = await this.fetchProxiesFromProvider();
    
    for (const proxy of proxies) {
      await this.redisClient.hset(
        `proxy:${proxy.id}`,
        {
          url: proxy.url,
          username: proxy.username || '',
          password: proxy.password || '',
          country: proxy.country || 'US',
          isHealthy: 'true',
          lastUsed: new Date().toISOString(),
          failureCount: '0',
        }
      );
    }
  }

  async getProxy(country?: string): Promise<Proxy> {
    // Get least recently used healthy proxy
    const keys = await this.redisClient.keys('proxy:*');
    const healthyProxies: Proxy[] = [];

    for (const key of keys) {
      const data = await this.redisClient.hgetall(key);
      if (data.isHealthy === 'true' && 
          (!country || data.country === country)) {
        healthyProxies.push({
          id: key.replace('proxy:', ''),
          url: data.url,
          username: data.username,
          password: data.password,
          country: data.country,
          isHealthy: data.isHealthy === 'true',
          lastUsed: new Date(data.lastUsed),
          failureCount: parseInt(data.failureCount || '0'),
        });
      }
    }

    if (healthyProxies.length === 0) {
      // Return a fallback or throw
      // For now throwing as per docs
      throw new Error('No healthy proxies available');
    }

    // Sort by least recently used
    healthyProxies.sort((a, b) => 
      a.lastUsed.getTime() - b.lastUsed.getTime()
    );

    const selectedProxy = healthyProxies[0];

    // Update last used
    await this.redisClient.hset(
      `proxy:${selectedProxy.id}`,
      'lastUsed',
      new Date().toISOString()
    );

    return selectedProxy;
  }

  async reportFailure(proxyId: string): Promise<void> {
    const key = `proxy:${proxyId}`;
    const failureCount = await this.redisClient.hget(key, 'failureCount');
    const newCount = parseInt(failureCount || '0') + 1;

    await this.redisClient.hset(key, 'failureCount', newCount.toString());

    // Mark unhealthy if too many failures
    if (newCount >= 5) {
      await this.redisClient.hset(key, 'isHealthy', 'false');
      console.warn(`Proxy ${proxyId} marked unhealthy after ${newCount} failures`);
    }
  }

  async healthCheck(): Promise<void> {
    const keys = await this.redisClient.keys('proxy:*');

    for (const key of keys) {
      const data = await this.redisClient.hgetall(key);
      const proxy = {
        url: data.url,
        username: data.username,
        password: data.password,
      };

      try {
        // Test proxy with simple HTTP request
        const response = await axios.get('https://httpbin.org/ip', {
          proxy: {
            protocol: 'http',
            host: new URL(proxy.url).hostname,
            port: parseInt(new URL(proxy.url).port),
            auth: proxy.username ? {
              username: proxy.username,
              password: proxy.password,
            } : undefined,
          },
          timeout: 10000,
        });

        if (response.status === 200) {
          // Reset failure count and mark healthy
          await this.redisClient.hset(key, {
            isHealthy: 'true',
            failureCount: '0',
          });
        }
      } catch (_error) {
        await this.reportFailure(key.replace('proxy:', ''));
      }
    }
  }

  private async fetchProxiesFromProvider(): Promise<Proxy[]> {
    // Implementation depends on proxy provider
    // Example: Bright Data, Smartproxy, Oxylabs
    if (this.proxyProvider === 'brightdata') {
      return this.fetchBrightDataProxies();
    }
    return [];
  }

  private async fetchBrightDataProxies(): Promise<Proxy[]> {
    // Bright Data uses zone credentials
    const zones = [
      {
        id: 'zone1',
        country: 'US',
        port: '22225',
      },
      {
        id: 'zone2',
        country: 'GB',
        port: '22225',
      },
    ];

    return zones.map((zone) => ({
      id: zone.id,
      url: `http://brd.superproxy.io:${zone.port}`,
      username: process.env.BRIGHTDATA_USERNAME!,
      password: process.env.BRIGHTDATA_PASSWORD!,
      country: zone.country,
      isHealthy: true,
      lastUsed: new Date(),
      failureCount: 0,
    }));
  }
}
