import { AxiosInstance, AxiosResponse } from 'axios';
import {
    AccessProfile,
    Configuration,
    Paginator,
    Role,
    Search,
    SearchApi
} from 'sailpoint-api-client';
import { DEFAULT_ACCESSPROFILES_QUERY_PARAMS } from '../../models/AccessProfiles';
import { DEFAULT_ROLES_QUERY_PARAMS } from '../../models/Roles';

type ApiKind = 'sources' | 'workflows' | 'roles' | 'accessProfiles';

interface GovernanceDeps {
    getApiConfiguration: () => Promise<Configuration>;
    getAxiosWithInterceptors: () => AxiosInstance;
    getApiFor: (kind: ApiKind, config: Configuration) => any;
    getVersionedPayloadKey: (baseKey: string) => string;
}

const SEARCH_INDEX_SORT = ['name'];

export class GovernanceDomain {
    constructor(private readonly deps: GovernanceDeps) {}

    public async getAccessProfiles(limit?: number): Promise<AxiosResponse<AccessProfile[]>> {
        const api = this.deps.getApiFor('accessProfiles', await this.deps.getApiConfiguration());
        return api.listAccessProfiles({ ...DEFAULT_ACCESSPROFILES_QUERY_PARAMS, limit: limit || 250 });
    }

    public async getAccessProfileById(id: string): Promise<AccessProfile> {
        const api = this.deps.getApiFor('accessProfiles', await this.deps.getApiConfiguration());
        return (await api.getAccessProfile({ id })).data;
    }

    public async getAllRoles(limit?: number): Promise<Role[]> {
        const api = this.deps.getApiFor('roles', await this.deps.getApiConfiguration());
        if (limit) {
            return (await api.listRoles({ limit, sorters: 'name' })).data as Role[];
        }
        const result = await Paginator.paginate(api, api.listRoles, { sorters: 'name' });
        return result.data as Role[];
    }

    public async getRoles(query: Record<string, unknown>): Promise<AxiosResponse<Role[]>> {
        const api = this.deps.getApiFor('roles', await this.deps.getApiConfiguration());
        return api.listRoles({ ...DEFAULT_ROLES_QUERY_PARAMS, ...query });
    }

    public async paginatedSearchRoles(query: string, limit: number): Promise<AxiosResponse<any[]>> {
        const search: Search = { indices: ['roles'], query: { query }, sort: SEARCH_INDEX_SORT };
        const api = new SearchApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return api.searchPost({ search, limit });
    }

    public async paginatedSearchAccessProfiles(query: string, limit: number): Promise<AxiosResponse<any[]>> {
        const search: Search = { indices: ['accessprofiles'], query: { query }, sort: SEARCH_INDEX_SORT };
        const api = new SearchApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return api.searchPost({ search, limit });
    }

    public async createRole(role: Role): Promise<Record<string, unknown>> {
        const api = this.deps.getApiFor('roles', await this.deps.getApiConfiguration());
        const payloadKey = this.deps.getVersionedPayloadKey('role');
        const payload = { [payloadKey]: role } as Record<string, unknown>;
        return (await api.createRole(payload)).data as Record<string, unknown>;
    }

    public async createAccessProfile(ap: AccessProfile): Promise<Record<string, unknown>> {
        const api = this.deps.getApiFor('accessProfiles', await this.deps.getApiConfiguration());
        const payloadKey = this.deps.getVersionedPayloadKey('accessProfile');
        const payload = { [payloadKey]: ap } as Record<string, unknown>;
        return (await api.createAccessProfile(payload)).data as Record<string, unknown>;
    }
}
