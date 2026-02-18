import { AxiosInstance, AxiosResponse } from 'axios';
import {
    AppsBetaApi,
    Configuration,
    CustomFormsBetaApi,
    IdentitiesBetaApi,
    IdentityAttributesBetaApi,
    IdentityProfilesApi,
    Search,
    SearchApi,
    SearchAttributeConfigurationBetaApi,
    ServiceDeskIntegrationApi
} from 'sailpoint-api-client';
import { compareByName } from '../../utils';

const TOTAL_COUNT_HEADER = 'x-total-count';

type ItemRecord = Record<string, unknown>;
type IdentityQuery = Record<string, unknown>;

interface IdentityCatalogDeps {
    version: string;
    getApiConfiguration: () => Promise<Configuration>;
    getAxiosWithInterceptors: () => AxiosInstance;
    getAxios: () => Promise<AxiosInstance>;
}

export class IdentityCatalogDomain {
    constructor(private readonly deps: IdentityCatalogDeps) {}

    public async getAllIdentities(onProgress?: (count: number, total: number) => void): Promise<ItemRecord[]> {
        const api = new SearchApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const firstSearch: Search = { indices: ['identities'], query: { query: '*' } };
        const firstResp = await api.searchPost({ search: firstSearch, limit: 1, count: true });
        const total = parseInt(firstResp.headers[TOTAL_COUNT_HEADER] || '0', 10);

        const items: ItemRecord[] = [];
        let searchAfter: string[] | undefined;
        const limit = 250;
        const sort = ['id'];

        while (true) {
            const search: Search = {
                indices: ['identities'],
                query: { query: '*' },
                sort,
                searchAfter
            };

            const resp = await api.searchPost({ search, limit });
            const data = resp.data as ItemRecord[];
            if (!data || data.length === 0) break;

            items.push(...data);
            onProgress?.(items.length, total);
            if (data.length < limit) break;

            const lastItem = data[data.length - 1];
            const lastId = typeof lastItem?.id === 'string' ? lastItem.id : undefined;
            if (!lastId) break;
            searchAfter = [lastId];
        }
        return items;
    }

    public async listIdentities(query: IdentityQuery): Promise<AxiosResponse<ItemRecord[]>> {
        const api = new IdentitiesBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return api.listIdentities(query) as unknown as AxiosResponse<ItemRecord[]>;
    }

    public async searchIdentities(query: string, limit?: number): Promise<{ items: ItemRecord[]; totalCount: number }> {
        const api = new SearchApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const search: Search = { indices: ['identities'], query: { query }, sort: ['name'] };
        const resp = await api.searchPost({ search, limit, count: true });
        const totalCount = parseInt(resp.headers[TOTAL_COUNT_HEADER] || '0', 10);
        return { items: resp.data as ItemRecord[], totalCount };
    }

    public async listForms(limit?: number): Promise<ItemRecord[]> {
        const api = new CustomFormsBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return ((await api.searchFormDefinitionsByTenant({ offset: 0, limit: limit || 100 })).data.results || []) as ItemRecord[];
    }

    public async getSearchAttributes(): Promise<ItemRecord[]> {
        const api = new SearchAttributeConfigurationBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.getSearchAttributeConfig()).data.sort(compareByName) as ItemRecord[];
    }

    public async getIdentityAttributes(): Promise<ItemRecord[]> {
        const api = new IdentityAttributesBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.listIdentityAttributes({})).data.sort(compareByName) as unknown as ItemRecord[];
    }

    public async getPaginatedApplications(filters: string, limit?: number): Promise<AxiosResponse<ItemRecord[]>> {
        const api = new AppsBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return api.listAllSourceApp({ offset: 0, limit: limit || 100, filters, sorters: 'name' }) as unknown as AxiosResponse<ItemRecord[]>;
    }

    public async getPaginatedCampaigns(filters: string, limit?: number): Promise<AxiosResponse<ItemRecord[]>> {
        const axios = await this.deps.getAxios();
        return axios.get(`/${this.deps.version}/campaigns`, { params: { filters, limit: limit || 100, sorters: '-created' } });
    }

    public async getServiceDesks(limit?: number): Promise<ItemRecord[]> {
        const api = new ServiceDeskIntegrationApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const resp = await api.getServiceDeskIntegrations({ sorters: 'name' });
        const items = resp.data as unknown as ItemRecord[];
        return limit ? items.slice(0, limit) : items;
    }

    public async getIdentityProfiles(limit?: number): Promise<ItemRecord[]> {
        const api = new IdentityProfilesApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const resp = await api.listIdentityProfiles({ sorters: 'name' });
        const items = resp.data as unknown as ItemRecord[];
        return limit ? items.slice(0, limit) : items;
    }

    public async processIdentities(identityIds: string[]): Promise<ItemRecord> {
        const api = new IdentitiesBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.startIdentityProcessing({ processIdentitiesRequestBeta: { identityIds } })).data as ItemRecord;
    }

    public async synchronizeAttributes(identityId: string): Promise<ItemRecord> {
        const api = new IdentitiesBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.synchronizeAttributesForIdentity({ identityId })).data as unknown as ItemRecord;
    }
}
