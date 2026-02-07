// Supported authentication methods for SailPoint tenants.
export enum AuthenticationMethod {
    personalAccessToken,
    accessToken
}

// Represents metadata and configuration for a SailPoint tenant.
export interface TenantInfo {
    id: string;
    name: string;
    tenantName: string;
    authenticationMethod: AuthenticationMethod;
    readOnly: boolean;
    type: "TENANT";
    version?: string; // e.g., "v3", "v2025"
}

// Represents client credentials (ID and Secret) for a tenant.
export interface TenantCredentials {
    clientId: string;
    clientSecret: string;
}

// Represents an OAuth2 access token specifically for a SailPoint tenant.
export class TenantToken {
    public readonly accessToken: string;
    public readonly expires: Date;
    public readonly client: TenantCredentials;
    constructor(
        accessToken: string,
        expires: Date | string,
        client: TenantCredentials
    ) {
        this.accessToken = accessToken;
        this.client = client;

        if (expires instanceof Date) {
            this.expires = expires;
        } else {
            this.expires = new Date(expires);
        }
    };

    // Checks if the token has passed its expiration time.
    expired(): boolean {
        return Date.now() > this.expires.getTime();
    }
}