import * as vscode from "../vscode";
import * as os from 'os';
import { 
    Configuration, Paginator, SourcesApi, SourcesV2025Api, TransformsApi, WorkflowsV2025Api, 
    WorkflowsApi, ConnectorRuleManagementBetaApi, AccountsApi, EntitlementsBetaApi, 
    PublicIdentitiesApi, SPConfigBetaApi, IdentityProfilesApi, ServiceDeskIntegrationApi, 
    TaskManagementV2025Api, ManagedClustersBetaApi, CertificationCampaignsV2025Api, 
    CertificationsV2025Api, CertificationSummariesV2025Api, SearchApi, CustomFormsBetaApi, 
    AppsBetaApi, SODPoliciesV2024Api, IdentityProfilesV2025Api, RolesV2025Api, RolesApi,
    AccessProfilesV2025Api, AccessProfilesApi, DimensionsV2025Api, PasswordConfigurationV2025Api, 
    PasswordManagementBetaApi, IdentitiesBetaApi, ConfigurationHubV2024Api,
    Search, IndexV2025, IdentityAttributesBetaApi, SearchAttributeConfigurationBetaApi,
    Source, Transform, Role, AccessProfile, Workflow, ConnectorRuleResponseBeta
} from 'sailpoint-api-client';
import { SailPointISCAuthenticationProvider } from "./AuthenticationProvider";
import { compareByName } from "../utils";
import { DEFAULT_ACCOUNTS_QUERY_PARAMS } from "../models/Account";
import { DEFAULT_ENTITLEMENTS_QUERY_PARAMS } from "../models/Entitlements";
import { DEFAULT_PUBLIC_IDENTITIES_QUERY_PARAMS } from '../models/PublicIdentity';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { DEFAULT_ACCESSPROFILES_QUERY_PARAMS } from "../models/AccessProfiles";
import { DEFAULT_ROLES_QUERY_PARAMS } from "../models/Roles";
import { configureAxios, onErrorResponse } from "./AxiosHandlers";

const FormData = require('form-data');
const CONTENT_TYPE_HEADER = "Content-Type";
export const USER_AGENT_HEADER = "User-Agent";
export const USER_AGENT = `Neovim/SailPoint-IdentityNow (Node ${process.version})`;
export const TOTAL_COUNT_HEADER = "x-total-count";
const CONTENT_TYPE_JSON = "application/json";
const CONTENT_TYPE_FORM_JSON_PATCH = "application/json-patch+json";
const DEFAULT_PAGINATION = 250;

export class ISCClient {

    private static axiosInstances: Map<string, AxiosInstance> = new Map();

    public static clearCache() {
        this.axiosInstances.clear();
    }

	constructor(
		private readonly tenantId: string,
		private readonly tenantName: string,
        private readonly version: string = 'v3'
	) { }

    private getSourcesApi(config: Configuration): any {
        if (this.version === 'v2025') return new SourcesV2025Api(config, undefined, this.getAxiosWithInterceptors());
        return new SourcesApi(config, undefined, this.getAxiosWithInterceptors());
    }

    private getWorkflowsApi(config: Configuration): any {
        if (this.version === 'v2025') return new WorkflowsV2025Api(config, undefined, this.getAxiosWithInterceptors());
        return new WorkflowsApi(config, undefined, this.getAxiosWithInterceptors());
    }

    private getRolesApi(config: Configuration): any {
        if (this.version === 'v2025') return new RolesV2025Api(config, undefined, this.getAxiosWithInterceptors());
        return new RolesApi(config, undefined, this.getAxiosWithInterceptors());
    }

    private getAccessProfilesApi(config: Configuration): any {
        if (this.version === 'v2025') return new AccessProfilesV2025Api(config, undefined, this.getAxiosWithInterceptors());
        return new AccessProfilesApi(config, undefined, this.getAxiosWithInterceptors());
    }

	private async getApiConfiguration(accessToken?: string): Promise<Configuration> {
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

	private getAxiosWithInterceptors(): AxiosInstance {
        const key = `sdk-${this.tenantId}-${this.tenantName}`;
        let instance = ISCClient.axiosInstances.get(key);
        if (!instance) {
            instance = axios.create();
            instance.defaults.headers.common = { [USER_AGENT_HEADER]: USER_AGENT };
            configureAxios(instance);
            ISCClient.axiosInstances.set(key, instance);
        }
		return instance;
	}

	private async getAxios(contentType = CONTENT_TYPE_JSON): Promise<AxiosInstance> {
		const session = await SailPointISCAuthenticationProvider.getInstance().getSessionByTenant(this.tenantId)
        if (!session?.accessToken) throw new Error('No valid session for tenant');

        const key = `raw-${this.tenantId}-${this.tenantName}-${contentType}`;
        let instance = ISCClient.axiosInstances.get(key);
        
        if (!instance) {
            instance = axios.create({
                baseURL: `https://${this.tenantName}`,
                headers: { "Content-Type": contentType, [USER_AGENT_HEADER]: USER_AGENT }
            });
            configureAxios(instance);
            ISCClient.axiosInstances.set(key, instance);
        }
        
        instance.defaults.headers.common["Authorization"] = `Bearer ${session?.accessToken}`;
		return instance;
	}

	public async pingCluster(sourceId: string): Promise<any> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		return (await api.pingCluster({ sourceId })).data;
	}

