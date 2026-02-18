import { Memento } from "../../vscode";
import { TenantInfo } from "../../models/TenantInfo";

const TENANT_PREFIX = "IDENTITYNOW_TENANT_";
const ALL_TENANTS_KEY = "IDENTITYNOW_TENANTS";
const TREE_KEY = "IDENTITYNOW_TREE";

export class TenantMigration {
    constructor(private storage: Memento) {}

    private getTenantOld(key: string): TenantInfo | undefined {
        const tenantInfo = this.storage.get<TenantInfo>(TENANT_PREFIX + key);
        if (!tenantInfo) {
            return undefined;
        }
        if (tenantInfo && !tenantInfo?.tenantName) {
            tenantInfo.tenantName = tenantInfo.name;
        }

        if (tenantInfo && !tenantInfo.id) {
            tenantInfo.id = tenantInfo.tenantName;
        }

        if (tenantInfo && tenantInfo.readOnly === undefined) {
            tenantInfo.readOnly = false;
        }

        tenantInfo.type = "TENANT";

        return tenantInfo;
    }

    public migrateData(): TenantInfo[] {
        let tenants = this.storage.get<string[]>(ALL_TENANTS_KEY);
        if (tenants === undefined) {
            return [];
        }

        let tenantInfoItems = tenants.map(key => this.getTenantOld(key)).filter((t): t is TenantInfo => !!t);

        this.storage.update(TREE_KEY, tenantInfoItems);
        return tenantInfoItems;
    }
}
