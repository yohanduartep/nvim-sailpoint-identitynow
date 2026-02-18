import { NvimPlugin } from 'neovim';
import * as fastJsonPatch from 'fast-json-patch';
import { ResourceCommands } from './commands/ResourceCommands';
import { SaveCommand } from './commands/SaveCommand';
import { TenantCommands } from './commands/TenantCommands';
import { BufferUtils } from './utils/BufferUtils';
import { TenantService } from './services/TenantService';
import { SailPointISCAuthenticationProvider } from './services/AuthenticationProvider';
import { handleError } from './errors';
import { ACTIVE_TENANT_ID_KEY, ALL_RESOURCE_TYPES, RESOURCE_CACHE_PREFIX } from './constants';
import { ISCClient } from './services/ISCClient';
import { RESOURCE_REGISTRY } from './resourceRegistry';
import { sortItems } from './cacheUtils';

type CommandArg = string | number | undefined;
type CommandArgs = CommandArg[];

type GetClient = () => {
    client: ISCClient;
    tenantName: string;
    tenantId: string;
    version: string;
};

interface GlobalStorageLike {
    update: (key: string, value: unknown) => Promise<void>;
}

interface TenantCacheLike {
    clearTenant: (tenantId: string) => Promise<number>;
    get: (tenantId: string, resourceType: string, subId?: string) => Promise<{ value: Record<string, unknown>[]; timestamp: number } | undefined>;
}

interface SharedDeps {
    plugin: NvimPlugin;
    saveCommand: SaveCommand;
    tenantCommands: TenantCommands;
    resourceCommands: ResourceCommands;
    bufferUtils: BufferUtils;
    tenantService: TenantService;
    getClient: GetClient;
    setActiveTenantIndex: (idx: number) => void;
    getActiveTenantIndex: () => number;
    globalStorage: GlobalStorageLike;
    tenantCache: TenantCacheLike;
}

const toCommandArgs = (args: unknown[]): CommandArgs =>
    args.map((value) => {
        if (typeof value === 'string' || typeof value === 'number') return value;
        if (value == null) return undefined;
        return String(value);
    });
const toStringArg = (value: CommandArg): string => String(value ?? '');
const toOptionalStringArg = (value: CommandArg): string | undefined => {
    if (value == null) return undefined;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
};
const toOptionalNumberArg = (value: CommandArg): number | undefined => {
    if (typeof value === 'number' && value > 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        const parsed = Number(value);
        return parsed > 0 ? parsed : undefined;
    }
    return undefined;
};

