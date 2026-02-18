import { NvimPlugin } from 'neovim';
import { setNvim, globalStorage, secretStorage, tenantCache } from './vscode';
import { TenantService } from './services/TenantService';
import { ISCClient } from './services/ISCClient';
import { SailPointISCAuthenticationProvider } from './services/AuthenticationProvider';
import { BufferUtils } from './utils/BufferUtils';
import { SaveCommand } from './commands/SaveCommand';
import { TenantCommands } from './commands/TenantCommands';
import { ResourceFetcher } from './commands/ResourceFetcher';
import { ResourceCommands } from './commands/ResourceCommands';
import { handleError } from './errors';
import { ALL_RESOURCE_TYPES, RESOURCE_CACHE_PREFIX, ACTIVE_TENANT_ID_KEY } from './constants';
import { getRegistryEntry, RESOURCE_DEFINITIONS } from './resourceRegistry';
import { registerFetchAllCommands } from './fetchAllOrchestrator';
import { registerSmartLazyFetch } from './fetchSmartLazy';
import { registerFetchItemsHandler } from './fetchItemsHandler';
import { registerDebugCommands, registerResourceAndTenantCommands } from './commandRegistrations';
import { logWarn } from './services/logger';
import { sortItems } from './cacheUtils';

let activeTenantIndex = 0;
let debugMode = false;

export function isDebugMode(): boolean {
    return debugMode;
}

export function setDebugMode(enabled: boolean): void {
    debugMode = enabled;
}

