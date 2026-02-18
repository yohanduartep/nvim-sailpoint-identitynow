import {
    Source, Transform, Role, AccessProfile, Workflow, ConnectorRuleResponseBeta
} from 'sailpoint-api-client';
import { AxiosResponse } from 'axios';
import { ISCClientBase } from "./ISCClientBase";
import { DiscoveryDomain } from "./domains/discoveryDomain";
import { SourceWorkflowDomain } from "./domains/sourceWorkflowDomain";
import { IdentityCatalogDomain } from './domains/identityCatalogDomain';
import { GovernanceDomain } from './domains/governanceDomain';
import { ResourceDataDomain } from './domains/resourceDataDomain';
import { AdminConfigDomain } from './domains/adminConfigDomain';

export class ISCClient extends ISCClientBase {

    private readonly discoveryDomain: DiscoveryDomain;
    private readonly sourceWorkflowDomain: SourceWorkflowDomain;
    private readonly identityCatalogDomain: IdentityCatalogDomain;
    private readonly governanceDomain: GovernanceDomain;
    private readonly resourceDataDomain: ResourceDataDomain;
    private readonly adminConfigDomain: AdminConfigDomain;

    constructor(tenantId: string, tenantName: string, version: string) {
        super(tenantId, tenantName, version);
        this.discoveryDomain = new DiscoveryDomain({
            tenantId: this.tenantId,
            version: this.version,
            getApiConfiguration: () => this.getApiConfiguration(),
            getAxiosWithInterceptors: () => this.getAxiosWithInterceptors(),
            getAxios: () => this.getAxios(),
            fetchAllParallel: (apiCall, onProgress, fields, totalItems) => this.fetchAllParallel(apiCall, onProgress, fields, totalItems)
        });
        this.sourceWorkflowDomain = new SourceWorkflowDomain({
            version: this.version,
            getApiConfiguration: () => this.getApiConfiguration(),
            getAxiosWithInterceptors: () => this.getAxiosWithInterceptors(),
            getApiFor: (kind, config) => this.getApiFor(kind, config),
            getVersionedPayloadKey: (baseKey) => this.getVersionedPayloadKey(baseKey)
        });
        this.identityCatalogDomain = new IdentityCatalogDomain({
            version: this.version,
            getApiConfiguration: () => this.getApiConfiguration(),
            getAxiosWithInterceptors: () => this.getAxiosWithInterceptors(),
            getAxios: () => this.getAxios()
        });
        this.governanceDomain = new GovernanceDomain({
            getApiConfiguration: () => this.getApiConfiguration(),
            getAxiosWithInterceptors: () => this.getAxiosWithInterceptors(),
            getApiFor: (kind, config) => this.getApiFor(kind, config),
            getVersionedPayloadKey: (baseKey) => this.getVersionedPayloadKey(baseKey)
        });
        this.resourceDataDomain = new ResourceDataDomain({
            version: this.version,
            getApiConfiguration: () => this.getApiConfiguration(),
            getAxiosWithInterceptors: () => this.getAxiosWithInterceptors(),
            getAxios: (contentType) => this.getAxios(contentType)
        });
        this.adminConfigDomain = new AdminConfigDomain({
            getApiConfiguration: () => this.getApiConfiguration(),
            getAxiosWithInterceptors: () => this.getAxiosWithInterceptors()
        });
    }

    public async listEntitlements(filters?: string, limit?: number): Promise<Record<string, unknown>[]> {
        return this.resourceDataDomain.listEntitlements(filters, limit);
    }

    public async getEntitlement(id: string): Promise<Record<string, unknown>> {
        return this.resourceDataDomain.getEntitlement(id);
    }

	public async pingCluster(sourceId: string): Promise<any> {
		return this.sourceWorkflowDomain.pingCluster(sourceId);
	}

	public async testSourceConnection(sourceId: string): Promise<any> {
		return this.sourceWorkflowDomain.testSourceConnection(sourceId);
	}

	public async getSources(limit?: number): Promise<Source[]> {
		return this.sourceWorkflowDomain.getSources(limit);
	}

