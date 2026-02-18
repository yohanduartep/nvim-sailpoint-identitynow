import { Memento, SecretStorage } from "../vscode";
import { TenantCredentials, TenantInfo, TenantToken } from "../models/TenantInfo";
import { FolderTreeNode, isFolderTreeNode } from "../models/TreeNode";
import { TenantRepository } from "./tenant/TenantRepository";
import { TenantTokenManager } from "./tenant/TenantTokenManager";

export enum TenantServiceEventType {
    removeTenant = "REMOVE_TENANT",
    updateTree = "UPDATE_TREE", 
}

export class TenantService {

    private readonly repository: TenantRepository;
    private readonly tokenManager: TenantTokenManager;

    constructor(private storage: Memento, private readonly secretStorage: SecretStorage) {
        this.tokenManager = new TenantTokenManager(secretStorage);
        this.repository = new TenantRepository(storage, this.tokenManager);
    }

    public getRoots(): Array<TenantInfo | FolderTreeNode> {
        return this.repository.getRoots();
    }

    public createOrUpdateInFolder(item: TenantInfo | FolderTreeNode, parentId?: string) {
        this.repository.createOrUpdateInFolder(item, parentId);
    }

    public getTenants(): TenantInfo[] {
        return this.repository.getTenants();
    }

    public getNode(key: string): FolderTreeNode | TenantInfo | undefined {
        return this.repository.getNode(key);
    }

    public getFolder(key: string): FolderTreeNode | undefined {
        return this.repository.getFolder(key);
    }

    public getTenant(key: string): TenantInfo | undefined {
        return this.repository.getTenant(key);
    }

    public async getTenantByTenantName(tenantName: string): Promise<TenantInfo | undefined> {
        return this.repository.getTenantByTenantName(tenantName);
    }

    public updateOrCreateNode(value: TenantInfo | FolderTreeNode) {
        this.repository.updateOrCreateNode(value);
    }

    public async removeNode(id: string, removeCredentials = true): Promise<boolean> {
        return this.repository.removeNode(id, removeCredentials);
    }

    public getChildren(id: string) {
        const node = this.repository.getNode(id);
        if (node && isFolderTreeNode(node)) {
            return node.children;
        }
        return undefined;
    }

    public move(nodeIdToMove: string, targetFolderId?: string) {
        this.repository.moveNode(nodeIdToMove, targetFolderId);
    }

    public async removeFolderRecursively(id: string) {
        await this.repository.removeFolderRecursively(id);
    }

    public async getTenantCredentials(tenantId: string): Promise<TenantCredentials | undefined> {
        return this.tokenManager.getTenantCredentials(tenantId);
    }

    public async setTenantCredentials(tenantId: string, credentials: TenantCredentials) {
        await this.tokenManager.setTenantCredentials(tenantId, credentials);
    }

    public async removeTenantCredentials(tenantId: string) {
        await this.tokenManager.removeTenantCredentials(tenantId);
    }

    public async getTenantAccessToken(tenantId: string): Promise<TenantToken | undefined> {
        return this.tokenManager.getTenantAccessToken(tenantId);
    }

    public async setTenantAccessToken(tenantId: string, token: TenantToken) {
        await this.tokenManager.setTenantAccessToken(tenantId, token);
    }

    public async removeTenantAccessToken(tenantId: string) {
        await this.tokenManager.removeTenantAccessToken(tenantId);
    }
}
