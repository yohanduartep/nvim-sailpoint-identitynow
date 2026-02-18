import { Neovim } from 'neovim';
import { TenantService } from '../services/TenantService';
import { SailPointISCAuthenticationProvider } from '../services/AuthenticationProvider';
import { AuthenticationMethod } from '../models/TenantInfo';
import { handleError } from '../errors';
import { sanitizeErrorMessage } from '../utils/errorSanitizer';
import axios from 'axios';

export class TenantCommands {
    constructor(
        private readonly nvim: Neovim,
        private readonly tenantService: TenantService
    ) {}

    private requireString(value: string | number | boolean | null | undefined, label: string): string {
        const normalized = String(value ?? '').trim();
        if (!normalized) {
            throw new Error(`${label} is required`);
        }
        return normalized;
    }

    public async addTenant(args: Array<string | number | boolean | null | undefined>): Promise<void> {
        const [nameArg, prefixArg, clientIdArg, clientSecretArg, domainArg] = args;
        const name = this.requireString(nameArg, 'Tenant name');
        const prefix = this.requireString(prefixArg, 'Tenant prefix');
        const clientId = this.requireString(clientIdArg, 'Client ID');
        const clientSecret = this.requireString(clientSecretArg, 'Client Secret');
        const domain = String(domainArg || 'identitynow.com').trim();
        const tenantName = `${prefix}.api.${domain}`;
        
        try {
            this.nvim.outWrite(`SailPoint: Adding tenant ${name} (${tenantName})...\n`);
            
            // Probe API version without creating tenant
            const currentYear = new Date().getUTCFullYear();
            const yearlyCandidates = Array.from({ length: 8 }, (_, i) => `v${currentYear + 1 - i}`);
            const classicCandidates = ['v3', 'v2', 'v1'];
            const versionCandidates = [...yearlyCandidates, ...classicCandidates];
            let detectedVersion = classicCandidates[0];
            
            // Get token directly for probing
            const authService = SailPointISCAuthenticationProvider.getInstance();
            const tokenUrl = `https://${tenantName}/oauth/token`;
            
            try {
                // Use URLSearchParams to prevent secret exposure in logs
                const params = new URLSearchParams({
                    'grant_type': 'client_credentials',
                    'client_id': clientId,
                    'client_secret': clientSecret
                });
                
                const tokenResponse = await axios.post(tokenUrl, params, { 
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000 
                });
                const accessToken = tokenResponse.data.access_token;
                
                // Probe all versions in parallel for faster detection
                this.nvim.outWrite(`SailPoint: Detecting API version...\n`);
                
                const probeVersion = async (v: string): Promise<string | null> => {
                    try {
                        await axios.get(`https://${tenantName}/${v}/sources?limit=1`, { 
                            headers: { 'Authorization': `Bearer ${accessToken}` }, 
                            timeout: 3000  // Reduced timeout for parallel probing
                        });
                        return v;
                    } catch {
                        return null;
                    }
                };
                
                // Try all versions simultaneously
                const results = await Promise.all(versionCandidates.map(probeVersion));
                const validVersions = results.filter((v): v is string => v !== null);
                
                if (validVersions.length > 0) {
                    // Pick the first valid version (newest due to candidate order)
                    detectedVersion = validVersions[0];
                    this.nvim.outWrite(`SailPoint: Detected version ${detectedVersion}\n`);
                } else {
                    // Fallback to v3 if no version detected
                    this.nvim.outWrite(`SailPoint: No version detected, defaulting to v3\n`);
                    detectedVersion = 'v3';
                }
            } catch (e: unknown) {
                const msg = sanitizeErrorMessage(e);
                throw new Error(`Failed to authenticate with SailPoint: ${msg}`);
            }
            
            const finalId = `${prefix}-${detectedVersion}`;
            await this.tenantService.updateOrCreateNode({ 
                id: finalId, 
                tenantName, 
                name: name, 
                type: "TENANT", 
                readOnly: false, 
                authenticationMethod: AuthenticationMethod.personalAccessToken, 
                version: detectedVersion 
            });
            await this.tenantService.setTenantCredentials(finalId, { clientId, clientSecret });
            this.nvim.outWrite(`Successfully configured ${name} (ID: ${finalId})\n`);
        } catch (e: unknown) {
            handleError(this.nvim, e, 'adding tenant');
        }
    }

    public async removeTenant(
        args: Array<string | number | boolean | null | undefined>,
        allResourceTypes: string[],
        resourceCachePrefix: string,
        globalStorage: { clearByPrefix?: (prefix: string) => Promise<void>; update: (key: string, value: unknown) => Promise<void> },
        tenantCache?: { clearTenant?: (tenantId: string) => Promise<number> }
    ): Promise<void> {
        const id = String(args[0] || '');
        if (await this.tenantService.removeNode(id)) {
            if (globalStorage?.clearByPrefix) {
                await globalStorage.clearByPrefix(`${id}_`);
            }
            if (tenantCache?.clearTenant) {
                await tenantCache.clearTenant(id);
            }
            const remaining = this.tenantService.getTenants();
            if (remaining.length === 0) {
                for (const type of allResourceTypes) {
                    await globalStorage.update(resourceCachePrefix + type, null);
                    await this.nvim.executeLua('SailPointUpdateCache(...)', [type, [], 'No tenants configured.']);
                }
            }
            this.nvim.outWrite(`Successfully removed tenant: ${id}
`); 
        } else {
            this.nvim.outWrite(`Error: Tenant '${id}' not found.
`);
        }
    }

    public async switchTenant(
        args: Array<string | number | boolean | null | undefined>,
        updateActiveIndex: (idx: number) => Promise<void>
    ): Promise<void> {
        const tenants = this.tenantService.getTenants();
        const arg = String(args[0] || '');
        const parsed = Number(arg);
        const idx = Number.isNaN(parsed) ? tenants.findIndex(t => t.id === arg) : parsed;
        
        if (idx >= 0 && idx < tenants.length) { 
            await updateActiveIndex(idx);
            this.nvim.outWrite(`Switched to ${tenants[idx].name}
`); 
        } else {
            this.nvim.outWrite(`Error: Tenant '${arg}' not found.
`);
        }
    }
}
