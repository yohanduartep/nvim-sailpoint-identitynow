import { AxiosInstance, AxiosResponse } from 'axios';
import {
    AccountsApi,
    Configuration,
    IndexV2025,
    Search,
    SearchApi
} from 'sailpoint-api-client';
import * as vscode from '../../vscode';
import { createMatcher, dedupeByIdOrKey } from '../localSearch';
import { resolveMetadataRequest } from '../resourceMetadata';

const TOTAL_COUNT_HEADER = 'x-total-count';

interface DiscoveryDeps {
    tenantId: string;
    version: string;
    getApiConfiguration: () => Promise<Configuration>;
    getAxiosWithInterceptors: () => AxiosInstance;
    getAxios: () => Promise<AxiosInstance>;
    fetchAllParallel: (
        apiCall: (params: Record<string, unknown>) => Promise<AxiosResponse<Record<string, unknown>[]>>,
        onProgress?: (count: number, total: number) => void,
        fields?: string,
        totalItems?: number
    ) => Promise<Record<string, unknown>[]>;
}

export class DiscoveryDomain {
    constructor(private readonly deps: DiscoveryDeps) {}

    public async listAccounts(limit: number = 250): Promise<Record<string, unknown>[]> {
        const api = new AccountsApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.listAccounts({ limit, sorters: 'name' })).data as unknown as Record<string, unknown>[];
    }

    public async getAccountsForSource(sourceId: string, onProgress?: (count: number, total: number) => void): Promise<Record<string, unknown>[]> {
        const api = new AccountsApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const filter = `sourceId eq "${sourceId}"`;
        console.log(`[DEBUG] Fetching accounts with filter: ${filter}`);
        const results = await this.deps.fetchAllParallel(
            (p) => api.listAccounts({ ...p, filters: filter }) as unknown as Promise<AxiosResponse<Record<string, unknown>[]>>,
            onProgress,
            undefined,
            0
        );
        console.log(`[DEBUG] Got ${results.length} accounts for source ${sourceId}`);
        return results;
    }

    public async getAllAccounts(): Promise<Record<string, unknown>[]> {
        return [];
    }

    public async search(index: string, query: string, limit?: number): Promise<Record<string, unknown>[]> {
        const matcher = createMatcher(query);
        const results: Record<string, unknown>[] = [];
        const resourceTypes = ['tenants', 'accounts', 'access-profiles', 'roles', 'identities', 'sources', 'transforms', 'workflows', 'entitlements', 'apps', 'rules', 'campaigns', 'forms', 'identity-attributes', 'identity-profiles', 'search-attributes', 'service-desk'];
        const targetTypes = (index === 'all' || index === 'global') ? resourceTypes : [index];
        
        console.log(`[DEBUG] Search - index: "${index}", targetTypes: [${targetTypes.join(', ')}], query: "${query}"`);

        for (const type of targetTypes) {
            if (type === 'accounts') {
                const summary = vscode.globalStorage.get<Record<string, unknown>[]>(`${this.deps.tenantId}_accounts_summary`);
                if (summary) {
                    for (const source of summary) {
                        const sourceId = typeof source.id === 'string' ? source.id : undefined;
                        if (!sourceId) continue;
                        const cached = await vscode.tenantCache.get<Record<string, unknown>[]>(this.deps.tenantId, 'accounts', sourceId);
                        if (!cached?.value) continue;
                        for (const account of cached.value) {
                            const { matched, field } = matcher(account);
                            if (matched) {
                                results.push({ ...account, resource_type: 'accounts', source_display_name: source.name, matchedField: field } as Record<string, unknown>);
                            }
                        }
                    }
                }
            } else {
                const cached = await vscode.tenantCache.get<Record<string, unknown>[]>(this.deps.tenantId, type);
                if (!cached?.value) continue;
                for (const item of cached.value) {
                    const { matched, field } = matcher(item);
                    if (matched) {
                        results.push({ ...item, resource_type: type, matchedField: field } as Record<string, unknown>);
                    }
                }
            }
        }

        if (results.length > 0) {
            const unique = dedupeByIdOrKey(results);
            return typeof limit === 'number' ? unique.slice(0, limit) : unique;
        }

        if (index === 'all' || index === 'global') {
            return [];
        }

        // Skip API search for resource types that don't support Search API
        const apiSearchableTypes = ['identities', 'roles', 'access-profiles', 'accessprofiles', 'entitlements', 'sources'];
        if (!apiSearchableTypes.includes(index)) {
            // Return empty for non-API-searchable types (e.g., rules, transforms, workflows)
            return [];
        }

        const api = new SearchApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const indexMapping: Record<string, string> = { identities: 'identities', roles: 'roles', 'access-profiles': 'accessprofiles', entitlements: 'entitlements', sources: 'sources' };
        const targetIndex = indexMapping[index] || index;

        const performSearch = async (q: string) => {
            const search: Search = {
                indices: [targetIndex as IndexV2025],
                query: { query: q },
                sort: ['name']
            };
            return api.searchPost(typeof limit === 'number' ? { search, limit } : { search });
        };

        try {
            let resp;
            try {
                resp = await performSearch(query);
            } catch {
                if (query.includes(':')) {
                    const value = query.split(':').slice(1).join(':').trim();
                    resp = await performSearch(value);
                } else {
                    throw new Error('search failed');
                }
            }
            return resp.data.map((item) => {
                const asRecord = item as unknown as Record<string, unknown>;
                const source = asRecord.source as Record<string, unknown> | undefined;
                return { ...asRecord, resource_type: index, source_display_name: source?.name } as Record<string, unknown>;
            });
        } catch (e: unknown) {
            const maybe = e as { response?: { data?: { messages?: Array<{ text?: string }> } }; message?: string };
            const msg = maybe.response?.data?.messages?.[0]?.text || maybe.message || String(e);
            throw new Error(msg);
        }
    }

    public async getResourceMetadata(type: string, filter?: string): Promise<{ totalCount: number; lastModified?: string }> {
        if (type.startsWith('identities')) {
            try {
                const api = new SearchApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
                const search: Search = { indices: ['identities'], query: { query: filter || '*' } };
                const resp = await api.searchPost({ search, limit: 1, count: true });
                return {
                    totalCount: parseInt(resp.headers[TOTAL_COUNT_HEADER] || resp.headers['x-total-count'] || '0', 10),
                    lastModified: (resp.data[0] as Record<string, unknown>)?.modified as string | undefined
                        || (resp.data[0] as Record<string, unknown>)?.created as string | undefined
                };
            } catch {
                const fallback = resolveMetadataRequest(this.deps.version, 'identities', filter);
                return this.fetchMetadataFromRest(fallback.url, fallback.params);
            }
        }
        const request = resolveMetadataRequest(this.deps.version, type, filter);
        return this.fetchMetadataFromRest(request.url, request.params);
    }

    private async fetchMetadataFromRest(url: string, params: Record<string, unknown>): Promise<{ totalCount: number; lastModified?: string }> {
        const axios = await this.deps.getAxios();
        const response = await axios.get(url, {
            params,
            timeout: 15000,
            headers: { 'X-SailPoint-Experimental': 'true' }
        });

        const payload = response.data as unknown;
        const listPayload = Array.isArray(payload) ? payload : [];
        const objectPayload = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : undefined;
        const results = Array.isArray(objectPayload?.results) ? objectPayload?.results as Record<string, unknown>[] : [];
        const count = typeof objectPayload?.count === 'number' ? objectPayload.count : undefined;
        const totalCount = parseInt(response.headers[TOTAL_COUNT_HEADER] || response.headers['x-total-count'] || '0', 10)
            || (Array.isArray(payload) ? listPayload.length : (count !== undefined ? count : results.length));
        const lastItem = Array.isArray(payload) ? listPayload[0] as Record<string, unknown> : (results[0] || undefined);

        return {
            totalCount,
            lastModified: typeof lastItem?.modified === 'string' ? lastItem.modified : (typeof lastItem?.created === 'string' ? lastItem.created : undefined)
        };
    }
}