	public async getSourceById(id: string): Promise<Source> {
		return this.sourceWorkflowDomain.getSourceById(id);
	}

	public async cloneSource(sourceId: string, newName: string): Promise<Source> {
		return this.sourceWorkflowDomain.cloneSource(sourceId, newName);
	}

	public async getTransforms(limit?: number): Promise<Transform[]> {
		return this.resourceDataDomain.getTransforms(limit);
	}

	public async getTransformByName(name: string): Promise<Transform> {
		return this.resourceDataDomain.getTransformByName(name);
	}

	public async getTransformById(id: string): Promise<Transform> {
		return this.resourceDataDomain.getTransformById(id);
	}

	public async getResource(path: string): Promise<unknown> {
		return this.resourceDataDomain.getResource(path);
	}

	public async createResource(path: string, data: unknown): Promise<unknown> {
		return this.resourceDataDomain.createResource(path, data);
	}

	public async deleteResource(path: string): Promise<void> {
		return this.resourceDataDomain.deleteResource(path);
	}

	public async updateResource(path: string, data: string): Promise<unknown> {
		return this.resourceDataDomain.updateResource(path, data);
	}

	public async patchResource(path: string, data: unknown): Promise<unknown> {
		return this.resourceDataDomain.patchResource(path, data);
	}

	public async getWorflows(limit?: number): Promise<Workflow[]> {
		return this.sourceWorkflowDomain.getWorflows(limit);
	}

	public async getWorflow(id: string): Promise<Workflow> {
		return this.sourceWorkflowDomain.getWorflow(id);
	}

	public async getConnectorRuleCreationHistory(id: string): Promise<any[]> {
		return this.sourceWorkflowDomain.getConnectorRuleCreationHistory(id);
	}

	public async getConnectorRules(limit?: number): Promise<ConnectorRuleResponseBeta[]> {
		return this.sourceWorkflowDomain.getConnectorRules(limit);
	}

	public async getConnectorRuleById(id: string): Promise<ConnectorRuleResponseBeta> {
		return this.sourceWorkflowDomain.getConnectorRuleById(id);
	}

	public async getAccessProfiles(limit?: number): Promise<AxiosResponse<AccessProfile[]>> {
		return this.governanceDomain.getAccessProfiles(limit);
	}

	public async getAccessProfileById(id: string): Promise<AccessProfile> {
		return this.governanceDomain.getAccessProfileById(id);
	}

	public async getAllRoles(limit?: number): Promise<Role[]> {
		return this.governanceDomain.getAllRoles(limit);
	}

	public async getRoles(query: Record<string, unknown>): Promise<AxiosResponse<Role[]>> {
		return this.governanceDomain.getRoles(query);
	}

    public async paginatedSearchRoles(query: string, limit: number): Promise<AxiosResponse<any[]>> {
        return this.governanceDomain.paginatedSearchRoles(query, limit);
    }

    public async paginatedSearchAccessProfiles(query: string, limit: number): Promise<AxiosResponse<any[]>> {
        return this.governanceDomain.paginatedSearchAccessProfiles(query, limit);
    }

    public async getAllIdentities(onProgress?: (count: number, total: number) => void): Promise<Record<string, unknown>[]> {
        return this.identityCatalogDomain.getAllIdentities(onProgress);
    }

	public async listIdentities(query: Record<string, unknown>): Promise<AxiosResponse<Record<string, unknown>[]>> {
		return this.identityCatalogDomain.listIdentities(query);
	}

    public async searchIdentities(query: string, limit?: number): Promise<{ items: Record<string, unknown>[], totalCount: number }> {
		return this.identityCatalogDomain.searchIdentities(query, limit);
	}

	public async listForms(limit?: number): Promise<Record<string, unknown>[]> {
		return this.identityCatalogDomain.listForms(limit);
	}

	public async getSearchAttributes(): Promise<Record<string, unknown>[]> {
		return this.identityCatalogDomain.getSearchAttributes();
	}

