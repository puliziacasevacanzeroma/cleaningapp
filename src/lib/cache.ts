import { Redis } from "@upstash/redis";

// Connessione Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Durata cache in secondi
const CACHE_TTL = {
  dashboard: 60,
  properties: 300,
  inventory: 300,
  cleanings: 30,
  users: 300,
};

type CacheKey = keyof typeof CACHE_TTL;

export async function cachedQuery<T>(
  key: CacheKey,
  queryFn: () => Promise<T>
): Promise<T> {
  const cacheKey = `cleaningapp:${key}`;
  
  try {
    const cached = await redis.get<T>(cacheKey);
    if (cached) {
      console.log(`✓ Cache HIT: ${key}`);
      return cached;
    }
    
    console.log(`✗ Cache MISS: ${key}`);
    const data = await queryFn();
    
    await redis.setex(cacheKey, CACHE_TTL[key], JSON.stringify(data));
    
    return data;
  } catch (error) {
    console.error(`Cache error for ${key}:`, error);
    return queryFn();
  }
}

export async function invalidateCache(key: CacheKey | CacheKey[]) {
  const keys = Array.isArray(key) ? key : [key];
  
  try {
    for (const k of keys) {
      await redis.del(`cleaningapp:${k}`);
      console.log(`✓ Cache invalidated: ${k}`);
    }
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
}

export async function invalidateAllCache() {
  try {
    const keys = await redis.keys("cleaningapp:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✓ All cache invalidated (${keys.length} keys)`);
    }
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
}

export { redis };