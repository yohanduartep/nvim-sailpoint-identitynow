import { AxiosInstance } from 'axios';
import {
    Configuration,
    ConnectorRuleManagementBetaApi,
    ConnectorRuleResponseBeta,
    EntitlementsBetaApi,
    Paginator,
    Source,
    Workflow
} from 'sailpoint-api-client';
import { compareByName } from '../../utils';

type ApiKind = 'sources' | 'workflows' | 'roles' | 'accessProfiles';

interface SourceWorkflowDeps {
    version: string;
    getApiConfiguration: () => Promise<Configuration>;
    getAxiosWithInterceptors: () => AxiosInstance;
    getApiFor: (kind: ApiKind, config: Configuration) => any;
    getVersionedPayloadKey: (baseKey: string) => string;
}

export class SourceWorkflowDomain {
    constructor(private readonly deps: SourceWorkflowDeps) {}

    public async pingCluster(sourceId: string): Promise<any> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        return (await api.pingCluster({ sourceId })).data;
    }

    public async testSourceConnection(sourceId: string): Promise<any> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        return (await api.testSourceConnection({ sourceId })).data;
    }

    public async getSources(limit?: number): Promise<Source[]> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        if (limit) {
            return (await api.listSources({ limit, sorters: 'name' })).data as Source[];
        }
        const result = await Paginator.paginate(api, api.listSources, { sorters: 'name' });
        return result.data as Source[];
    }

    public async getSourceById(id: string): Promise<Source> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        return (await api.getSource({ id })).data;
    }

    public async cloneSource(sourceId: string, newName: string): Promise<Source> {
        const source = await this.getSourceById(sourceId);
        const newSource = { ...source, name: newName, id: undefined, created: undefined, modified: undefined };
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        const payloadKey = this.deps.getVersionedPayloadKey('source');
        const payload = { [payloadKey]: newSource } as any;
        return (await api.createSource(payload)).data;
    }

    public async getWorflows(limit?: number): Promise<Workflow[]> {
        const api = this.deps.getApiFor('workflows', await this.deps.getApiConfiguration());
        const resp = await api.listWorkflows();
        let items = resp.data.sort(compareByName);
        if (limit) items = items.slice(0, limit);
        return items;
    }

    public async getWorflow(id: string): Promise<Workflow> {
        const api = this.deps.getApiFor('workflows', await this.deps.getApiConfiguration());
        return (await api.getWorkflow({ id })).data;
    }

    public async getWorkflowExecutionHistory(id: string): Promise<any[]> {
        const api = this.deps.getApiFor('workflows', await this.deps.getApiConfiguration());
        return (await api.getWorkflowExecutions({ id })).data;
    }

    public async updateWorkflowStatus(id: string, status: boolean): Promise<void> {
        const api = this.deps.getApiFor('workflows', await this.deps.getApiConfiguration());
        await api.patchWorkflow({ id, jsonPatchOperationBeta: [{ op: 'replace', path: '/enabled', value: status }] });
    }

    public async getConnectorRuleCreationHistory(id: string): Promise<any[]> {
        const api = new ConnectorRuleManagementBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.getConnectorRule({ id })).data as any;
    }

    public async getConnectorRules(limit?: number): Promise<ConnectorRuleResponseBeta[]> {
        const api = new ConnectorRuleManagementBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const resp = await api.getConnectorRuleList();
        let items = resp.data.sort(compareByName);
        if (limit) items = items.slice(0, limit);
        return items;
    }

    public async getConnectorRuleById(id: string): Promise<ConnectorRuleResponseBeta> {
        const api = new ConnectorRuleManagementBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.getConnectorRule({ id })).data;
    }

    public async updateConnectorRule(rule: ConnectorRuleResponseBeta): Promise<any> {
        const api = new ConnectorRuleManagementBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return await api.updateConnectorRule({ id: rule.id, connectorRuleUpdateRequestBeta: rule });
    }

    public async startAccountAggregation(id: string): Promise<any> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        return (await api.importAccounts({ id })).data;
    }

    public async startEntitlementAggregation(sourceId: string): Promise<any> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        return (await api.importEntitlements({ sourceId })).data;
    }

    public async startAccountReset(id: string): Promise<any> {
        const api = this.deps.getApiFor('sources', await this.deps.getApiConfiguration());
        return (await api.deleteAccountsAsync({ id })).data;
    }

    public async startEntitlementReset(sourceId: string): Promise<any> {
        const api = new EntitlementsBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        return (await api.resetSourceEntitlements({ sourceId })).data;
    }
}
