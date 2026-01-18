import { Redis } from "@upstash/redis";

// Connessione Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Durata cache in secondi
const CACHE_TTL = {
  dashboard: 60,        // 1 minuto
  properties: 300,      // 5 minuti
  inventory: 300,       // 5 minuti
  cleanings: 30,        // 30 secondi
  users: 300,           // 5 minuti
};

type CacheKey = keyof typeof CACHE_TTL;

/**
 * Prende i dati dalla cache, se non ci sono li prende dal DB e li salva in cache
 */
export async function cachedQuery<T>(
  key: CacheKey,
  queryFn: () => Promise<T>
): Promise<T> {
  const cacheKey = `cleaningapp:${key}`;
  
  try {
    // 1. Prova a prendere dalla cache
    const cached = await redis.get<T>(cacheKey);
    if (cached) {
      console.log(`✓ Cache HIT: ${key}`);
      return cached;
    }
    
    // 2. Se non c'è, esegui la query
    console.log(`✗ Cache MISS: ${key}`);
    const data = await queryFn();
    
    // 3. Salva in cache
    await redis.setex(cacheKey, CACHE_TTL[key], JSON.stringify(data));
    
    return data;
  } catch (error) {
    console.error(`Cache error for ${key}:`, error);
    // Se Redis fallisce, esegui comunque la query
    return queryFn();
  }
}

/**
 * Invalida una chiave della cache
 */
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

/**
 * Invalida tutta la cache
 */
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