import { Configuration } from 'sailpoint-api-client';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { configureAxios } from "./AxiosHandlers";
import { SailPointISCAuthenticationProvider } from "./AuthenticationProvider";
import { fetchAllParallel as fetchAllParallelHelper } from "./paginationHelpers";

export const USER_AGENT_HEADER = "User-Agent";
export const USER_AGENT = `Neovim/SailPoint-IdentityNow (Node ${process.version})`;
const CONTENT_TYPE_JSON = "application/json";

export abstract class ISCClientBase {
    private static axiosInstances: Map<string, AxiosInstance> = new Map();

    public static clearCache() {
        this.axiosInstances.clear();
    }

    protected constructor(
        protected readonly tenantId: string,
        protected readonly tenantName: string,
        protected readonly version: string
    ) {}

    protected getVersionedApi(config: Configuration, legacyCtor: any, versionedCtor: any): any {
        if (this.isVersionedModel()) {
            return new versionedCtor(config, undefined, this.getAxiosWithInterceptors());
        }
        return new legacyCtor(config, undefined, this.getAxiosWithInterceptors());
    }

    protected isVersionedModel(): boolean {
        return /^v\d{4}$/.test(this.version);
    }

    protected getVersionedPayloadKey(baseKey: string): string {
        if (!this.isVersionedModel()) return baseKey;
        return `${baseKey}${this.version.charAt(0).toUpperCase()}${this.version.slice(1)}`;
    }

    protected getApiFor(kind: 'sources' | 'workflows' | 'roles' | 'accessProfiles', config: Configuration) {
        const { SourcesApi, SourcesV2025Api, WorkflowsApi, WorkflowsV2025Api, 
                RolesApi, RolesV2025Api, AccessProfilesApi, AccessProfilesV2025Api } = require('sailpoint-api-client');
        
        const mapping = {
            sources: [SourcesApi, SourcesV2025Api],
            workflows: [WorkflowsApi, WorkflowsV2025Api],
            roles: [RolesApi, RolesV2025Api],
            accessProfiles: [AccessProfilesApi, AccessProfilesV2025Api]
        } as const;
        const [legacyCtor, versionedCtor] = mapping[kind];
        return this.getVersionedApi(config, legacyCtor, versionedCtor);
    }

    protected async getApiConfiguration(accessToken?: string): Promise<Configuration> {
        if (!accessToken) {
            const session = await SailPointISCAuthenticationProvider.getInstance().getSessionByTenant(this.tenantId)
            if (!session?.accessToken) {
                throw new Error('No valid session for tenant');
            }
            accessToken = session?.accessToken
        }
        const apiConfig = new Configuration({
            baseurl: `https://${this.tenantName}`,
            tokenUrl: `https://${this.tenantName}/oauth/token`,
            accessToken: accessToken,
        });
        apiConfig.experimental = true;
        return apiConfig;
    }

    protected getAxiosWithInterceptors(): AxiosInstance {
        const key = `sdk-${this.tenantId}-${this.tenantName}`;
        let instance = ISCClientBase.axiosInstances.get(key);
        if (!instance) {
            instance = axios.create();
            instance.defaults.headers.common = { [USER_AGENT_HEADER]: USER_AGENT };
            configureAxios(instance);
            ISCClientBase.axiosInstances.set(key, instance);
        }
        return instance;
    }

    protected async getAxios(contentType = CONTENT_TYPE_JSON): Promise<AxiosInstance> {
        const session = await SailPointISCAuthenticationProvider.getInstance().getSessionByTenant(this.tenantId)
        if (!session?.accessToken) throw new Error('No valid session for tenant');

        const key = `raw-${this.tenantId}-${this.tenantName}-${contentType}`;
        let instance = ISCClientBase.axiosInstances.get(key);
        
        if (!instance) {
            instance = axios.create({
                baseURL: `https://${this.tenantName}`,
                headers: { "Content-Type": contentType, [USER_AGENT_HEADER]: USER_AGENT }
            });
            configureAxios(instance);
            ISCClientBase.axiosInstances.set(key, instance);
        }
        
        instance.defaults.headers.common["Authorization"] = `Bearer ${session?.accessToken}`;
        return instance;
    }

    protected async withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 2000): Promise<T> {
        try {
            return await fn();
        } catch (e: unknown) {
            const maybe = e as { response?: { status?: number }; message?: string };
            if (retries > 0 && (maybe.response?.status === 429 || maybe.message?.includes('429'))) {
                const wait = delayMs * (6 - retries);
                await new Promise(resolve => setTimeout(resolve, wait));
                return this.withRetry(fn, retries - 1, delayMs);
            }
            throw e;
        }
    }

    protected async fetchAllParallel(
        apiCall: (params: Record<string, unknown>) => Promise<AxiosResponse<Record<string, unknown>[]>>,
        onProgress?: (count: number, total: number) => void,
        fields?: string,
        totalItems?: number
    ): Promise<Record<string, unknown>[]> {
        return fetchAllParallelHelper(
            apiCall,
            (fn, retries) => this.withRetry(fn, retries),
            onProgress,
            fields,
            totalItems
        );
    }
}
