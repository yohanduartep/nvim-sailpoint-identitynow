import { Uri } from "../vscode";

// Utility class for constructing SailPoint API and authentication URLs.
export class EndpointUtils {

    // Constructs the base API URL for a given tenant.
    public static getBaseUrl(tenantName: string): string {
        if (tenantName.includes('pstmn.io') || tenantName.includes('localhost')) {
            return `https://${tenantName}`;
        }

        let tenant = tenantName;
        let domain = 'identitynow.com';

        if (tenantName.indexOf('.') > 0) {
            const parts = tenantName.split('.');
            tenant = parts[0];
            domain = parts.slice(1).join('.');
        }

        return `https://${tenant}.api.${domain}`;
    }

    // Returns the OAuth token endpoint URL for the tenant.
    public static getAccessTokenUrl(tenantName: string): string {
        const baseApiUrl = this.getBaseUrl(tenantName);
        return baseApiUrl + '/oauth/token';
    }

    // Returns the v3 API endpoint URL for the tenant.
    public static getV3Url(tenantName: string): string {
        const baseApiUrl = this.getBaseUrl(tenantName);
        return baseApiUrl + '/v3';
    }

    // Returns the v2025 API endpoint URL for the tenant.
    public static getV2025Url(tenantName: string): string {
        const baseApiUrl = this.getBaseUrl(tenantName);
        return baseApiUrl + '/v2025';
    }

    // Returns the API endpoint URL for a specific version.
    public static getDynamicUrl(tenantName: string, version: string): string {
        const baseApiUrl = this.getBaseUrl(tenantName);
        return `${baseApiUrl}/${version}`;
    }
}
