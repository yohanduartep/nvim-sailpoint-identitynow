import { SecretStorage } from "../../vscode";
import { TenantCredentials, TenantToken } from "../../models/TenantInfo";
import { isEmpty } from "../../utils";
import { logWarn } from "../logger";
import { sanitizeErrorMessage } from "../../utils/errorSanitizer";

const SECRET_PAT_PREFIX = "IDENTITYNOW_SECRET_PAT_";
const SECRET_AT_PREFIX = "IDENTITYNOW_SECRET_AT_";

export class TenantTokenManager {
    private readonly accessTokenCache = new Map<string, TenantToken>();
    private readonly credentialsCache = new Map<string, TenantCredentials>();

    constructor(private readonly secretStorage: SecretStorage) {}

    public async getTenantCredentials(tenantId: string): Promise<TenantCredentials | undefined> {
        const cached = this.credentialsCache.get(tenantId);
        if (cached) {
            return cached;
        }
        const credentialsStr = await this.secretStorage.get(this.getPatKey(tenantId));
        if (credentialsStr === undefined) {
            return undefined;
        }
        const credentials = JSON.parse(credentialsStr) as TenantCredentials;
        this.credentialsCache.set(tenantId, credentials);
        return credentials;
    }

    public async setTenantCredentials(tenantId: string, credentials: TenantCredentials) {
        this.credentialsCache.set(tenantId, credentials);
        await this.secretStorage.store(this.getPatKey(tenantId), JSON.stringify(credentials));
    }

    public async removeTenantCredentials(tenantId: string) {
        this.credentialsCache.delete(tenantId);
        const key = this.getPatKey(tenantId);
        await this.removeSecretKeyIfExists(key);
    }

    public async getTenantAccessToken(tenantId: string): Promise<TenantToken | undefined> {
        const cached = this.accessTokenCache.get(tenantId);
        if (cached) {
            return cached;
        }
        const tokenStr = await this.secretStorage.get(this.getAccessTokenKey(tenantId)) || "";
        let token: TenantToken | undefined = undefined;
        if (!isEmpty(tokenStr)) {
            try {
                const tokenJson: any = JSON.parse(tokenStr);
                token = new TenantToken(
                    tokenJson.accessToken,
                    tokenJson.expires,
                    {
                        clientId: tokenJson.client.clientId,
                        clientSecret: tokenJson.client.clientSecret
                    });
                this.accessTokenCache.set(tenantId, token);
            } catch (err) {
                const sanitized = sanitizeErrorMessage(err);
                logWarn(`WARNING: could not parse Token: ${sanitized}`);
            }
        } else {
            logWarn("WARNING: no token for tenant", tenantId);
        }
        return token;
    }

    public async setTenantAccessToken(tenantId: string, token: TenantToken) {
        this.accessTokenCache.set(tenantId, token);
        await this.secretStorage.store(
            this.getAccessTokenKey(tenantId),
            JSON.stringify(token));
    }

    public async removeTenantAccessToken(tenantId: string) {
        this.accessTokenCache.delete(tenantId);
        const key = this.getAccessTokenKey(tenantId);
        await this.removeSecretKeyIfExists(key);
    }

    private getPatKey(tenantId: string): string {
        return SECRET_PAT_PREFIX + tenantId;
    }

    private getAccessTokenKey(tenantId: string): string {
        return SECRET_AT_PREFIX + tenantId;
    }

    private async removeSecretKeyIfExists(key: string) {
        const secret = await this.secretStorage.get(key);
        if (secret !== undefined) {
            await this.secretStorage.delete(key);
        }
    }
}