export function registerResourceAndTenantCommands(deps: SharedDeps) {
    const {
        plugin,
        saveCommand,
        tenantCommands,
        resourceCommands,
        bufferUtils,
        tenantService,
        getClient,
        setActiveTenantIndex,
        globalStorage,
        tenantCache
    } = deps;

    const registerArrayCommand = (
        name: string,
        handler: (args: CommandArgs) => Promise<void>,
        opts: { sync: boolean; nargs?: string }
    ) => {
        plugin.registerCommand(name, async (args: unknown[]) => {
            await handler(toCommandArgs(args));
        }, opts);
    };

    const registerArrayFunction = (
        name: string,
        handler: (args: CommandArgs) => Promise<void>,
        opts: { sync: boolean; nargs?: string }
    ) => {
        plugin.registerFunction(name, async (args: unknown[]) => {
            await handler(toCommandArgs(args));
        }, opts);
    };

    plugin.registerCommand('SailPointSave', async () => {
        await saveCommand.execute(getClient);
    }, { sync: false });

    registerArrayFunction('SPIAddTenant', async (args) => {
        await tenantCommands.addTenant(args);
        // Auto-fetch resources after adding tenant
        try {
            plugin.nvim.outWrite('\nSailPoint: Fetching resources for new tenant...\n');
            await plugin.nvim.command('SPIFetchAll');
        } catch (e: unknown) {
            plugin.nvim.outWrite(`SailPoint: Auto-fetch failed: ${(e as Error)?.message || String(e)}\n`);
        }
    }, { sync: false });

    registerArrayFunction('SPIRemoveTenant', async (args) => {
        await tenantCommands.removeTenant(args, ALL_RESOURCE_TYPES, RESOURCE_CACHE_PREFIX, globalStorage, tenantCache);
    }, { sync: false });

    registerArrayCommand('SPISwitchTenant', async (args) => {
        await tenantCommands.switchTenant(args, async (idx) => {
            setActiveTenantIndex(idx);
            const tenants = tenantService.getTenants();
            await globalStorage.update(ACTIVE_TENANT_ID_KEY, tenants[idx].id);
        });
    }, { sync: true, nargs: '1' });

    registerArrayCommand('SPIGetTenant', async (args) => {
        try {
            const id = toStringArg(args[0]);
            const tenant = tenantService.getTenants().find(t => t.id === id);
            if (!tenant) {
                throw new Error(`Tenant not found: ${id}`);
            }
            await bufferUtils.openBuffer(
                tenant.name || tenant.id || 'tenant',
                tenant,
                'tenant',
                tenant.id || id,
                tenant,
                toOptionalStringArg(args[1]),
                toOptionalNumberArg(args[2])
            );
        } catch (e) {
            handleError(plugin.nvim, e, 'getting tenant');
        }
    }, { sync: false, nargs: '*' });

    registerArrayCommand('SPIAdd', async (args) => {
        await bufferUtils.openBuffer(toStringArg(args[1]) || 'New', {}, toStringArg(args[0]), '', {});
    }, { sync: false, nargs: '*' });

    registerArrayCommand('SPIAggregate', async (args) => {
        await resourceCommands.aggregate(args, getClient);
    }, { sync: false, nargs: '*' });

    registerArrayCommand('SPIDeleteResource', async (args) => {
        await resourceCommands.deleteResource(args, getClient);
    }, { sync: false, nargs: '1' });

    const registryOpeners = RESOURCE_REGISTRY
        .filter((entry) =>
            entry.openConfig.type === 'command' &&
            !!entry.openConfig.command &&
            entry.openConfig.command !== 'SPIGetTenant' &&
            !!entry.commandOpen
        )
        .map((entry) => entry.openConfig.command as string);

    for (const cmd of registryOpeners) {
        registerArrayCommand(cmd, async (args) => {
            await resourceCommands.openFromCommand(cmd, args, getClient);
        }, { sync: false, nargs: '*' });
    }

    registerArrayCommand('SPIRaw', async (args) => {
        await resourceCommands.getRaw(args, getClient);
    }, { sync: false, nargs: '*' });

    registerArrayCommand('SPISearch', async (args) => {
        try {
            // Join all arguments back into a single query string
            const query = args.map(arg => toStringArg(arg)).join(' ').trim();
            if (!query) {
                throw new Error('Search query required');
            }
            
            // Parse query to determine resource type and search terms
            // Format: "identity identityState:active" or just "identityState:active"
            const parts = query.trim().split(/\s+/);
            let index = 'all';
            let searchQuery = query;
            
            // Map of query prefixes to resource types
            const prefixMap: Record<string, string> = {
                'tenant': 'tenants',
                'tenants': 'tenants',
                'identity': 'identities',
                'identities': 'identities',
                'source': 'sources',
                'sources': 'sources',
                'role': 'roles',
                'roles': 'roles',
                'accessprofile': 'access-profiles',
                'access-profile': 'access-profiles',
                'access-profiles': 'access-profiles',
                'entitlement': 'entitlements',
                'entitlements': 'entitlements',
                'account': 'accounts',
                'accounts': 'accounts',
                'transform': 'transforms',
                'transforms': 'transforms',
                'workflow': 'workflows',
                'workflows': 'workflows',
                'app': 'apps',
                'apps': 'apps',
                'application': 'apps',
                'applications': 'apps',
                'rule': 'rules',
                'rules': 'rules',
                'campaign': 'campaigns',
                'campaigns': 'campaigns',
                'form': 'forms',
                'forms': 'forms',
                'identity-attribute': 'identity-attributes',
                'identity-attributes': 'identity-attributes',
                'identityattribute': 'identity-attributes',
                'identityattributes': 'identity-attributes',
                'identity-profile': 'identity-profiles',
                'identity-profiles': 'identity-profiles',
                'identityprofile': 'identity-profiles',
                'identityprofiles': 'identity-profiles',
                'search-attribute': 'search-attributes',
                'search-attributes': 'search-attributes',
                'searchattribute': 'search-attributes',
                'searchattributes': 'search-attributes',
                'service-desk': 'service-desk',
                'servicedesk': 'service-desk'
            };
            
            // Check if first word is a resource type prefix
            const firstWord = parts[0].toLowerCase();
            if (prefixMap[firstWord]) {
                index = prefixMap[firstWord];
                searchQuery = parts.length > 1 ? parts.slice(1).join(' ') : '*';
            }
            
            await plugin.nvim.outWrite(`SailPoint: Searching ${index} for "${searchQuery}"\n`);
            const { client, tenantId } = getClient();
            const results = await client.search(index, searchQuery);
            
            await plugin.nvim.command(`echo "SailPoint: Search complete - Found ${results.length} result${results.length === 1 ? '' : 's'}"`);
            
            const groupedResults: Record<string, unknown[]> = {};
            for (const item of results) {
                const rType = (item as { resource_type?: string }).resource_type || 'other';
                if (!groupedResults[rType]) {
                    groupedResults[rType] = [];
                }
                groupedResults[rType].push(item);
            }
            
            // Map resource type back to search prefix for context preservation
            const reverseMap: Record<string, string> = {
                'tenants': 'tenant',
                'identities': 'identity',
                'sources': 'source',
                'accounts': 'accounts',
                'roles': 'role',
                'access-profiles': 'accessprofile',
                'entitlements': 'entitlement',
                'transforms': 'transform',
                'workflows': 'workflow',
                'apps': 'app',
                'rules': 'rule',
                'campaigns': 'campaign',
                'forms': 'form',
                'identity-attributes': 'identity-attribute',
                'identity-profiles': 'identity-profile',
                'search-attributes': 'search-attribute',
                'service-desk': 'service-desk'
            };
            const searchContext = index === 'all' ? 'identity' : (reverseMap[index] || index);
            
            await plugin.nvim.executeLua('SailPointSetSearchResults(...)', [groupedResults, searchQuery, searchContext]);
        } catch (e) {
            handleError(plugin.nvim, e, 'search');
        }
    }, { sync: false, nargs: '*' });
}