	public async getIdentityAttributes(): Promise<Record<string, unknown>[]> {
		return this.identityCatalogDomain.getIdentityAttributes();
	}

    public async getPaginatedApplications(filters: string, limit?: number): Promise<AxiosResponse<Record<string, unknown>[]>> {
		return this.identityCatalogDomain.getPaginatedApplications(filters, limit);
	}

    public async getPaginatedCampaigns(filters: string, limit?: number): Promise<AxiosResponse<Record<string, unknown>[]>> {
		return this.identityCatalogDomain.getPaginatedCampaigns(filters, limit);
	}

    public async getServiceDesks(limit?: number): Promise<Record<string, unknown>[]> {
		return this.identityCatalogDomain.getServiceDesks(limit);
	}

    public async getIdentityProfiles(limit?: number): Promise<Record<string, unknown>[]> {
		return this.identityCatalogDomain.getIdentityProfiles(limit);
	}

    public async listAccounts(limit: number = 250): Promise<Record<string, unknown>[]> {
        return this.discoveryDomain.listAccounts(limit);
    }

    public async getAccountsForSource(sourceId: string, onProgress?: (count: number, total: number) => void): Promise<Record<string, unknown>[]> {
        return this.discoveryDomain.getAccountsForSource(sourceId, onProgress);
    }

    public async getAllAccounts(_onProgress?: (count: number, sourceName?: string, total?: number) => void): Promise<Record<string, unknown>[]> {
        return this.discoveryDomain.getAllAccounts();
    }

    public async search(index: string, query: string, limit?: number): Promise<Record<string, unknown>[]> {
        return this.discoveryDomain.search(index, query, limit);
    }

    public async startAccountAggregation(id: string): Promise<Record<string, unknown>> {
		return this.sourceWorkflowDomain.startAccountAggregation(id);
	}

	public async startEntitlementAggregation(sourceId: string): Promise<Record<string, unknown>> {
		return this.sourceWorkflowDomain.startEntitlementAggregation(sourceId);
	}

    public async startAccountReset(id: string): Promise<Record<string, unknown>> {
		return this.sourceWorkflowDomain.startAccountReset(id);
	}

	public async startEntitlementReset(sourceId: string): Promise<Record<string, unknown>> {
		return this.sourceWorkflowDomain.startEntitlementReset(sourceId);
	}

    public async updateLogConfiguration(id: string, duration: number, logLevels: any): Promise<void> {
		return this.adminConfigDomain.updateLogConfiguration(id, duration, logLevels);
	}

    public async getWorkflowExecutionHistory(id: string): Promise<Record<string, unknown>[]> {
		return this.sourceWorkflowDomain.getWorkflowExecutionHistory(id);
	}

    public async getResourceMetadata(type: string, filter?: string): Promise<{ totalCount: number, lastModified?: string }> {
        return this.discoveryDomain.getResourceMetadata(type, filter);
    }

    public async updateWorkflowStatus(id: string, status: boolean): Promise<void> {
		return this.sourceWorkflowDomain.updateWorkflowStatus(id, status);
	}

    public async processIdentities(identityIds: string[]): Promise<Record<string, unknown>> {
		return this.identityCatalogDomain.processIdentities(identityIds);
	}

	public async synchronizeAttributes(identityId: string): Promise<Record<string, unknown>> {
		return this.identityCatalogDomain.synchronizeAttributes(identityId);
	}

    public async updateConnectorRule(rule: ConnectorRuleResponseBeta): Promise<unknown> {
		return this.sourceWorkflowDomain.updateConnectorRule(rule);
	}

    public async createRole(role: Role): Promise<Record<string, unknown>> {
        return this.governanceDomain.createRole(role);
    }

    public async createAccessProfile(ap: AccessProfile): Promise<Record<string, unknown>> {
        return this.governanceDomain.createAccessProfile(ap);
    }

    public async startExportJob(types: any[], options: any): Promise<string> {
        return this.adminConfigDomain.startExportJob(types, options);
    }

    public async startImportJob(data: string): Promise<string> {
        return this.adminConfigDomain.startImportJob(data);
    }
}

