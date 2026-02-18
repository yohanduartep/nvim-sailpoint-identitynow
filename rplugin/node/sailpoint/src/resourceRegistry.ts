import type { ISCClient } from "./services/ISCClient";

export interface ResourceRegistryEntry {
    id: string;
    name: string;
    openConfig: {
        type: 'command' | 'raw' | 'fallback';
        command?: string;
        path?: string;
        fallbackPath?: string;
        appendId?: boolean;
    };
    metadata?: {
        path: string;
        sorters?: string;
    };
    cachePolicy?: 'default' | 'accounts';
    fetchPolicy?: {
        mode: 'fallback' | 'simple' | 'custom';
        endpoint?: string;
        metadataType?: string;
    };
    commandOpen?: {
        loader: 'byId' | 'roleByIdQuery' | 'transform' | 'searchAttribute' | 'identityAttribute';
        resourceType: string;
        action: string;
        clientMethod?: 'getSourceById' | 'getAccessProfileById' | 'getEntitlement' | 'getConnectorRuleById' | 'getWorflow';
    };
    savePolicy?: {
        createPath?: string;
        updatePath?: string;
        method: 'PATCH' | 'PUT' | 'CUSTOM';
        customCreate?: (client: ISCClient, data: any) => Promise<any>;
        customUpdate?: (client: ISCClient, id: string, data: any) => Promise<any>;
    };
}

