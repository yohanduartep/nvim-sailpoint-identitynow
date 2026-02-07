import axios, { AxiosInstance } from "axios";
import { configureAxios } from "./AxiosHandlers";
import { USER_AGENT, USER_AGENT_HEADER } from "./ISCClient";

// Represents an OAuth2 access token and its associated metadata.
export class AccessToken {
    private readonly access_token: string;
    private readonly token_type: string;
    private readonly expires_in: number;
    private readonly scope: string;
    private readonly tenant_id: string;
    private readonly pod: string;
    private readonly strong_auth_supported: boolean;
    private readonly org: string;
    private readonly identity_id: string;
    private readonly user_name: string;
    private readonly strong_auth: boolean;
    private readonly jti: string;

    // Returns the raw access token string.
    public get accessToken(): string {
        return this.access_token;
    }
    
    // Returns the expiration date of the token.
    public get expiresIn(): Date {
        const expires = new Date();
        expires.setSeconds(expires.getSeconds() + this.expires_in);
        return expires;
    }
}

// Client for handling OAuth2 authentication flows with SailPoint.
export class OAuth2Client {

    private static axiosInstances: Map<string, AxiosInstance> = new Map();

    // Initializes the client with credentials and the token endpoint.
    constructor(
        private clientId: string,
        private clientSecret: string,
        private tokenUrl: string,
    ) {

    }

    // Exchanges client credentials for a new OAuth2 access token.
    public async getAccessToken(): Promise<AccessToken> {
        const params = new URLSearchParams({
            "grant_type": "client_credentials",
            "client_id": this.clientId,
            "client_secret": this.clientSecret,
        });

        try {
            let instance = OAuth2Client.axiosInstances.get(this.tokenUrl);
            if (!instance) {
                instance = axios.create();
                instance.defaults.headers.common = {
                    [USER_AGENT_HEADER]: USER_AGENT
                };
                configureAxios(instance);
                OAuth2Client.axiosInstances.set(this.tokenUrl, instance);
            }

            const { data } = await instance.post<AccessToken>(this.tokenUrl, params);
            return Object.assign(new AccessToken(), data);
        } catch (error) {
            throw error;
        }
    }
}
