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
        return Array.from(new Map(items.map(item => [item.id || item.name || Math.random(), item])).values());
    }

    public async fetchItemsInternal(type: string, getClient: () => { client: ISCClient, version: string }, activeTenantIndex: number, query?: string): Promise<any[]> {
        const { client, version } = getClient();
        
        if (type === 'sources') return await this.fetchWithFallback(client, () => client.getSources(), `/${version}/sources`);
        if (type === 'transforms') return await this.fetchWithFallback(client, () => client.getTransforms(), `/${version}/transforms`);
        if (type === 'roles') return query ? (await client.paginatedSearchRoles(query, 50)).data : await this.fetchWithFallback(client, () => client.getAllRoles(), `/${version}/roles`);
        if (type === 'access-profiles') return query ? (await client.paginatedSearchAccessProfiles(query, 50)).data : await this.fetchWithFallback(client, async () => (await client.getAccessProfiles()).data, `/${version}/access-profiles`);
        if (type === 'rules') return await this.fetchWithFallback(client, () => client.getConnectorRules(), '/beta/connector-rules');
        if (type === 'workflows') return await this.fetchWithFallback(client, () => client.getWorflows(), `/${version}/workflows`);
        if (type === 'apps') return await this.fetchWithFallback(client, async () => (await client.getPaginatedApplications('')).data, `/${version}/source-apps`);
        if (type === 'identities') return query ? await client.searchIdentities(query, 50) : (await client.listIdentities({})).data;
        if (type === 'campaigns') return (await client.getPaginatedCampaigns('')).data;
        if (type === 'service-desk') return await client.getServiceDesks();
        if (type === 'identity-profiles') return await client.getIdentityProfiles();
        if (type === 'forms') return await client.listForms();
        if (type === 'search-attributes') return await client.getSearchAttributes();
        if (type === 'identity-attributes') return await client.getIdentityAttributes();
        if (type === 'tenants') {
            const tenants = this.tenantService.getTenants();
            return tenants.map((t, i) => ({ id: t.id, name: t.name, tenantName: t.tenantName, isActive: i === activeTenantIndex, version: t.version }));
        }
        return [];
    }
}