	public async testSourceConnection(sourceId: string): Promise<any> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		return (await api.testSourceConnection({ sourceId })).data;
	}

	public async getSources(): Promise<Source[]> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		const result = await Paginator.paginate(api, api.listSources, { sorters: "name" });
		return result.data as Source[];
	}

	public async getSourceById(id: string): Promise<Source> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		return (await api.getSource({ id })).data;
	}

	public async cloneSource(sourceId: string, newName: string): Promise<Source> {
		const source = await this.getSourceById(sourceId);
		const newSource = { ...source, name: newName, id: undefined, created: undefined, modified: undefined };
		const api = this.getSourcesApi(await this.getApiConfiguration());
        const payload = this.version === 'v2025' ? { sourceV2025: newSource } : { source: newSource };
		return (await api.createSource(payload)).data;
	}

	public async getTransforms(): Promise<Transform[]> {
		const api = new TransformsApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		const result = await Paginator.paginate(api, api.listTransforms);
		return (result.data as Transform[]).sort(compareByName);
	}

	public async getTransformByName(name: string): Promise<Transform> {
		const api = new TransformsApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		const resp = await api.listTransforms({ filters: `name eq "${name}"`, count: true });
		return resp.data[0];
	}

	public async getTransformById(id: string): Promise<Transform> {
		return (await (await this.getAxios()).get(`/${this.version}/transforms/${id}`)).data;
	}

	public async getResource(path: string): Promise<any> {
		return (await (await this.getAxios()).get(path)).data;
	}

	public async createResource(path: string, data: any): Promise<any> {
		return (await (await this.getAxios()).post(path, data)).data;
	}

	public async deleteResource(path: string): Promise<void> {
		await (await this.getAxios()).delete(path, { headers: { "X-SailPoint-Experimental": "true" } });
	}

	public async updateResource(path: string, data: string): Promise<any> {
		return (await (await this.getAxios()).put(path, data)).data;
	}

	public async patchResource(path: string, data: any): Promise<any> {
		return (await (await this.getAxios(CONTENT_TYPE_FORM_JSON_PATCH)).patch(path, data)).data;
	}

	public async getWorflows(): Promise<Workflow[]> {
		const api = this.getWorkflowsApi(await this.getApiConfiguration());
		return (await api.listWorkflows()).data.sort(compareByName);
	}

	public async getWorflow(id: string): Promise<Workflow> {
		const api = this.getWorkflowsApi(await this.getApiConfiguration());
		return (await api.getWorkflow({ id })).data;
	}

	public async getConnectorRules(): Promise<ConnectorRuleResponseBeta[]> {
		const api = new ConnectorRuleManagementBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.getConnectorRuleList()).data.sort(compareByName);
	}

	public async getConnectorRuleById(id: string): Promise<ConnectorRuleResponseBeta> {
		const api = new ConnectorRuleManagementBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.getConnectorRule({ id })).data;
	}

	public async getAccessProfiles(): Promise<AxiosResponse<AccessProfile[]>> {
		const api = this.getAccessProfilesApi(await this.getApiConfiguration());
		return await api.listAccessProfiles(DEFAULT_ACCESSPROFILES_QUERY_PARAMS);
	}

	public async getAccessProfileById(id: string): Promise<AccessProfile> {
		const api = this.getAccessProfilesApi(await this.getApiConfiguration());
		return (await api.getAccessProfile({ id })).data;
	}

	public async getAllRoles(): Promise<Role[]> {
		const api = this.getRolesApi(await this.getApiConfiguration());
		const result = await Paginator.paginate(api, api.listRoles, { sorters: "name" });
		return result.data as Role[];
	}

	public async getRoles(query: any): Promise<AxiosResponse<Role[]>> {
		const api = this.getRolesApi(await this.getApiConfiguration());
		return await api.listRoles({ ...DEFAULT_ROLES_QUERY_PARAMS, ...query });
	}

    public async paginatedSearchRoles(query: string, limit: number): Promise<AxiosResponse<any[]>> {
        const search: Search = { indices: ["roles"], query: { query }, sort: ["name"] };
        const api = new SearchApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
        return await api.searchPost({ search, limit });
    }

    public async paginatedSearchAccessProfiles(query: string, limit: number): Promise<AxiosResponse<any[]>> {
        const search: Search = { indices: ["accessprofiles"], query: { query }, sort: ["name"] };
        const api = new SearchApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
        return await api.searchPost({ search, limit });
    }

	public async listIdentities(query: any): Promise<AxiosResponse<any[]>> {
		const api = new IdentitiesBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return await api.listIdentities(query);
	}

    public async searchIdentities(query: string, limit?: number): Promise<any[]> {
		const api = new SearchApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
        const search: Search = { indices: ["identities"], query: { query }, sort: ["name"] };
		const resp = await api.searchPost({ search, limit });
		return resp.data;
	}

	public async listForms(): Promise<any[]> {
		const api = new CustomFormsBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.searchFormDefinitionsByTenant({ offset: 0, limit: 100 })).data.results || [];
	}

	public async getSearchAttributes(): Promise<any[]> {
		const api = new SearchAttributeConfigurationBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.getSearchAttributeConfig()).data.sort(compareByName);
	}

	public async getIdentityAttributes(): Promise<any[]> {
		const api = new IdentityAttributesBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.listIdentityAttributes({})).data;
	}

    public async getPaginatedApplications(filters: string): Promise<AxiosResponse<any[]>> {
		const api = new AppsBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return await api.listAllSourceApp({ offset: 0, limit: 100, filters, sorters: "name" });
	}

    public async getPaginatedCampaigns(filters: string): Promise<AxiosResponse<any[]>> {
		return await (await this.getAxios()).get(`/${this.version}/campaigns`, { params: { filters, limit: 100, sorters: "-created" } });
	}

    public async getServiceDesks(): Promise<any[]> {
		const api = new ServiceDeskIntegrationApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.getServiceDeskIntegrations({ sorters: "name" })).data;
	}

    public async getIdentityProfiles(): Promise<any[]> {
		const api = new IdentityProfilesApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.listIdentityProfiles({})).data;
	}

    public async startAccountAggregation(id: string): Promise<any> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		return (await api.importAccounts({ id })).data;
	}

	public async startEntitlementAggregation(sourceId: string): Promise<any> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		return (await api.importEntitlements({ sourceId })).data;
	}

    public async startAccountReset(id: string): Promise<any> {
		const api = this.getSourcesApi(await this.getApiConfiguration());
		return (await api.deleteAccountsAsync({ id })).data;
	}

	public async startEntitlementReset(sourceId: string): Promise<any> {
		const api = new EntitlementsBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.resetSourceEntitlements({ sourceId })).data;
	}

    public async updateLogConfiguration(id: string, duration: number, logLevels: any): Promise<void> {
		const api = new ManagedClustersBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		await api.putClientLogConfiguration({ id, clientLogConfigurationBeta: { durationMinutes: duration, clientId: "Neovim", logLevels, rootLevel: "INFO" } });
	}

    public async getWorkflowExecutionHistory(id: string): Promise<any[]> {
		const api = this.getWorkflowsApi(await this.getApiConfiguration());
		return (await api.getWorkflowExecutions({ id })).data;
	}

    public async updateWorkflowStatus(id: string, status: boolean): Promise<void> {
		const api = this.getWorkflowsApi(await this.getApiConfiguration());
		await api.patchWorkflow({ id, jsonPatchOperationBeta: [{ op: "replace", path: "/enabled", value: status }] });
	}

    public async processIdentities(identityIds: string[]): Promise<any> {
		const api = new IdentitiesBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.startIdentityProcessing({ processIdentitiesRequestBeta: { identityIds } })).data;
	}

	public async synchronizeAttributes(identityId: string): Promise<any> {
		const api = new IdentitiesBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.synchronizeAttributesForIdentity({ identityId })).data;
	}

    public async updateConnectorRule(rule: ConnectorRuleResponseBeta): Promise<any> {
		const api = new ConnectorRuleManagementBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
		return (await api.updateConnectorRule({ id: rule.id, connectorRuleUpdateRequestBeta: rule }));
	}

    public async createRole(role: Role): Promise<any> {
        const api = this.getRolesApi(await this.getApiConfiguration());
        const payload = this.version === 'v2025' ? { roleV2025: role } : { role };
        return (await api.createRole(payload)).data;
    }

    public async createAccessProfile(ap: AccessProfile): Promise<any> {
        const api = this.getAccessProfilesApi(await this.getApiConfiguration());
        const payload = this.version === 'v2025' ? { accessProfileV2025: ap } : { accessProfile: ap };
        return (await api.createAccessProfile(payload)).data;
    }

    public async startExportJob(types: any[], options: any): Promise<string> {
        const api = new SPConfigBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
        const response = await api.exportSpConfig({ exportPayloadBeta: { includeTypes: types, objectOptions: options } });
        return response.data.jobId;
    }

    public async startImportJob(data: string, options: any): Promise<string> {
        const api = new SPConfigBetaApi(await this.getApiConfiguration(), undefined, this.getAxiosWithInterceptors());
        const formData = new FormData();
        formData.append("data", Buffer.from(data), "import.json");
        const response = await api.importSpConfig(formData);
        return response.data.jobId;
    }
}
