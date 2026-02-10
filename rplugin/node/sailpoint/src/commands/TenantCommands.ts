import { Neovim } from 'neovim';
import { TenantService } from '../services/TenantService';
import { SailPointISCAuthenticationProvider } from '../services/AuthenticationProvider';
import { AuthenticationMethod } from '../models/TenantInfo';
import { handleError } from '../errors';
import axios from 'axios';

export class TenantCommands {
    constructor(
        private readonly nvim: Neovim,
        private readonly tenantService: TenantService
    ) {}

    public async addTenant(args: any[]): Promise<void> {
        const [name, prefix, clientId, clientSecret, domainArg] = args;
        const domain = domainArg || 'identitynow.com';
        const tenantName = `${prefix}.api.${domain}`;
        const tempId = `temp-${Date.now()}`;
        let tempCreated = false;
        try {
            this.nvim.outWrite(`SailPoint: Adding tenant ${name} (${tenantName})...
`);
            await this.tenantService.updateOrCreateNode({ id: tempId, tenantName, name, type: "TENANT", readOnly: false, authenticationMethod: AuthenticationMethod.personalAccessToken });
            tempCreated = true;
            await this.tenantService.setTenantCredentials(tempId, { clientId, clientSecret });
            const session = await SailPointISCAuthenticationProvider.getInstance().createSession(tempId);
            
            let detectedVersion = 'v3';
            for (const v of ['v2025', 'v2024', 'v3', 'v2', 'v1']) {
                 try { 
                    await axios.get(`https://${tenantName}/${v}/sources?limit=1`, { headers: { 'Authorization': `Bearer ${session.accessToken}` }, timeout: 5000 }); 
                    detectedVersion = v; break; 
                 } catch (e) {}
            }
            const finalId = `${prefix}-${detectedVersion}`;
            await this.tenantService.removeNode(tempId);
            tempCreated = false;
            await this.tenantService.updateOrCreateNode({ id: finalId, tenantName, name: name, type: "TENANT", readOnly: false, authenticationMethod: AuthenticationMethod.personalAccessToken, version: detectedVersion });
            await this.tenantService.setTenantCredentials(finalId, { clientId, clientSecret });
            this.nvim.outWrite(`Successfully configured ${name} (ID: ${finalId})
`);
            await this.nvim.command("SPIPrefetchAll");
        } catch (e: any) {
            handleError(this.nvim, e, 'adding tenant');
        } finally {
            if (tempCreated) {
                await this.tenantService.removeNode(tempId);
            }
        }
    }

    public async removeTenant(args: any[], allResourceTypes: string[], resourceCachePrefix: string, globalStorage: any): Promise<void> {
        const id = args[0];
        if (await this.tenantService.removeNode(id)) {
            const remaining = this.tenantService.getTenants();
            if (remaining.length === 0) {
                for (const type of allResourceTypes) {
                    await globalStorage.update(resourceCachePrefix + type, null);
                    await this.nvim.executeLua('SailPointUpdateCache(...)', [type, [], 'No tenants configured.']);
                }
            }
            this.nvim.outWrite(`Successfully removed tenant: ${id}
`); 
            await this.nvim.command("SPIPrefetchAll");
        } else {
            this.nvim.errWrite(`Error: Tenant '${id}' not found.
`);
        }
    }

    public async switchTenant(args: any[], updateActiveIndex: (idx: number) => Promise<void>): Promise<void> {
        const tenants = this.tenantService.getTenants();
        const arg = args[0];
        const idx = isNaN(parseInt(arg)) ? tenants.findIndex(t => t.id === arg) : parseInt(arg);
        
        if (idx >= 0 && idx < tenants.length) { 
            await updateActiveIndex(idx);
            this.nvim.outWrite(`Switched to ${tenants[idx].name}
`); 
            await this.nvim.command("SPIPrefetchAll");
        } else {
            this.nvim.errWrite(`Error: Tenant '${arg}' not found.
`);
        }
    }
}
