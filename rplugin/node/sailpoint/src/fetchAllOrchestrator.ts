import { NvimPlugin } from 'neovim';
import { ISCClient } from './services/ISCClient';
import { ResourceFetcher } from './commands/ResourceFetcher';
import { ALL_RESOURCE_TYPES } from './constants';
import { isDebugMode } from './index';
import {
    echoStatus,
    fetchAccountsCheckpoint,
    fetchSpecialResourceType,
    fetchStandardResourceType
} from './fetchAllHandlers';
import type { GlobalStorageLike, TenantCacheLike } from './fetchAllHandlers';

type GetClient = () => {
    client: ISCClient;
    version: string;
    tenantId: string;
    displayName?: string;
};

interface TenantRef {
    id: string;
    name?: string;
}

interface Deps {
    plugin: NvimPlugin;
    tenantService: { getTenants: () => TenantRef[] };
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
    resourceFetcher: ResourceFetcher;
    getClient: GetClient;
    getActiveTenantIndex: () => number;
    initializeActiveTenant: () => void;
}

const SPECIAL_TYPES = new Set(['tenants', 'identity-attributes', 'search-attributes', 'identities']);
const toMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

function is404Error(error: unknown): boolean {
    const msg = toMessage(error);
    return msg.includes('404') || msg.includes('Not Found') || msg.includes('not found');
}

export function registerFetchAllCommands(deps: Deps) {
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
        getActiveTenantIndex,
        isDebugMode
    };

    plugin.registerCommand('SPIFetchAll', async () => {
        if (isDebugMode()) {
            plugin.nvim.outWrite('=== SPIFetchAll STARTED ===\n');
        }
        initializeActiveTenant();
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) {
            for (const type of ALL_RESOURCE_TYPES) {
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: [], totalCount: 0 }, 'No tenants configured.']);
            }
            return;
        }

        const activeTenant = tenants[getActiveTenantIndex()];
        const tenantId = activeTenant.id!;
        const { client } = getClient();

        // Separate resources into sequential (large) and parallel (small) batches
        const sequentialTypes = ['accounts', 'identities', 'entitlements'];
        const parallelTypes = ALL_RESOURCE_TYPES.filter(t => !sequentialTypes.includes(t));
        
        let completed = 0;
        const total = ALL_RESOURCE_TYPES.length;
        
        const updateProgress = async () => {
            completed++;
            await plugin.nvim.command(`echo "SailPoint: Fetching... ${completed}/${total} resources"`);
        };

        // Fetch large resources sequentially (with detailed progress)
        for (const type of sequentialTypes) {
            if (isDebugMode()) {
                plugin.nvim.outWrite(`SailPoint: Processing ${type}...\n`);
            }
            try {
                if (type === 'accounts') {
                    await fetchAccountsCheckpoint(shared, client, tenantId);
                } else if (SPECIAL_TYPES.has(type)) {
                    await fetchSpecialResourceType(shared, type, tenantId);
                } else {
                    await fetchStandardResourceType(shared, type, client, tenantId);
                }
                await updateProgress();
            } catch (e: unknown) {
                if (is404Error(e)) {
                    if (isDebugMode()) {
                        plugin.nvim.outWrite(`SailPoint: ${type} - Not available (404)\n`);
                    }
                } else {
                    plugin.nvim.outWrite(`SailPoint: ERROR ${type}: ${toMessage(e)}\n`);
                }
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: [], totalCount: 0 }, '']);
                await updateProgress();
            }
        }

        // Fetch small resources in parallel batches
        const BATCH_SIZE = 8;
        for (let i = 0; i < parallelTypes.length; i += BATCH_SIZE) {
            const batch = parallelTypes.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (type) => {
                if (isDebugMode()) {
                    plugin.nvim.outWrite(`SailPoint: Processing ${type}...\n`);
                }
                try {
                    if (SPECIAL_TYPES.has(type)) {
                        await fetchSpecialResourceType(shared, type, tenantId);
                    } else {
                        await fetchStandardResourceType(shared, type, client, tenantId);
                    }
                } catch (e: unknown) {
                    if (is404Error(e)) {
                        if (isDebugMode()) {
                            plugin.nvim.outWrite(`SailPoint: ${type} - Not available (404)\n`);
                        }
                    } else {
                        plugin.nvim.outWrite(`SailPoint: ERROR ${type}: ${toMessage(e)}\n`);
                    }
                    await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: [], totalCount: 0 }, '']);
                }
            }));
            completed += batch.length;
            await plugin.nvim.command(`echo "SailPoint: Fetching... ${completed}/${total} resources"`);
        }

        await plugin.nvim.command('echo "SailPoint: Fetch complete."');
        
        // Reload cache from disk to ensure Lua state is fresh
        try {
            await plugin.nvim.command('SPIInitCache');
        } catch (e) {
            // Failed to reinit cache, that's okay
        }
    }, { sync: false });

    plugin.registerCommand('SPIPrefetchAll', async () => {
        await plugin.nvim.command('SPIFetchAll');
    }, { sync: false });
}

