import { Memento } from "../../vscode";
import { TenantInfo } from "../../models/TenantInfo";
import { compareByName } from "../../utils";
import { FolderTreeNode, isFolderTreeNode, isTenantInfo } from "../../models/TreeNode";
import { findInTree } from "./TenantTreeUtil";
import { TenantMigration } from "./TenantMigration";
import { TenantTokenManager } from "./TenantTokenManager";

const TREE_KEY = "IDENTITYNOW_TREE";

export class TenantRepository {
    constructor(
        private storage: Memento,
        private tokenManager: TenantTokenManager
    ) {}

    public getRoots(): Array<TenantInfo | FolderTreeNode> {
        let roots = this.storage.get<Array<TenantInfo | FolderTreeNode>>(TREE_KEY);
        if (roots === undefined) {
            const migration = new TenantMigration(this.storage);
            roots = migration.migrateData();
        }

        roots = roots
            .filter(Boolean)
            .sort(compareByName);

        return roots;
    }

    public createOrUpdateInFolder(item: TenantInfo | FolderTreeNode, parentId?: string) {
        if (parentId) {
            const parent = this.getFolder(parentId);
            if (parent === undefined) {
                return;
            }
            if (parent.children) {
                parent.children.push(item);
            } else {
                parent.children = [item];
            }
            this.updateOrCreateNode(parent);
        } else {
            const roots = this.getRoots();
            roots.push(item);
            this.storage.update(TREE_KEY, roots);
        }
    }

    public getTenants(): TenantInfo[] {
        let roots = this.getRoots();
        let tenants = findInTree<TenantInfo>(
            roots,
            item => isTenantInfo(item),
            true
        );

        tenants = tenants
            .filter(Boolean)
            .sort(compareByName);
        return tenants;
    }

    public getNode(key: string): FolderTreeNode | TenantInfo | undefined {
        let roots = this.getRoots();

        const results = findInTree<FolderTreeNode>(
            roots,
            item => item.id === key,
            false
        );
        const folder = results.length > 0 ? results[0] : undefined;
        return folder;
    }

    public getFolder(key: string): FolderTreeNode | undefined {
        let roots = this.getRoots();

        const results = findInTree<FolderTreeNode>(
            roots,
            item => isFolderTreeNode(item) && item.id === key,
            false
        );
        const folder = results.length > 0 ? results[0] : undefined;
        return folder;
    }

    public getTenant(key: string): TenantInfo | undefined {
        let roots = this.getRoots();

        const results = findInTree<TenantInfo>(
            roots,
            item => isTenantInfo(item) && item.id === key,
            false
        );
        const tenantInfo = results.length > 0 ? results[0] : undefined;

        if (tenantInfo && !tenantInfo?.tenantName) {
            tenantInfo.tenantName = tenantInfo.name;
        }

        if (tenantInfo && !tenantInfo.id) {
            tenantInfo.id = tenantInfo.tenantName;
            this.updateOrCreateNode(tenantInfo);
        }

        if (tenantInfo && tenantInfo.readOnly === undefined) {
            tenantInfo.readOnly = false;
        }

        return tenantInfo;
    }

    public async getTenantByTenantName(tenantName: string): Promise<TenantInfo | undefined> {
        let roots = this.getRoots();

        const tenants = findInTree<TenantInfo>(
            roots,
            item => isTenantInfo(item) && item.tenantName === tenantName,
            true
        );

        if (tenants.length === 0) {
            return undefined;
        } else if (tenants.length === 1) {
            return tenants[0];
        }
        throw new Error("More than 1 tenant found for " + tenantName);
    }

    public updateOrCreateNode(value: TenantInfo | FolderTreeNode) {
        let items = this.getRoots();
        const id = value.id;

        function processFolder(folder: FolderTreeNode): boolean {
            if (!folder.children) return false;

            for (let i = 0; i < folder.children.length; i++) {
                const child = folder.children[i];

                if (child.id === id) {
                    folder.children[i] = value;
                    return true;
                }

                if (isFolderTreeNode(child)) {
                    const found = processFolder(child);
                    if (found) return true;
                }
            }

            return false;
        }

        let found = false;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.id === id) {
                items[i] = value;
                found = true;
                break;
            }

