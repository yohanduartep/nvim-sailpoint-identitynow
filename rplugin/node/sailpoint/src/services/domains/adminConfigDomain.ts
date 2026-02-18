import { AxiosInstance } from 'axios';
import { Configuration, ManagedClustersBetaApi, SPConfigBetaApi } from 'sailpoint-api-client';

const FormData = require('form-data');

interface AdminConfigDeps {
    getApiConfiguration: () => Promise<Configuration>;
    getAxiosWithInterceptors: () => AxiosInstance;
}

export class AdminConfigDomain {
    constructor(private readonly deps: AdminConfigDeps) {}

    public async updateLogConfiguration(id: string, duration: number, logLevels: any): Promise<void> {
        const api = new ManagedClustersBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        await api.putClientLogConfiguration({
            id,
            clientLogConfigurationBeta: { durationMinutes: duration, clientId: 'Neovim', logLevels, rootLevel: 'INFO' }
        });
    }

    public async startExportJob(types: any[], options: any): Promise<string> {
        const api = new SPConfigBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const response = await api.exportSpConfig({ exportPayloadBeta: { includeTypes: types, objectOptions: options } });
        return response.data.jobId;
    }

    public async startImportJob(data: string): Promise<string> {
        const api = new SPConfigBetaApi(await this.deps.getApiConfiguration(), undefined, this.deps.getAxiosWithInterceptors());
        const formData = new FormData();
        formData.append('data', Buffer.from(data), 'import.json');
        const response = await api.importSpConfig(formData);
        return response.data.jobId;
    }
}
