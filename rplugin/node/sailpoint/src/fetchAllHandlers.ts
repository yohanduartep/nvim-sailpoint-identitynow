import { NvimPlugin } from 'neovim';
import { Source } from 'sailpoint-api-client';
import { ResourceFetcher } from './commands/ResourceFetcher';
import { ISCClient } from './services/ISCClient';
import { sortItems } from './cacheUtils';
import { RESOURCE_CACHE_PREFIX } from './constants';
import { logWarn } from './services/logger';

type ItemRecord = Record<string, unknown>;

export interface GlobalStorageLike {
    get: <T = unknown>(key: string) => T;
    getWithTimestamp: <T = unknown>(key: string) => { value: T; timestamp: number } | undefined;
    update: (key: string, value: unknown) => Promise<void>;
    updateRaw: (key: string, value: unknown) => Promise<void>;
}

export interface TenantCacheLike {
    get: (tenantId: string, resourceType: string, subId?: string) => Promise<{ value: ItemRecord[]; timestamp: number } | undefined>;
    update: (tenantId: string, resourceType: string, value: ItemRecord[], subId?: string) => Promise<void>;
}

interface Shared {
    plugin: NvimPlugin;
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
    resourceFetcher: ResourceFetcher;
    getClient: () => { client: ISCClient; version: string; tenantId: string; displayName?: string };
    getActiveTenantIndex: () => number;
    isDebugMode?: () => boolean;
}

const toMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export async function echoStatus(plugin: NvimPlugin, message: string): Promise<void> {
    await plugin.nvim.command(`echo "${message.replace(/"/g, '\\"')}"`);
    await plugin.nvim.command('redraw');
}

export async function fetchAccountsCheckpoint(shared: Shared, client: ISCClient, tenantId: string): Promise<void> {
    const { plugin, globalStorage, tenantCache, isDebugMode } = shared;
    const sources = await client.getSources();
    plugin.nvim.outWrite(`SailPoint: Found ${sources.length} sources for accounts fetch\n`);
    const sourceTasks: Array<{ source: Source; count: number }> = [];

    for (const source of sources) {
        if (!source.id) continue;
        sourceTasks.push({ source, count: -1 });
    }
    
    plugin.nvim.outWrite(`SailPoint: Will fetch accounts from ${sourceTasks.length} sources\n`);
    sourceTasks.sort((a, b) => (a.source.name || '').localeCompare(b.source.name || ''));

    let totalAcrossSources = 0;
    const summary: Array<{ id: string; name: string; count: number }> = [];

    // Parallel fetch accounts from all sources (3 at a time to avoid overwhelming API)
    const SOURCE_BATCH_SIZE = 3;
    for (let i = 0; i < sourceTasks.length; i += SOURCE_BATCH_SIZE) {
        const batch = sourceTasks.slice(i, i + SOURCE_BATCH_SIZE);
        
        const results = await Promise.all(batch.map(async (task) => {
            const sourceId = task.source.id;
            if (!sourceId) return null;

            const sourceName = task.source.name || sourceId;
            
            // Check cache first
            const existing = await tenantCache.get(tenantId, 'accounts', sourceId);
            if (existing && existing.value && existing.value.length > 0) {
                if (isDebugMode?.()) {
                    plugin.nvim.outWrite(`SailPoint: Accounts [${sourceName}] - Cached (${existing.value.length} items)\n`);
                }
                return { id: sourceId, name: sourceName, count: existing.value.length };
            }
            
            // Fetch accounts
            try {
                if (isDebugMode?.()) {
                    plugin.nvim.outWrite(`SailPoint: Fetching accounts for [${sourceName}]...\n`);
                }
                
                let lastLogTime = Date.now();
                const progressHandler = async (count: number, total: number) => {
                    const now = Date.now();
                    if (now - lastLogTime > 1000) { // Only every 1s to reduce noise
                        await echoStatus(plugin, `SailPoint: Accounts [${sourceName}] ${count}/${total}`);
                        lastLogTime = now;
                    }
                };

                const items = await client.getAccountsForSource(sourceId, progressHandler);
                const sorted = sortItems(items);
                
                if (sorted.length > 0) {
                    await tenantCache.update(tenantId, 'accounts', sorted, sourceId);
                    if (isDebugMode?.()) {
                        plugin.nvim.outWrite(`SailPoint: Accounts [${sourceName}] - Fetched ${sorted.length} items\n`);
                    }
                    return { id: sourceId, name: sourceName, count: sorted.length };
                }
                return null;
            } catch (e: unknown) {
                plugin.nvim.outWrite(`SailPoint: ERROR fetching accounts for ${sourceName}: ${toMessage(e)}\n`);
                return null;
            }
        }));
        
        // Add batch results to summary
        for (const result of results) {
            if (result) {
                totalAcrossSources += result.count;
                summary.push(result);
            }
        }
    }

    const sortedSummary = sortItems(summary);
    await globalStorage.update(`${tenantId}_accounts_summary`, sortedSummary);
    await globalStorage.updateRaw(`${tenantId}_accounts_total`, totalAcrossSources);
    await plugin.nvim.executeLua('SailPointUpdateCache(...)', ['accounts', { items: sortedSummary, totalCount: totalAcrossSources }, '']);
}

