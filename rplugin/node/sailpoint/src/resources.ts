export interface ResourceDefinition {
    id: string;
    name: string;
    openConfig: {
        type: 'command' | 'raw' | 'fallback';
        command?: string;
        path?: string;
        fallbackPath?: string;
    }
}

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
    { id: 'tenants', name: 'Tenants', openConfig: { type: 'command', command: 'SPISwitchTenant' } },
    { id: 'access-profiles', name: 'Access Profiles', openConfig: { type: 'command', command: 'SPIGetAccessProfile' } },
    { id: 'apps', name: 'Applications', openConfig: { type: 'raw', path: 'source-apps' } },
    { id: 'campaigns', name: 'Campaigns', openConfig: { type: 'raw', path: 'campaigns' } },
    { id: 'forms', name: 'Forms', openConfig: { type: 'fallback', path: 'forms', fallbackPath: '/beta/forms' } },
    { id: 'identities', name: 'Identities', openConfig: { type: 'raw', path: 'identities' } },
    { id: 'identity-attributes', name: 'Identity Attributes', openConfig: { type: 'fallback', path: 'identity-attributes', fallbackPath: '/beta/identity-attributes' } },
    { id: 'identity-profiles', name: 'Identity Profiles', openConfig: { type: 'raw', path: 'identity-profiles' } },
    { id: 'roles', name: 'Roles', openConfig: { type: 'command', command: 'SPIGetRole' } },
    { id: 'rules', name: 'Rules', openConfig: { type: 'command', command: 'SPIGetConnectorRule' } },
    { id: 'search-attributes', name: 'Search Attribute Config', openConfig: { type: 'fallback', path: 'search-attribute-config', fallbackPath: '/beta/search-attribute-config' } },
    { id: 'service-desk', name: 'Service Desk', openConfig: { type: 'raw', path: 'service-desk-integrations' } },
    { id: 'sources', name: 'Sources', openConfig: { type: 'command', command: 'SPIGetSource' } },
    { id: 'transforms', name: 'Transforms', openConfig: { type: 'command', command: 'SPIGetTransform' } },
    { id: 'workflows', name: 'Workflows', openConfig: { type: 'command', command: 'SPIGetWorkflow' } }
];

export const ALL_RESOURCE_TYPES = RESOURCE_DEFINITIONS.map(d => d.id);
