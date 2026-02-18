import { NvimPlugin } from 'neovim';
import { ResourceFetcher } from './commands/ResourceFetcher';
import { getCacheTtlMs, sortItems } from './cacheUtils';
import { dedupeItems } from './utils/dedupe';
import { logError } from './services/logger';
import { persistCache, tryReadCache } from './fetchItemsCache';
import type { GlobalStorageLike, TenantCacheLike, GetClient } from './fetchItemsCache';

interface TenantRef {
    id: string;
}

interface Deps {
    plugin: NvimPlugin;
    tenantService: { getTenants: () => TenantRef[] };
    initializeActiveTenant: () => void;
    getActiveTenantIndex: () => number;
    getClient: GetClient;
    resourceFetcher: ResourceFetcher;
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function registerFetchItemsHandler(deps: Deps) {
    const {
        plugin,
        tenantService,
        initializeActiveTenant,
        getActiveTenantIndex,
        getClient,
        resourceFetcher,
        globalStorage,
        tenantCache
    } = deps;

    plugin.registerFunction('SailPointFetchItems', async (args: unknown[]) => {
        try {
            const tenants = tenantService.getTenants();
            const [typeRaw, queryRaw, limitRaw, subIdRaw] = args;
            const type = String(typeRaw || '');
            const query = typeof queryRaw === 'string' ? queryRaw : undefined;
            const limit = typeof limitRaw === 'number' ? limitRaw : undefined;
            const subId = typeof subIdRaw === 'string' ? subIdRaw : undefined;

            if (tenants.length > 0 && type.toLowerCase() !== 'tenants') {
                initializeActiveTenant();
            }

            const activeTenant = tenants[getActiveTenantIndex()];
            const tenantId = activeTenant?.id || 'default';
            const ttl = await getCacheTtlMs(plugin.nvim);

            if (!query) {
                const cached = await tryReadCache({
                    type,
                    limit,
                    subId,
                    tenantId,
                    ttl,
                    getClient,
                    globalStorage,
                    tenantCache
                });
                if (cached) return cached;
            }

            const result = await resourceFetcher.fetchItemsInternal(type, getClient, getActiveTenantIndex(), query, limit);
            if (tenantId !== 'default' && result && result.items) {
                const sorted = sortItems([...result.items]);
                const unique = dedupeItems(sorted);
                if (!query) {
                    await persistCache({
                        tenantId,
                        type,
                        limit,
                        totalCount: result.totalCount,
                        items: unique,
                        globalStorage,
                        tenantCache
                    });
                }
                result.items = unique;
            }
            return result || { items: [], totalCount: 0 };
        } catch (e: unknown) {
            logError('SailPoint: Fatal error in FetchItems:', e);
            return { items: [], totalCount: 0, error: errorMessage(e) };
        }
    }, { sync: true });
}