export async function fetchSpecialResourceType(shared: Shared, type: string, tenantId: string): Promise<void> {
    const { plugin, globalStorage, tenantCache, resourceFetcher, getActiveTenantIndex, getClient } = shared;
    const response = await resourceFetcher.fetchItemsInternal(type, getClient, getActiveTenantIndex());
    const items = sortItems(response.items);
    await echoStatus(plugin, `SailPoint: Fetched ${type} (${items.length} items)`);
    await tenantCache.update(tenantId, type, items);

    const sidebarItems = items.slice(0, 10);
    await globalStorage.update(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}`, sidebarItems);
    await globalStorage.updateRaw(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}_total`, items.length);
    await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: sidebarItems, totalCount: items.length }, '']);
}

export async function fetchStandardResourceType(shared: Shared, type: string, client: ISCClient, tenantId: string): Promise<void> {
    const { plugin, globalStorage, tenantCache, resourceFetcher, getActiveTenantIndex, getClient, isDebugMode } = shared;
    const cacheKey = `${tenantId}_${type}_metadata`;
    
    // Check if we have recent cached data first (avoid unnecessary API calls)
    const cachedItems = await tenantCache.get(tenantId, type);
    if (cachedItems) {
        const cachedMetadata = globalStorage.get<{ totalCount?: number; lastModified?: string; fetchedAt?: number } | undefined>(cacheKey);
        const now = Date.now();
        const cacheAge = cachedMetadata?.fetchedAt ? now - cachedMetadata.fetchedAt : Infinity;
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        
        if (cacheAge < CACHE_TTL) {
            if (isDebugMode?.()) {
                plugin.nvim.outWrite(`SailPoint: ${type} - Using recent cache (${Math.round(cacheAge / 1000)}s old)\n`);
            }
            await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: cachedItems.value.slice(0, 10), totalCount: cachedItems.value.length }, '']);
            return;
        }
    }
    
    // Try metadata check for cache optimization (optional, may 404)
    let metadata: { totalCount: number; lastModified?: string } | null = null;
    try {
        metadata = await client.getResourceMetadata(type);
        
        // If metadata unchanged, reuse cache
        if (metadata && cachedItems) {
            const cachedMetadata = globalStorage.get<{ totalCount?: number; lastModified?: string } | undefined>(cacheKey);
            if (cachedMetadata?.totalCount === metadata.totalCount && cachedMetadata?.lastModified === metadata.lastModified) {
                if (isDebugMode?.()) {
                    plugin.nvim.outWrite(`SailPoint: ${type} - Skipped (no changes)\n`);
                }
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: cachedItems.value.slice(0, 10), totalCount: cachedItems.value.length }, '']);
                return;
            }
        }
    } catch (e: unknown) {
        // Metadata endpoint doesn't exist in v2025 - not an error, just skip optimization
    }

    // Fetch the actual resource data (no per-resource progress during parallel batches)
    const progressHandler = isDebugMode?.() ? async (count: number, detail?: string | number) => {
        const labelText = detail !== undefined ? ` [${String(detail)}]` : '';
        plugin.nvim.outWrite(`SailPoint: ${type}${labelText}... ${count} items\n`);
    } : undefined;

    const response = await resourceFetcher.fetchItemsInternal(type, getClient, getActiveTenantIndex(), undefined, undefined, progressHandler);
    const items = sortItems(response.items);

    if (isDebugMode?.()) {
        plugin.nvim.outWrite(`SailPoint: Fetched ${type} - ${items.length} items\n`);
    }
    
    // Store to cache
    await tenantCache.update(tenantId, type, items);
    
    // Save metadata with fetch timestamp
    if (metadata) {
        await globalStorage.updateRaw(cacheKey, { ...metadata, fetchedAt: Date.now() });
    } else {
        await globalStorage.updateRaw(cacheKey, { totalCount: items.length, fetchedAt: Date.now() });
    }

    const sidebarItems = items.slice(0, 10);
    await globalStorage.update(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}`, sidebarItems);
    await globalStorage.updateRaw(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}_total`, items.length);
    await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: sidebarItems, totalCount: items.length }, response.error || '']);
}


