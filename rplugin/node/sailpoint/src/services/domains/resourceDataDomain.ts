import { AxiosInstance } from 'axios';
import {
    Configuration,
    EntitlementsBetaApi,
    Paginator,
    Transform,
    TransformsApi
} from 'sailpoint-api-client';
import { compareByName } from '../../utils';

const CONTENT_TYPE_FORM_JSON_PATCH = 'application/json-patch+json';

interface ResourceDataDeps {
    version: string;
    getApiConfiguration: () => Promise<Configuration>;
    getAxiosWithInterceptors: () => AxiosInstance;
    getAxios: (contentType?: string) => Promise<AxiosInstance>;
}

export class ResourceDataDomain {
    constructor(private readonly deps: ResourceDataDeps) {}

    public async listEntitlements(filters?: string, limit?: number): Promise<Record<string, unknown>[]> {
        const api = new EntitlementsBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        if (limit) {
            const resp = await api.listEntitlements({ filters, limit, sorters: 'name' });
            return resp.data as Record<string, unknown>[];
        }
        const result = await Paginator.paginate(api, api.listEntitlements, { filters, sorters: 'name' });
        return result.data as Record<string, unknown>[];
    }

    public async getEntitlement(id: string): Promise<Record<string, unknown>> {
        const api = new EntitlementsBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.getEntitlement({ id })).data as Record<string, unknown>;
    }

    public async getTransforms(limit?: number): Promise<Transform[]> {
        const api = new TransformsApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        if (limit) {
            return (await api.listTransforms({ limit })).data.sort(compareByName) as Transform[];
        }
        const result = await Paginator.paginate(api, api.listTransforms);
        return (result.data as Transform[]).sort(compareByName);
    }

    public async getTransformByName(name: string): Promise<Transform> {
        const api = new TransformsApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const resp = await api.listTransforms({ filters: `name eq "${name}"`, count: true });
        return resp.data[0];
    }

    public async getTransformById(id: string): Promise<Transform> {
        return (await (await this.deps.getAxios()).get(`/${this.deps.version}/transforms/${id}`)).data;
    }

    public async getResource(path: string): Promise<unknown> {
        return (await (await this.deps.getAxios()).get(path)).data as unknown;
    }

    public async createResource(path: string, data: unknown): Promise<unknown> {
        return (await (await this.deps.getAxios()).post(path, data)).data as unknown;
    }

    public async deleteResource(path: string): Promise<void> {
        await (await this.deps.getAxios()).delete(path, { headers: { 'X-SailPoint-Experimental': 'true' } });
    }

    public async updateResource(path: string, data: string): Promise<unknown> {
        return (await (await this.deps.getAxios()).put(path, data)).data as unknown;
    }

    public async patchResource(path: string, data: unknown): Promise<unknown> {
        return (await (await this.deps.getAxios(CONTENT_TYPE_FORM_JSON_PATCH)).patch(path, data)).data as unknown;
    }
}
