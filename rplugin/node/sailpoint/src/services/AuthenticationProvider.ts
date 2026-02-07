import {
    window,
} from '../vscode';
import { AuthenticationMethod, TenantCredentials, TenantToken } from '../models/TenantInfo';
import { parseJwt } from '../utils';
import { isEmpty } from '../utils/stringUtils';
import { EndpointUtils } from '../utils/EndpointUtils';
import { TenantService } from './TenantService';
import { OAuth2Client } from './OAuth2Client';

// Represents an authenticated session for a specific SailPoint tenant.
class SailPointISCPatSession {
    constructor(
        public readonly accessToken: string,
    ) { }
}

// Prompts the user to enter a Personal Access Token (PAT) Client ID.
async function askPATClientId(): Promise<string | undefined> {
    const result = await window.showInputBox({
        value: '',
        ignoreFocusOut: true,
        placeHolder: 'Client ID',
        prompt: 'Enter a Personal Access Token (PAT) Client ID.',
        title: 'Identity Security Cloud',
        validateInput: text => /^[a-f0-9]{32}$/.test(text) ? null : "Invalid client ID"
    });
    return result;
}

// Prompts the user to enter a Personal Access Token (PAT) Secret.
async function askPATClientSecret(): Promise<string | undefined> {
    const result = await window.showInputBox({
        value: '',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Secret',
        prompt: 'Enter a Personal Access Token (PAT) Secret.',
        title: 'Identity Security Cloud',
        validateInput: text => /^[a-f0-9]{63,64}$/.test(text) ? null : "Invalid secret"
    });
    return result;
}

// Prompts the user to enter a raw Access Token (JWT).
async function askAccessToken(): Promise<string | undefined> {
    const result = await window.showInputBox({
        value: '',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'JWT Token',
        prompt: 'Enter an Access Token.',
        title: 'Identity Security Cloud',
        validateInput: text => /^([a-zA-Z0-9_=]+)\.([a-zA-Z0-9_=]+)\.([a-zA-Z0-9_+/=-]+)$/.test(text) ? null : "Invalid access token"
    });
    return result;
}

// Provider for managing SailPoint Identity Security Cloud authentication and session lifecycle.
export class SailPointISCAuthenticationProvider {

    private static instance: SailPointISCAuthenticationProvider

    private constructor(private readonly tenantService: TenantService) { }

    // Initializes the singleton instance of the authentication provider.
    public static initialize(tenantService: TenantService) {
        SailPointISCAuthenticationProvider.instance = new SailPointISCAuthenticationProvider(tenantService)
    }

    // Returns the singleton instance of the authentication provider.
    public static getInstance(): SailPointISCAuthenticationProvider {
        return SailPointISCAuthenticationProvider.instance;
    }

    // Retrieves an existing session or initiates a new one for the specified tenant.
    public async getSessionByTenant(tenantId: string): Promise<SailPointISCPatSession | null> {
        let token = await this.tenantService.getTenantAccessToken(tenantId);
        const tenantInfo = this.tenantService.getTenant(tenantId);
        if (token === undefined || token.expired()) {
            if (tenantInfo?.authenticationMethod === AuthenticationMethod.accessToken) {
                const accessToken = await askAccessToken() || "";
                if (isEmpty(accessToken)) throw new Error('Access Token is required');
                const jwt = parseJwt(accessToken);
                const token = new TenantToken(accessToken, new Date(jwt.exp * 1000), { clientId: jwt.client_id } as TenantCredentials);
                this.tenantService.setTenantAccessToken(tenantId, token);
                return new SailPointISCPatSession(accessToken)
            } else {
                const credentials = await this.tenantService.getTenantCredentials(tenantId);
                if (credentials !== undefined) {
                    try {
                        token = await this.createAccessToken(tenantInfo?.tenantName ?? tenantId, credentials.clientId, credentials.clientSecret);
                        this.tenantService.setTenantAccessToken(tenantId, token);
                        return new SailPointISCPatSession(token.accessToken);
                    } catch (error) { console.error(error); }
                    return null;
                }
            }
        } else {
            return new SailPointISCPatSession(token.accessToken)
        }
        return null;
    }

    // Triggers a new authentication session, checking for existing credentials first.
    async createSession(tenantId: string): Promise<SailPointISCPatSession> {
        const tenantInfo = this.tenantService.getTenant(tenantId);
        const credentials = await this.tenantService.getTenantCredentials(tenantId);

        if (tenantInfo?.authenticationMethod === AuthenticationMethod.accessToken) {
            const accessToken = await askAccessToken() || "";
            if (isEmpty(accessToken)) throw new Error('Access Token is required');
            const jwt = parseJwt(accessToken);
            const token = new TenantToken(accessToken, new Date(jwt.exp * 1000), {} as TenantCredentials);
            this.tenantService.setTenantAccessToken(tenantId, token);
            return new SailPointISCPatSession(accessToken);
        } else {
            let clientId = credentials?.clientId;
            let clientSecret = credentials?.clientSecret;

            if (!clientId) clientId = await askPATClientId() || "";
            if (isEmpty(clientId)) throw new Error('Client ID is required');

            if (!clientSecret) clientSecret = await askPATClientSecret() || "";
            if (isEmpty(clientSecret)) throw new Error('Client Secret is required');

            const token = await this.createAccessToken(tenantInfo?.tenantName ?? tenantId, clientId, clientSecret);
            this.tenantService.setTenantCredentials(tenantId, { clientId, clientSecret });
            return new SailPointISCPatSession(token.accessToken)
        }
    }

    // Internally creates a new access token using client credentials.
    private async createAccessToken(tenantName: string, clientId: string, clientSecret: string): Promise<TenantToken> {
        const iscAuth = new OAuth2Client(clientId, clientSecret, `https://${tenantName}/oauth/token`);
        const oauth2token = await iscAuth.getAccessToken();
        const token = new TenantToken(oauth2token.accessToken, oauth2token.expiresIn, { clientId, clientSecret });
        this.tenantService.setTenantAccessToken(tenantName, token);
        return token;
    }

    // Removes the active session for the specified tenant.
    async removeSession(tenantId: string): Promise<void> {
        this.tenantService.removeTenantAccessToken(tenantId);
    }
}