export function registerDebugCommands(deps: SharedDeps) {
    const {
        plugin,
        bufferUtils,
        tenantService,
        getClient,
        getActiveTenantIndex,
        globalStorage,
        tenantCache
    } = deps;

    plugin.registerCommand('SPIShowPatch', async () => {
        const buffer = await plugin.nvim.buffer;
        try {
            const originalStr = await buffer.getVar('sailpoint_original') as string;
            const lines = await buffer.getLines({ start: 0, end: -1, strictIndexing: false });
            const patch = fastJsonPatch.compare(JSON.parse(originalStr), JSON.parse(lines.join('\n')));
            await bufferUtils.openBuffer('patch_preview', patch, 'preview', 'patch');
        } catch (e) {
            handleError(plugin.nvim, e, 'patch preview');
        }
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
            const { tenantName, tenantId, version } = getClient();
            const session = await SailPointISCAuthenticationProvider.getInstance().getSessionByTenant(tenantId!);
            const token = session?.accessToken || 'TOKEN';
            const output = [
                `# Dry Run for ${type} ${id}`,
                '',
                `# PATCH (${version})`,
                `curl -X PATCH "https://${tenantName}/${version}/${type}s/${id}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json-patch+json" -d '${JSON.stringify(patchOps)}'`,
                '',
                '# PUT (Mock Style)',
                `curl -X PUT "https://${tenantName}/${version}/${type}s/${id}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${JSON.stringify(newContent)}'`
            ];
            await bufferUtils.openBuffer('dry_run', output, 'debug', 'dry_run');
        } catch (e) {
            handleError(plugin.nvim, e, 'dry run');
        }
    }, { sync: false });

    plugin.registerCommand('SPIDebugCache', async () => {
        const vscode = await import('./vscode');
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) {
            plugin.nvim.outWrite('No tenants configured\n');
            return;
        }
        
        const activeTenant = tenants[getActiveTenantIndex()];
        const tenantId = activeTenant.id!;
        
        plugin.nvim.outWrite(`\n=== Cache Debug for tenant: ${tenantId} ===\n`);
        
        // Check accounts_summary
        const summary = vscode.globalStorage.get<Record<string, unknown>[]>(`${tenantId}_accounts_summary`);
        plugin.nvim.outWrite(`\nAccounts Summary: ${summary ? `Array[${summary.length}]` : 'null'}\n`);
        if (summary && summary.length > 0) {
            plugin.nvim.outWrite(`  First 3 sources:\n`);
            summary.slice(0, 3).forEach((s: any) => {
                plugin.nvim.outWrite(`    - ${s.name} (${s.id}): ${s.count || 0} accounts\n`);
            });
        }
        
        const accountsTotal = vscode.globalStorage.get<number>(`${tenantId}_accounts_total`);
        plugin.nvim.outWrite(`Accounts Total: ${accountsTotal || 0}\n`);
        
        // Check sailpoint.cache.accounts
        const accountsCache = vscode.globalStorage.get<Record<string, unknown>[]>(`${tenantId}_sailpoint.cache.accounts`);
        plugin.nvim.outWrite(`\nCache (sailpoint.cache.accounts): ${accountsCache ? `Array[${accountsCache.length}]` : 'null'}\n`);
        
        plugin.nvim.outWrite('\n=== End Cache Debug ===\n');
    }, { sync: false });

    plugin.registerFunction('SPILoadAll', async (args: unknown[]) => {
        const vscode = await import('./vscode');
        const resourceType = args[0] as string;
        if (!resourceType) {
            plugin.nvim.outWrite('SPILoadAll: Please specify a resource type\n');
            return;
        }
        
        const tenants = tenantService.getTenants();
        if (tenants.length === 0) {
            plugin.nvim.outWrite('No tenants configured\n');
            return;
        }
        
        const activeTenant = tenants[getActiveTenantIndex()];
        const tenantId = activeTenant.id!;
        
        // Load all items from tenantCache
        const cached = await tenantCache.get(tenantId, resourceType);
        if (!cached || !cached.value || !Array.isArray(cached.value) || cached.value.length === 0) {
            plugin.nvim.outWrite(`SPILoadAll: No cached data for ${resourceType}\n`);
            return;
        }
        
        const items = cached.value as Record<string, unknown>[];
        const total = vscode.globalStorage.get<number>(`${tenantId}_${RESOURCE_CACHE_PREFIX}${resourceType}_total`) || items.length;
        
        // Sort items before sending to Lua
        const sorted = sortItems(items);
        
        // Send all sorted items to Lua
        await plugin.nvim.executeLua('SailPointUpdateCache(...)', [resourceType, { items: sorted, totalCount: total }, '']);
        plugin.nvim.outWrite(`SPILoadAll: Loaded ${sorted.length} items for ${resourceType}\n`);
    }, { sync: false });

    plugin.registerCommand('SPIDebug', async () => {
        const { setDebugMode, isDebugMode } = await import('./index');
        const currentMode = isDebugMode();
        setDebugMode(!currentMode);
        const newMode = !currentMode ? 'ENABLED' : 'DISABLED';
        plugin.nvim.outWrite(`SailPoint: Debug mode ${newMode}\n`);
        
        if (!currentMode) {
            const tenants = tenantService.getTenants();
            const active = tenants[getActiveTenantIndex()];
            const { version } = tenants.length > 0 ? getClient() : { version: 'N/A' };
            plugin.nvim.outWrite(`Active: ${active?.name || 'None'} (ID: ${active?.id || 'N/A'})\nAPI: ${version}\n`);
        }
    }, { sync: false });

    plugin.registerCommand('SailPointHelp', async () => {
        const help = [
            'SailPoint Neovim Help',
            '===================',
            '',
            'Core:',
            '- SetSail - Open or toggle the SailPoint sidebar.',
            '- SailPointAdd <type> - Add tenants or create new resources (rules, transforms, etc.).',
            '- SailPointAggregate <source|entitlements> <id> - Trigger account or entitlement aggregation.',
            '- SailPointDelete <tenant|resource_path> - Remove a tenant or an API resource.',
            '- SailPointConfig <exp|imp> [path] - Backup or restore tenant configuration.',
            '- SailPointSave (:w) - Save the current buffer to the cloud.',
            '',
            'Debug (SPI):',
            '- SPIDebug - Show active tenant and diagnostics.',
            '- SPIRaw <path> - Fetch raw JSON from an API endpoint.',
            '- SPIRemoveTenant <id> - Remove a tenant configuration.',
            '- SPIClone <type> <id> <newName> - Clone a tenant or source.',
            '- SPIDryRun - Show curl commands for pending changes.',
            '- SPIShowPatch - Display JSON Patch for pending changes.',
            '- SPIFetchAll - Force refresh of local cache.',
            '- SPIPingCluster <id> - Check connectivity of VA clusters.',
            '- SPIInstall - Install backend dependencies.'
        ];
        await plugin.nvim.command('tabnew');
        const b = await plugin.nvim.buffer;
        await b.setOption('buftype', 'nofile');
        await b.setLines(help, { start: 0, end: -1, strictIndexing: false });
    }, { sync: false });
}
