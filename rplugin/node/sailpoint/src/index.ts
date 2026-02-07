import { NvimPlugin } from 'neovim';
import { setNvim, globalStorage, secretStorage } from './vscode';
import { TenantService } from './services/TenantService';
import { ISCClient } from './services/ISCClient';
import { SailPointISCAuthenticationProvider } from './services/AuthenticationProvider';
import * as fastJsonPatch from 'fast-json-patch';
import { BufferUtils } from './utils/BufferUtils';
import { SaveCommand } from './commands/SaveCommand';
import { TenantCommands } from './commands/TenantCommands';
import { ResourceFetcher } from './commands/ResourceFetcher';
import { ResourceCommands } from './commands/ResourceCommands';
import { handleError } from './errors';

let activeTenantIndex = 0;
const ACTIVE_TENANT_ID_KEY = 'sailpoint.activeTenantId';
const RESOURCE_CACHE_PREFIX = 'sailpoint.cache.';
const ALL_RESOURCE_TYPES = ['tenants', 'sources', 'transforms', 'rules', 'workflows', 'access-profiles', 'roles', 'apps', 'identities', 'campaigns', 'service-desk', 'identity-profiles', 'forms', 'search-attributes', 'identity-attributes'];

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
        for (const type of ALL_RESOURCE_TYPES) {
            const cachedItems = globalStorage.get<any[]>(RESOURCE_CACHE_PREFIX + type);
            if (cachedItems) {
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, cachedItems, '']);
            }
        }
    };

    const getClient = () => {
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) throw new Error('No tenants configured.');
        if (activeTenantIndex >= tenants.length) activeTenantIndex = 0;
        const tenant = tenants[activeTenantIndex];
        return {
            client: new ISCClient(tenant.id!, tenant.tenantName!, tenant.version || 'v3'),
            tenantName: tenant.name,
            tenantId: tenant.id,
            version: tenant.version || 'v3'
        };
    };

    plugin.registerFunction('SailPointRawWithFallback', async (args: any[]) => {
        const [primaryPath, fallbackPath, type, id] = args;
        try {
            const { client } = getClient();
            let data;
            try {
                data = await client.getResource(primaryPath);
            } catch (e) {
                data = await client.getResource(fallbackPath);
            }
            await bufferUtils.openBuffer(id || 'raw', data, type || 'raw', id || primaryPath, data);
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

    plugin.registerFunction('SailPointFetchItems', async (args: any[]) => {
        try { 
            const tenants = tenantService.getTenants();
            if (tenants.length > 0 && args[0]?.toLowerCase() !== 'tenants') initializeActiveTenant();
            return await resourceFetcher.fetchItemsInternal(args[0], getClient, activeTenantIndex, args[1]); 
        } 
        catch (e: any) { return []; }
    }, { sync: true });

    plugin.registerCommand('SailPointSave', async () => {
        await saveCommand.execute(getClient);
    }, { sync: false });

    plugin.registerFunction('SPIAddTenant', async (args: any[]) => {
        await tenantCommands.addTenant(args);
    }, { sync: false });

    plugin.registerFunction('SPIRemoveTenant', async (args: any[]) => { 
        await tenantCommands.removeTenant(args, ALL_RESOURCE_TYPES, RESOURCE_CACHE_PREFIX, globalStorage);
    }, { sync: false });

    plugin.registerCommand('SPIPrefetchAll', async () => {
        initializeActiveTenant();
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) {
            for (const type of ALL_RESOURCE_TYPES) {
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, [], 'No tenants configured.']);
                await globalStorage.update(RESOURCE_CACHE_PREFIX + type, null);
            }
            return;
        }
        for (const type of ALL_RESOURCE_TYPES) {
            try {
                const items = await resourceFetcher.fetchItemsInternal(type, getClient, activeTenantIndex);
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, items, '']);
                await globalStorage.update(RESOURCE_CACHE_PREFIX + type, items);
            } catch (e: any) {
                await plugin.nvim.executeLua('SailPointUpdateCache(...)', [type, null, e.message || String(e)]);
            }
        }
    }, { sync: false });

    plugin.registerCommand('SPISwitchTenant', async (args: any[]) => {
        await tenantCommands.switchTenant(args, async (idx) => {
            activeTenantIndex = idx;
            const tenants = tenantService.getTenants();
            await globalStorage.update(ACTIVE_TENANT_ID_KEY, tenants[idx].id);
        });
    }, { sync: true, nargs: '1' });

    plugin.registerCommand('SPIAdd', async (args: any[]) => { await bufferUtils.openBuffer(args[1] || 'New', {}, args[0], '', {}); }, { sync: false, nargs: '*' });
    
    plugin.registerCommand('SPIAggregate', async (args: any[]) => {
        await resourceCommands.aggregate(args, getClient);
    }, { sync: false, nargs: '*' });
    
    plugin.registerCommand('SPIDeleteResource', async (args: any[]) => {
        await resourceCommands.deleteResource(args, getClient);
    }, { sync: false, nargs: '1' });

    plugin.registerCommand('SPIGetSource', async (a: any[]) => { 
        await resourceCommands.getSource(a, getClient);
    }, { sync: false, nargs: '1' });
    
    plugin.registerCommand('SPIGetTransform', async (a: any[]) => { 
        await resourceCommands.getTransform(a, getClient);
    }, { sync: false, nargs: '1' });
    
    plugin.registerCommand('SPIGetRole', async (a: any[]) => { 
        await resourceCommands.getRole(a, getClient);
    }, { sync: false, nargs: '1' });
    
    plugin.registerCommand('SPIGetAccessProfile', async (a: any[]) => { 
        await resourceCommands.getAccessProfile(a, getClient);
    }, { sync: false, nargs: '1' });
    
    plugin.registerCommand('SPIGetConnectorRule', async (a: any[]) => { 
        await resourceCommands.getConnectorRule(a, getClient);
    }, { sync: false, nargs: '1' });
    
    plugin.registerCommand('SPIGetWorkflow', async (a: any[]) => { 
        await resourceCommands.getWorkflow(a, getClient);
    }, { sync: false, nargs: '1' });

    plugin.registerCommand('SPIRaw', async (args: any[]) => { 
        await resourceCommands.getRaw(args, getClient);
    }, { sync: false, nargs: '1' });
    
    plugin.registerCommand('SPIShowPatch', async () => {
        const buffer = await plugin.nvim.buffer;
        try {
            const originalStr = await buffer.getVar('sailpoint_original') as string;
            const lines = await buffer.getLines({ start: 0, end: -1, strictIndexing: false });
            const patch = fastJsonPatch.compare(JSON.parse(originalStr), JSON.parse(lines.join('\n')));
            await bufferUtils.openBuffer('patch_preview', patch, 'preview', 'patch');
        } catch(e: any) { handleError(plugin.nvim, e, 'patch preview'); }
    }, { sync: false });

    plugin.registerCommand('SPIDryRun', async () => {
        const buffer = await plugin.nvim.buffer;
        try {
            const type = await buffer.getVar('sailpoint_type') as string;
            const id = await buffer.getVar('sailpoint_id') as string;
            const originalStr = await buffer.getVar('sailpoint_original') as string;
            const lines = await buffer.getLines({ start: 0, end: -1, strictIndexing: false });
            const newContent = JSON.parse(lines.join('\n'));
            const patchOps = fastJsonPatch.compare(JSON.parse(originalStr || '{}'), newContent);
            const { tenantName } = getClient();
            const session = await SailPointISCAuthenticationProvider.getInstance().getSessionByTenant(tenantName);
            const token = session?.accessToken || "TOKEN";
            let output = [`# Dry Run for ${type} ${id}`, "", `# PATCH (v3)`, `curl -X PATCH "https://${tenantName}/${type}s/${id}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json-patch+json" -d '${JSON.stringify(patchOps)}'`, "", `# PUT (Mock Style)`, `curl -X PUT "https://${tenantName}/${type}s/${id}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${JSON.stringify(newContent)}'`];
            await bufferUtils.openBuffer('dry_run', output, 'debug', 'dry_run');
        } catch(e: any) { handleError(plugin.nvim, e, 'dry run'); }
    }, { sync: false });

    plugin.registerCommand('SPIDebug', async () => {
        const tenants = tenantService.getTenants();
        const active = tenants[activeTenantIndex];
        const { version } = tenants.length > 0 ? getClient() : { version: 'N/A' };
        plugin.nvim.outWrite(`Active: ${active?.name || 'None'} (ID: ${active?.id || 'N/A'})\nAPI: ${version}\n`);
    }, { sync: false });

    plugin.registerCommand('SailPointHelp', async () => {
        const help = [
            "SailPoint Neovim Help",
            "===================",
            "",
            "Core:",
            "- SailPoint: Browser - Open the main resource browser.",
            "- SetSail: Browser (alias) - Alias for SailPoint.",
            "- SailPointAdd <type> - Add tenants or create new resources (rules, transforms, etc.).",
            "- SailPointAggregate <source|entitlements> <id> - Trigger account or entitlement aggregation.",
            "- SailPointDelete <tenant|resource_path> - Remove a tenant or an API resource.",
            "- SailPointConfig <exp|imp> [path] - Backup or restore tenant configuration.",
            "- SailPointSave (:w) - Save the current buffer to the cloud.",
            "",
            "Debug (SPI):",
            "- SPIDebug - Show active tenant and diagnostics.",
            "- SPIRaw <path> - Fetch raw JSON from an API endpoint.",
            "- SPIRemoveTenant <id> - Remove a tenant configuration.",
            "- SPIClone <type> <id> <newName> - Clone a tenant or source.",
            "- SPIDryRun - Show curl commands for pending changes.",
            "- SPIShowPatch - Display JSON Patch for pending changes.",
            "- SPIPrefetchAll - Force refresh of local cache.",
            "- SPIPingCluster <id> - Check connectivity of VA clusters.",
            "- SPIInstall - Install backend dependencies."
        ];
        await plugin.nvim.command('tabnew');
        const b = await plugin.nvim.buffer;
        await b.setOption('buftype', 'nofile');
        await b.setLines(help, { start: 0, end: -1, strictIndexing: false });
    }, { sync: false });

    initializeActiveTenant();
    initializeCache();
};
