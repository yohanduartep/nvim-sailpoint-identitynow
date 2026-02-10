import { ISCClient } from '../services/ISCClient';
import { TenantService } from '../services/TenantService';

export class ResourceFetcher {
    constructor(private readonly tenantService: TenantService) {}

    public async fetchWithFallback(client: ISCClient, standardCall: () => Promise<any[]>, rawPath: string): Promise<any[]> {
        let items: any[] = [];
        try { 
            items = await standardCall(); 
        } catch (e: any) {
            if (e.message && e.message.includes('404')) {
                const res = await client.getResource(rawPath);
                items = Array.isArray(res) ? res : (res.data ? res.data : []);
            } else { 
                throw e; 
            }
        }
        if (!Array.isArray(items)) return [];
        // deduplicate
        return Array.from(new Map(items.map(item => [item.id || item.name || JSON.stringify(item), item])).values());
    }

    private readonly fetchers: Record<string, (client: ISCClient, version: string, activeTenantIndex: number, query?: string) => Promise<any[]>> = {
        sources: (c, v) => this.fetchWithFallback(c, () => c.getSources(), `/${v}/sources`),
        transforms: (c, v) => this.fetchWithFallback(c, () => c.getTransforms(), `/${v}/transforms`),
        roles: (c, v, _, q) => q ? c.paginatedSearchRoles(q, 50).then(r => r.data) : this.fetchWithFallback(c, () => c.getAllRoles(), `/${v}/roles`),
        'access-profiles': (c, v, _, q) => q ? c.paginatedSearchAccessProfiles(q, 50).then(r => r.data) : this.fetchWithFallback(c, async () => (await c.getAccessProfiles()).data, `/${v}/access-profiles`),
        rules: (c) => this.fetchWithFallback(c, () => c.getConnectorRules(), '/beta/connector-rules'),
        workflows: (c, v) => this.fetchWithFallback(c, () => c.getWorflows(), `/${v}/workflows`),
        apps: (c, v) => this.fetchWithFallback(c, async () => (await c.getPaginatedApplications('')).data, `/${v}/source-apps`),
        identities: (c, _, __, q) => q ? c.searchIdentities(q, 50) : c.listIdentities({}).then(r => r.data),
        campaigns: (c) => c.getPaginatedCampaigns('').then(r => r.data),
        'service-desk': (c) => c.getServiceDesks(),
        'identity-profiles': (c) => c.getIdentityProfiles(),
        forms: (c) => c.listForms(),
        'search-attributes': (c) => c.getSearchAttributes(),
        'identity-attributes': (c) => c.getIdentityAttributes(),
        tenants: (_, __, idx) => Promise.resolve(this.tenantService.getTenants().map((t, i) => ({ id: t.id, name: t.name, tenantName: t.tenantName, isActive: i === idx, version: t.version })))
    };

    public async fetchItemsInternal(type: string, getClient: () => { client: ISCClient, version: string }, activeTenantIndex: number, query?: string): Promise<any[]> {
        const { client, version } = getClient();
        const fetcher = this.fetchers[type];
        if (fetcher) {
            return await fetcher(client, version, activeTenantIndex, query);
        }
        return [];
    }
}
