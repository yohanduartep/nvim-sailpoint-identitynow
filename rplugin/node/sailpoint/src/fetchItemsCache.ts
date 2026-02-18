import { RESOURCE_CACHE_PREFIX } from './constants';
import { getRegistryEntry } from './resourceRegistry';
import { ISCClient } from './services/ISCClient';
import { sortItems } from './cacheUtils';

type ItemRecord = Record<string, unknown>;

export interface CacheEntry<T = ItemRecord[]> {
    value: T;
    timestamp: number;
}

export interface FetchResponse {
    items: ItemRecord[];
    totalCount: number;
    error?: string;
}

export interface TenantCacheLike {
    get: (tenantId: string, type: string, subId?: string) => Promise<CacheEntry | undefined>;
    update: (tenantId: string, type: string, value: ItemRecord[], subId?: string) => Promise<void>;
}

export interface GlobalStorageLike {
    get: <T = unknown>(key: string) => T;
    getWithTimestamp: <T = unknown>(key: string) => { value: T; timestamp: number } | undefined;
    update: (key: string, value: unknown) => Promise<void>;
    updateRaw: (key: string, value: unknown) => Promise<void>;
}

export type GetClient = () => {
    client: ISCClient;
    version: string;
    tenantId?: string;
};

interface CacheReadContext {
    type: string;
    limit: number | undefined;
    subId: string | undefined;
    tenantId: string;
    ttl: number;
    getClient: GetClient;
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
}

interface CachePersistContext {
    tenantId: string;
    type: string;
    limit: number | undefined;
    totalCount: number;
    items: ItemRecord[];
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
}

type CacheReader = (ctx: CacheReadContext) => Promise<FetchResponse | undefined>;
type CachePersistor = (ctx: CachePersistContext) => Promise<void>;

const defaultReadCache: CacheReader = async ({ type, limit, tenantId, ttl, globalStorage, tenantCache }) => {
    if (limit === 10) {
        const key = `${tenantId}_${RESOURCE_CACHE_PREFIX}${type}`;
        const cached = globalStorage.getWithTimestamp<ItemRecord[]>(key);
        const total = globalStorage.get<number>(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}_total`) || (cached ? cached.value.length : 0);
        if (cached && Date.now() - cached.timestamp < ttl && cached.value.length > 0) {
            return { items: cached.value, totalCount: total };
        }
        return undefined;
    }
    if (!limit) {
        const cached = await tenantCache.get(tenantId, type);
        if (cached && Date.now() - cached.timestamp < ttl) {
            return { items: cached.value, totalCount: cached.value.length };
        }
    }
    return undefined;
};

const accountReadCache: CacheReader = async ({ subId, tenantId, ttl, tenantCache, getClient, globalStorage }) => {
    if (subId) {
        const cached = await tenantCache.get(tenantId, 'accounts', subId);
        if (cached && Date.now() - cached.timestamp < ttl) {
            return { items: cached.value, totalCount: cached.value.length };
        }
        const { client } = getClient();
        const items = await client.getAccountsForSource(subId);
        const sorted = sortItems(items);
        await tenantCache.update(tenantId, 'accounts', sorted, subId);

        const summaryKey = `${tenantId}_accounts_summary`;
        const summary = globalStorage.get<ItemRecord[]>(summaryKey);
        if (Array.isArray(summary)) {
            let previousCount = 0;
            const updatedSummary = summary.map((source) => {
                if (String(source?.id || '') !== subId) return source;
                previousCount = Number(source?.count || 0);
                return { ...source, count: sorted.length };
            });
            await globalStorage.update(summaryKey, updatedSummary);

            const totalKey = `${tenantId}_accounts_total`;
            const totalFromStorage = Number(globalStorage.get<number>(totalKey) || 0);
            const hasKnownTotal = totalFromStorage > 0;
            const recalculatedTotal = hasKnownTotal
                ? Math.max(0, totalFromStorage - previousCount + sorted.length)
                : updatedSummary.reduce((sum, source) => sum + Number(source?.count || 0), 0);
            await globalStorage.updateRaw(totalKey, recalculatedTotal);
        }

        return { items: sorted, totalCount: sorted.length };
    }

    const summaryKey = `${tenantId}_accounts_summary`;
    const summary = globalStorage.getWithTimestamp<ItemRecord[]>(summaryKey);
    if (summary && Date.now() - summary.timestamp < ttl) {
        const totalFromStorage = Number(globalStorage.get<number>(`${tenantId}_accounts_total`) || 0);
        const inferredTotal = summary.value.reduce((sum, source) => sum + Number(source?.count || 0), 0);
        const totalCount = totalFromStorage > 0 ? totalFromStorage : inferredTotal;
        return { items: summary.value, totalCount };
    }

    const { client } = getClient();
    const sources = await client.getSources();
    const newSummary = sources
        .filter((s) => typeof s.id === 'string')
        .map(s => ({ id: s.id as string, name: s.name || s.id, count: 0 }));
    await globalStorage.update(summaryKey, newSummary);
    await globalStorage.updateRaw(`${tenantId}_accounts_total`, 0);
    return { items: newSummary, totalCount: 0 };
};

const CACHE_READERS: Record<string, CacheReader> = {
    accounts: accountReadCache,
    default: defaultReadCache
};

const persistDefaultCache: CachePersistor = async (params) => {
    const { tenantId, type, limit, totalCount, items, globalStorage, tenantCache } = params;
    if (limit === 10) {
        await globalStorage.update(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}`, items);
        await globalStorage.updateRaw(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}_total`, totalCount);
        return;
    }
    if (!limit) {
        await tenantCache.update(tenantId, type, items);
        await globalStorage.update(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}`, items.slice(0, 10));
        await globalStorage.updateRaw(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}_total`, totalCount);
    }
};

const persistAccountsCache: CachePersistor = async () => {
    return;
};

const CACHE_PERSISTORS: Record<string, CachePersistor> = {
    accounts: persistAccountsCache,
    default: persistDefaultCache
};

export async function tryReadCache(ctx: CacheReadContext): Promise<FetchResponse | undefined> {
    const policy = getRegistryEntry(ctx.type)?.cachePolicy || 'default';
    const reader = CACHE_READERS[policy] || defaultReadCache;
    return reader(ctx);
}

export async function persistCache(params: CachePersistContext): Promise<void> {
    const policy = getRegistryEntry(params.type)?.cachePolicy || 'default';
    const persistor = CACHE_PERSISTORS[policy] || persistDefaultCache;
    await persistor(params);
}