export const RESOURCE_REGISTRY: ResourceRegistryEntry[] = [
    { id: 'tenants', name: 'Tenants', openConfig: { type: 'command', command: 'SPIGetTenant' } },
    { id: 'accounts', name: 'Accounts', openConfig: { type: 'raw', path: '/{version}/accounts' }, metadata: { path: 'accounts' }, cachePolicy: 'accounts', fetchPolicy: { mode: 'custom' } },
    {
        id: 'access-profiles',
        name: 'Access Profiles',
        openConfig: { type: 'command', command: 'SPIGetAccessProfile' },
        metadata: { path: 'access-profiles', sorters: '-modified' },
        fetchPolicy: { mode: 'custom' },
        commandOpen: { loader: 'byId', resourceType: 'access-profile', action: 'getting access profile', clientMethod: 'getAccessProfileById' },
        savePolicy: {
            method: 'PATCH',
            updatePath: '/{version}/access-profiles/{id}',
            customCreate: (c, data) => c.createAccessProfile(data)
        }
    },
    { id: 'apps', name: 'Applications', openConfig: { type: 'raw', path: '/{version}/source-apps' }, metadata: { path: 'source-apps' }, fetchPolicy: { mode: 'fallback', endpoint: 'source-apps', metadataType: 'apps' } },
    { id: 'campaigns', name: 'Campaigns', openConfig: { type: 'raw', path: '/{version}/campaigns' }, metadata: { path: 'campaigns', sorters: '-created' }, fetchPolicy: { mode: 'simple', metadataType: 'campaigns' } },
    { id: 'forms', name: 'Forms', openConfig: { type: 'raw', path: '/{version}/forms' }, metadata: { path: 'form-definitions' }, fetchPolicy: { mode: 'simple', metadataType: 'forms' } },
    { id: 'identities', name: 'Identities', openConfig: { type: 'raw', path: '/{version}/identities' }, metadata: { path: 'identities' }, fetchPolicy: { mode: 'custom' } },
    {
        id: 'entitlements',
        name: 'Entitlements',
        openConfig: { type: 'command', command: 'SPIGetEntitlement' },
        metadata: { path: 'entitlements' },
        fetchPolicy: { mode: 'simple', metadataType: 'entitlements' },
        commandOpen: { loader: 'byId', resourceType: 'entitlement', action: 'getting entitlement', clientMethod: 'getEntitlement' }
    },
    {
        id: 'identity-attributes',
        name: 'Identity Attributes',
        openConfig: { type: 'command', command: 'SPIGetIdentityAttribute' },
        fetchPolicy: { mode: 'custom' },
        commandOpen: { loader: 'identityAttribute', resourceType: 'identity-attributes', action: 'getting identity attribute' }
    },
    { id: 'identity-profiles', name: 'Identity Profiles', openConfig: { type: 'raw', path: '/{version}/identity-profiles' }, fetchPolicy: { mode: 'simple', metadataType: 'identity-profiles' } },
    {
        id: 'roles',
        name: 'Roles',
        openConfig: { type: 'command', command: 'SPIGetRole' },
        metadata: { path: 'roles', sorters: '-modified' },
        fetchPolicy: { mode: 'custom' },
        commandOpen: { loader: 'roleByIdQuery', resourceType: 'role', action: 'getting role' },
        savePolicy: {
            method: 'PATCH',
            updatePath: '/{version}/roles/{id}',
            customCreate: (c, data) => c.createRole(data)
        }
    },
    {
        id: 'rules',
        name: 'Rules',
        openConfig: { type: 'command', command: 'SPIGetConnectorRule' },
        metadata: { path: 'connector-rules' },
        fetchPolicy: { mode: 'fallback', endpoint: 'connector-rules', metadataType: 'rules' },
        commandOpen: { loader: 'byId', resourceType: 'connector-rule', action: 'getting connector rule', clientMethod: 'getConnectorRuleById' },
        savePolicy: {
            method: 'CUSTOM',
            createPath: '/{version}/connector-rules',
            customUpdate: (c, _, data) => c.updateConnectorRule(data)
        }
    },
    {
        id: 'search-attributes',
        name: 'Search Attribute Config',
        openConfig: { type: 'command', command: 'SPIGetSearchAttribute' },
        metadata: { path: 'search-attribute-config' },
        fetchPolicy: { mode: 'custom' },
        commandOpen: { loader: 'searchAttribute', resourceType: 'search-attributes', action: 'getting search attribute' }
    },
    { id: 'service-desk', name: 'Service Desk', openConfig: { type: 'raw', path: '/{version}/service-desk-integrations' }, metadata: { path: 'service-desk-integrations' }, fetchPolicy: { mode: 'simple', metadataType: 'service-desk' } },
    {
        id: 'sources',
        name: 'Sources',
        openConfig: { type: 'command', command: 'SPIGetSource' },
        metadata: { path: 'sources', sorters: 'name' },
        fetchPolicy: { mode: 'fallback', endpoint: 'sources', metadataType: 'sources' },
        commandOpen: { loader: 'byId', resourceType: 'source', action: 'getting source', clientMethod: 'getSourceById' },
        savePolicy: {
            method: 'PATCH',
            updatePath: '/{version}/sources/{id}'
        }
    },
    {
        id: 'transforms',
        name: 'Transforms',
        openConfig: { type: 'command', command: 'SPIGetTransform' },
        metadata: { path: 'transforms' },
        fetchPolicy: { mode: 'fallback', endpoint: 'transforms', metadataType: 'transforms' },
        commandOpen: { loader: 'transform', resourceType: 'transform', action: 'getting transform' },
        savePolicy: {
            method: 'PUT',
            createPath: '/{version}/transforms',
            updatePath: '/{version}/transforms/{id}'
        }
    },
    {
        id: 'workflows',
        name: 'Workflows',
        openConfig: { type: 'command', command: 'SPIGetWorkflow' },
        metadata: { path: 'workflows' },
        fetchPolicy: { mode: 'fallback', endpoint: 'workflows', metadataType: 'workflows' },
        commandOpen: { loader: 'byId', resourceType: 'workflow', action: 'getting workflow', clientMethod: 'getWorflow' },
        savePolicy: {
            method: 'PATCH',
            updatePath: '/{version}/workflows/{id}'
        }
    }
];

export type ResourceDefinition = Pick<ResourceRegistryEntry, 'id' | 'name' | 'openConfig'>;
export const RESOURCE_DEFINITIONS: ResourceDefinition[] = RESOURCE_REGISTRY.map(({ id, name, openConfig }) => ({ id, name, openConfig }));
export const ALL_RESOURCE_TYPES = RESOURCE_REGISTRY.map(d => d.id);

export function getRegistryEntry(type: string): ResourceRegistryEntry | undefined {
    if (!type) return undefined;
    const entry = RESOURCE_REGISTRY.find(candidate => candidate.id === type) ||
                  RESOURCE_REGISTRY.find(candidate => candidate.id.startsWith(type)) ||
                  RESOURCE_REGISTRY.find(candidate => type.startsWith(candidate.id));
    
    if (!entry) return undefined;
    return { ...entry, cachePolicy: entry.cachePolicy || 'default' };
}