export default function(plugin: NvimPlugin) {
    setNvim(plugin.nvim);

    const context = {
        globalState: globalStorage,
        secrets: secretStorage,
        subscriptions: [],
        extensionUri: { path: '' } as any,
        asAbsolutePath: (p: string) => p
    };

    const tenantService = new TenantService(context.globalState, context.secrets);
    SailPointISCAuthenticationProvider.initialize(tenantService);
    
    const bufferUtils = new BufferUtils(plugin.nvim);
    const saveCommand = new SaveCommand(plugin.nvim);
    const tenantCommands = new TenantCommands(plugin.nvim, tenantService);
    const resourceFetcher = new ResourceFetcher(tenantService);
    const resourceCommands = new ResourceCommands(plugin.nvim, bufferUtils);

    plugin.registerFunction('SailPointGetResourceDefinitions', () => {
        return RESOURCE_DEFINITIONS;
    }, { sync: true });

    const initializeActiveTenant = () => {
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) return;
        const lastId = globalStorage.get<string>(ACTIVE_TENANT_ID_KEY);
        if (lastId) {
            const idx = tenants.findIndex(t => t.id === lastId);
            if (idx !== -1) activeTenantIndex = idx;
        }
    };

    const initializeCache = async () => {
        plugin.nvim.outWrite('SailPoint: Initializing cache...\n');
        let pruneTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        try {
            const pruneTtlDays = await plugin.nvim.getVar('sailpoint_cache_prune_ttl_days');
            if (typeof pruneTtlDays === 'number' && pruneTtlDays > 0) {
                pruneTtlMs = Math.floor(pruneTtlDays * 24 * 60 * 60 * 1000);
            }
        } catch (e: any) {
            logWarn(`SailPoint: using default prune TTL (7 days): ${e?.message || String(e)}`);
        }
        await tenantCache.pruneOlderThan(pruneTtlMs);

        const tenants = tenantService.getTenants();
        plugin.nvim.outWrite(`SailPoint: Found ${tenants.length} tenant(s)\n`);
        if (tenants.length === 0) return;
        initializeActiveTenant();
        const activeTenant = tenants[activeTenantIndex];
        const tenantId = activeTenant.id!;
        plugin.nvim.outWrite(`SailPoint: Active tenant: ${tenantId}\n`);

        let loadedCount = 0;
        for (const type of ALL_RESOURCE_TYPES) {
            const policy = getRegistryEntry(type)?.cachePolicy || 'default';
            if (policy === 'accounts') {
                const summary = globalStorage.get<Record<string, unknown>[]>(`${tenantId}_accounts_summary`);
                const total = globalStorage.get<number>(`${tenantId}_accounts_total`) || 0;
                if (summary && summary.length > 0) {
                    await plugin.nvim.executeLua('SailPointUpdateCache(...)', ['accounts', { items: summary, totalCount: total }, '']);
                    loadedCount++;
                } else {
                    // No accounts cached yet - initialize with empty sources list
                    await plugin.nvim.executeLua('SailPointUpdateCache(...)', ['accounts', { items: [], totalCount: 0 }, '']);
                }
                continue;
            }
            const cachedItems = globalStorage.get<Record<string, unknown>[]>(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}`);
            const total = globalStorage.get<number>(`${tenantId}_${RESOURCE_CACHE_PREFIX}${type}_total`) || (cachedItems ? cachedItems.length : 0);
            if (cachedItems && cachedItems.length > 0) {
                // Always sort before sending to Lua
                const sorted = sortItems(cachedItems);
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: sorted, totalCount: total }, '']);
                loadedCount++;
            } else if (total === 0) {
                // Initialize empty cache to prevent unnecessary fetches
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, { items: [], totalCount: 0 }, '']);
                loadedCount++;
            }
        }
        
        plugin.nvim.outWrite(`SailPoint: Loaded ${loadedCount} cached resource types\n`);
    };

    const getClient = () => {
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) throw new Error('No tenants configured.');
        if (activeTenantIndex >= tenants.length) activeTenantIndex = 0;
        const tenant = tenants[activeTenantIndex];
        if (!tenant.version) {
            throw new Error(`Tenant '${tenant.id}' has no API version configured. Re-add or update this tenant configuration.`);
        }
        return {
            client: new ISCClient(tenant.id!, tenant.tenantName!, tenant.version),
            tenantName: tenant.tenantName,
            displayName: tenant.name,
            tenantId: tenant.id,
            version: tenant.version
        };
    };

    plugin.registerFunction('SailPointRawWithFallback', async (args: any[]) => {
        let [primaryPath, fallbackPath, type, id, matchedField, targetWinId] = args;

        try {
            const { client } = getClient();
            let data;
            try {
                data = await client.getResource(primaryPath);
            } catch (e) {
                data = await client.getResource(fallbackPath);
            }
            await bufferUtils.openBuffer(
                id || 'raw',
                data,
                type || 'raw',
                id || primaryPath,
                data,
                matchedField,
                typeof targetWinId === 'number' ? targetWinId : undefined
            );
        } catch (e: any) {
            handleError(plugin.nvim, e, 'fetching ' + (type || 'resource'));
        }
    }, { sync: false });

    plugin.registerFunction('SailPointGetActiveTenant', () => {
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) return null;
        initializeActiveTenant();
        if (activeTenantIndex >= tenants.length) activeTenantIndex = 0;
        return tenants[activeTenantIndex];
    }, { sync: true });

    registerFetchItemsHandler({
        plugin,
        tenantService,
        initializeActiveTenant,
        getActiveTenantIndex: () => activeTenantIndex,
        getClient,
        resourceFetcher,
        globalStorage,
        tenantCache
    });

    registerResourceAndTenantCommands({
        plugin,
        saveCommand,
        tenantCommands,
        resourceCommands,
        bufferUtils,
        tenantService,
        getClient,
        setActiveTenantIndex: (idx) => { activeTenantIndex = idx; },
        getActiveTenantIndex: () => activeTenantIndex,
        globalStorage,
        tenantCache
    });

    registerFetchAllCommands({
        plugin,
        tenantService,
        globalStorage,
        tenantCache,
        resourceFetcher,
        getClient,
        getActiveTenantIndex: () => activeTenantIndex,
        initializeActiveTenant,
    });

    registerSmartLazyFetch({
        plugin,
        tenantService,
        globalStorage,
        tenantCache,
        resourceFetcher,
        getClient,
        getActiveTenantIndex: () => activeTenantIndex,
        initializeActiveTenant,
    });

    registerDebugCommands({
        plugin,
        saveCommand,
        tenantCommands,
        resourceCommands,
        bufferUtils,
        tenantService,
        getClient,
        setActiveTenantIndex: (idx) => { activeTenantIndex = idx; },
        getActiveTenantIndex: () => activeTenantIndex,
        globalStorage,
        tenantCache
    });

    // Register manual cache initialization command for debugging
    plugin.registerCommand('SPIInitCache', async () => {
        try {
            await initializeCache();
        } catch (e: unknown) {
            plugin.nvim.outWrite(`SailPoint: Cache init error: ${(e as Error)?.message || String(e)}\n`);
        }
    }, { sync: false });

    initializeActiveTenant();
    // DON'T auto-call initializeCache here - let Lua sidebar call it when ready
};