            if (isFolderTreeNode(item)) {
                found = processFolder(item);
                if (found) break;
            }
        }

        if (!found) {
            items.push(value);
        }

        this.storage.update(TREE_KEY, items);
    }

    public async removeNode(id: string, removeCredentials = true): Promise<boolean> {
        let roots = this.getRoots();
        let removed = false;

        function processFolder(folder: FolderTreeNode): boolean {
            if (!folder.children) return false;
            const childIndex = folder.children.findIndex((child: FolderTreeNode | TenantInfo) => child.id === id);

            if (childIndex !== -1) {
                folder.children.splice(childIndex, 1);
                return true;
            }
            if (!folder.children) return false;
            for (let i = 0; i < folder.children.length; i++) {
                const child = folder.children[i];
                if (isFolderTreeNode(child)) {
                    const removedChild = processFolder(child);
                    if (removedChild) return true;
                }
            }

            return false;
        }

        const topLevelIndex = roots.findIndex(item => item.id === id);

        if (topLevelIndex !== -1) {
            roots.splice(topLevelIndex, 1);
            removed = true;
        } else {
            for (const item of roots) {
                if (isFolderTreeNode(item)) {
                    removed = processFolder(item);
                    if (removed) break;
                }
            }
        }

        if (removed) {
            this.storage.update(TREE_KEY, roots);

            if (removeCredentials) {
                await this.tokenManager.removeTenantCredentials(id);
                await this.tokenManager.removeTenantAccessToken(id);
            }
        }
        return removed;
    }

    public moveNode(nodeIdToMove: string, targetFolderId?: string) {
        const items = this.getRoots();
        let nodeToMove: FolderTreeNode | TenantInfo | undefined;
        let nodeRemoved = false;

        const topLevelIndex = items.findIndex(item => item.id === nodeIdToMove);

        if (topLevelIndex !== -1) {
            nodeToMove = items[topLevelIndex];
            items.splice(topLevelIndex, 1);
            nodeRemoved = true;
        }

        function findAndRemoveNode(folder: FolderTreeNode): boolean {
            if (!folder.children) return false;

            const childIndex = folder.children.findIndex((child: FolderTreeNode | TenantInfo) => child.id === nodeIdToMove);

            if (childIndex !== -1) {
                nodeToMove = folder.children[childIndex];
                folder.children.splice(childIndex, 1);
                return true;
            }

            for (let i = 0; i < folder.children.length; i++) {
                const child = folder.children[i];
                if (isFolderTreeNode(child)) {
                    const removed = findAndRemoveNode(child);
                    if (removed) return true;
                }
            }

            return false;
        }

        if (!nodeRemoved) {
            for (const item of items) {
                if (isFolderTreeNode(item)) {
                    nodeRemoved = findAndRemoveNode(item);
                    if (nodeRemoved) break;
                }
            }
        }

        if (!nodeToMove) {
            return;
        }

        if (!targetFolderId) {
            items.push(nodeToMove);
            this.storage.update(TREE_KEY, items);
            return;
        }

        function addNodeToFolder(folder: FolderTreeNode): boolean {
            if (folder.id === targetFolderId) {
                if (!folder.children) {
                    folder.children = [];
                }
                folder.children.push(nodeToMove!);
                return true;
            }

            if (folder.children) {
                for (const child of folder.children) {
                    if (isFolderTreeNode(child)) {
                        const added = addNodeToFolder(child);
                        if (added) return true;
                    }
                }
            }

            return false;
        }

        let folderFound = false;
        for (const item of items) {
            if (isFolderTreeNode(item)) {
                folderFound = addNodeToFolder(item);
                if (folderFound) break;
            }
        }

        if (!folderFound) {
            items.push(nodeToMove);
        }
        this.storage.update(TREE_KEY, items);
    }

    public async removeFolderRecursively(id: string) {
        const folder = this.getFolder(id);
        if (!folder) return;

        const processFolder = async (folder: FolderTreeNode): Promise<void> => {
            if (!folder.children) return;

            for (let i = 0; i < folder.children.length; i++) {
                const child = folder.children[i];
                if (isFolderTreeNode(child)) {
                    await processFolder(child);
                } else if (isTenantInfo(child)) {
                    await this.tokenManager.removeTenantCredentials(child.id);
                    await this.tokenManager.removeTenantAccessToken(child.id);
                }
            }
        };
        await processFolder(folder);
        this.removeNode(folder.id, false);
    }

    public clearCache() {
        // This method is a placeholder for cache clearing logic if needed in the future
        // Currently, all caching is handled by TenantTokenManager
    }
}
