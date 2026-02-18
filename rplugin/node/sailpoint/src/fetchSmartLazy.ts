import { NvimPlugin } from 'neovim';
import { ISCClient } from './services/ISCClient';
import { ALL_RESOURCE_TYPES } from './constants';
import {
    echoStatus,
    fetchAccountsCheckpoint,
    fetchSpecialResourceType,
    fetchStandardResourceType
} from './fetchAllHandlers';
import type { GlobalStorageLike, TenantCacheLike } from './fetchAllHandlers';
import { logWarn } from './services/logger';

interface TenantRef {
    id: string;
    name?: string;
}

interface Deps {
    plugin: NvimPlugin;
    tenantService: { getTenants: () => TenantRef[] };
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
    resourceFetcher: any;
    getClient: () => { client: ISCClient; version: string; tenantId: string; displayName?: string };
    getActiveTenantIndex: () => number;
    initializeActiveTenant: () => void;
}

const SPECIAL_TYPES = new Set(['tenants', 'identity-attributes', 'search-attributes', 'identities']);
const LAZY_FETCH_TTL = 24 * 60 * 60 * 1000; // 24 hours
const toMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

interface FetchDecision {
    shouldFetch: boolean;
    reason?: string;
}

async function shouldFetchResource(
    plugin: NvimPlugin,
    type: string,
    tenantId: string,
    client: ISCClient,
    globalStorage: GlobalStorageLike
): Promise<FetchDecision> {
    // Check timestamp - if cached data exists and is less than 24h old, skip fetch
    const key = `${tenantId}_${type}_metadata`;
    const cached = globalStorage.getWithTimestamp<{ totalCount?: number; lastModified?: string }>(key);
    
    if (!cached) {
        return { shouldFetch: true, reason: 'no cache' };
    }

    const age = Date.now() - cached.timestamp;
    if (age > LAZY_FETCH_TTL) {
        return { shouldFetch: true, reason: '24h+ old' };
    }

    // For resources with metadata API, check if modified
    if (!SPECIAL_TYPES.has(type) && type !== 'accounts') {
        try {
            const metadata = await client.getResourceMetadata(type);
            const cachedValue = cached.value || {};
            
            // Check if count or lastModified changed
            if (metadata.totalCount !== cachedValue.totalCount) {
                return { shouldFetch: true, reason: 'count changed' };
            }
            if (metadata.lastModified && metadata.lastModified !== cachedValue.lastModified) {
                return { shouldFetch: true, reason: 'modified' };
            }
        } catch (e: unknown) {
            logWarn(`SailPoint: metadata check failed for ${type}: ${toMessage(e)}`);
            // If metadata check fails, skip fetch (use cached data)
            return { shouldFetch: false };
        }
    }

    return { shouldFetch: false };
}

export function registerSmartLazyFetch(deps: Deps) {
    const {
        plugin,
        tenantService,
        globalStorage,
        tenantCache,
        resourceFetcher,
        getClient,
        getActiveTenantIndex,
        initializeActiveTenant,
    } = deps;

    const shared = {
        plugin,
        globalStorage,
        tenantCache,
        resourceFetcher,
        getClient,
        getActiveTenantIndex
    };

    plugin.registerCommand('SPISmartLazyFetch', async () => {
        initializeActiveTenant();
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) {
            return;
        }

        const activeTenant = tenants[getActiveTenantIndex()];
        const tenantId = activeTenant.id!;
        const { client } = getClient();

        let fetchCount = 0;
        let skipCount = 0;

        for (const type of ALL_RESOURCE_TYPES) {
            try {
                const decision = await shouldFetchResource(plugin, type, tenantId, client, globalStorage);
                
                if (!decision.shouldFetch) {
                    skipCount++;
                    continue;
                }

                // Fetch this resource
                fetchCount++;
                if (type === 'accounts') {
                    await fetchAccountsCheckpoint(shared, client, tenantId);
                } else if (SPECIAL_TYPES.has(type)) {
                    await fetchSpecialResourceType(shared, type, tenantId);
                } else {
                    await fetchStandardResourceType(shared, type, client, tenantId);
                }
            } catch (e: unknown) {
                await echoStatus(plugin, `SailPoint: ERROR ${type}: ${toMessage(e)}`);
            }
        }

        if (fetchCount === 0) {
            await plugin.nvim.command('echo "SailPoint: Auto-Fetch completed"');
        } else {
            await plugin.nvim.command('echo "SailPoint: Auto-Fetch completed"');
        }
    }, { sync: false });
}
