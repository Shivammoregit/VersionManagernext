/**
 * Tests for cache.js
 * 
 * @module playstore/__tests__/cache.test
 */

// Use direct instantiation instead of mocking
import { InMemoryCache, createCache } from '../cache.js';

describe('InMemoryCache', () => {
    let cache;

    beforeEach(() => {
        // Create cache with explicit options to avoid config dependency
        cache = new InMemoryCache({ ttl: 1000, maxSize: 5 });
    });

    afterEach(() => {
        if (cache) {
            cache.destroy();
        }
    });

    describe('get/set operations', () => {
        test('returns null for non-existent key', async () => {
            const result = await cache.get('nonexistent');
            expect(result).toBeNull();
        });

        test('stores and retrieves value', async () => {
            await cache.set('key1', { data: 'value1' });
            const result = await cache.get('key1');
            expect(result).toEqual({ data: 'value1' });
        });

        test('overwrites existing value', async () => {
            await cache.set('key1', 'first');
            await cache.set('key1', 'second');
            const result = await cache.get('key1');
            expect(result).toBe('second');
        });

        test('stores different types', async () => {
            await cache.set('string', 'hello');
            await cache.set('number', 42);
            await cache.set('object', { a: 1 });
            await cache.set('array', [1, 2, 3]);

            expect(await cache.get('string')).toBe('hello');
            expect(await cache.get('number')).toBe(42);
            expect(await cache.get('object')).toEqual({ a: 1 });
            expect(await cache.get('array')).toEqual([1, 2, 3]);
        });
    });

    describe('TTL expiration', () => {
        test('returns null for expired entry', async () => {
            cache = new InMemoryCache({ ttl: 50, maxSize: 5 }); // 50ms TTL
            await cache.set('key1', 'value1');

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 100));

            const result = await cache.get('key1');
            expect(result).toBeNull();
        });

        test('custom TTL per entry', async () => {
            await cache.set('key1', 'value1', 50); // 50ms TTL
            await cache.set('key2', 'value2', 5000); // 5s TTL

            // Wait for first to expire
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBe('value2');
        });
    });

    describe('delete operation', () => {
        test('deletes existing key', async () => {
            await cache.set('key1', 'value1');
            const deleted = await cache.delete('key1');

            expect(deleted).toBe(true);
            expect(await cache.get('key1')).toBeNull();
        });

        test('returns false for non-existent key', async () => {
            const deleted = await cache.delete('nonexistent');
            expect(deleted).toBe(false);
        });
    });

    describe('clear operation', () => {
        test('removes all entries', async () => {
            await cache.set('key1', 'value1');
            await cache.set('key2', 'value2');
            await cache.set('key3', 'value3');

            await cache.clear();

            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBeNull();
            expect(await cache.get('key3')).toBeNull();
        });
    });

    describe('max size eviction', () => {
        test('evicts oldest entry when max size reached', async () => {
            // Fill cache to max (5 entries)
            for (let i = 1; i <= 5; i++) {
                await cache.set(`key${i}`, `value${i}`);
                await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
            }

            // Add one more - should evict key1 (oldest)
            await cache.set('key6', 'value6');

            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key6')).toBe('value6');
        });
    });

    describe('statistics', () => {
        test('tracks hits and misses', async () => {
            await cache.set('key1', 'value1');

            await cache.get('key1'); // hit
            await cache.get('key1'); // hit
            await cache.get('nonexistent'); // miss

            const stats = await cache.getStats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
        });

        test('tracks size', async () => {
            await cache.set('key1', 'value1');
            await cache.set('key2', 'value2');

            const stats = await cache.getStats();
            expect(stats.size).toBe(2);

            await cache.delete('key1');
            const stats2 = await cache.getStats();
            expect(stats2.size).toBe(1);
        });
    });

    describe('destroy', () => {
        test('cleans up resources', () => {
            const testCache = new InMemoryCache({ ttl: 1000, maxSize: 5 });
            testCache.destroy();

            // Should not throw
            expect(() => testCache.destroy()).not.toThrow();
        });
    });
});

describe('createCache', () => {
    test('creates InMemoryCache by default', () => {
        const cache = createCache({ ttl: 1000, maxSize: 10 });
        expect(cache).toBeInstanceOf(InMemoryCache);
        cache.destroy();
    });

    test('accepts custom options', () => {
        const cache = createCache({ ttl: 5000, maxSize: 100 });
        expect(cache).toBeInstanceOf(InMemoryCache);
        cache.destroy();
    });
});
