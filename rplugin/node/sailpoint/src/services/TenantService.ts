import { Memento, SecretStorage } from "../vscode";
import { TenantCredentials, TenantInfo, TenantToken } from "../models/TenantInfo";
import { compareByName } from "../utils";
import { isEmpty } from '../utils/stringUtils';
import { Subject } from "./Subject";
import { Observer } from "./Observer";
import { EventEmitter } from 'events';
import { FolderTreeNode, isFolderTreeNode, isTenantInfo } from "../models/TreeNode";

const SECRET_PAT_PREFIX = "IDENTITYNOW_SECRET_PAT_";
const SECRET_AT_PREFIX = "IDENTITYNOW_SECRET_AT_";
const TENANT_PREFIX = "IDENTITYNOW_TENANT_";
const ALL_TENANTS_KEY = "IDENTITYNOW_TENANTS";
const TREE_KEY = "IDENTITYNOW_TREE";

// Enum representing the types of events emitted by the TenantService.
export enum TenantServiceEventType {
    removeTenant = "REMOVE_TENANT",
    updateTree = "UPDATE_TREE", 
}

// Internal helper function to search through the tenant/folder tree structure.
function findInTree<T extends (FolderTreeNode | TenantInfo)>(
    items: Array<FolderTreeNode | TenantInfo>,
    predicate: (item: FolderTreeNode | TenantInfo) => boolean,
    findAll: boolean = false
): T[] {
    const results: T[] = [];

    function traverse(item: FolderTreeNode | TenantInfo) {
        if (predicate(item)) {
            results.push(item as T);
            if (!findAll) {
                return true; 
            }
        }

        if (isFolderTreeNode(item) && item.children) {
            for (const child of item.children) {
                const found = traverse(child);
                if (found && !findAll) {
                    return true; 
                }
            }
        }

        return false; 
    }

    for (const item of items) {
        const found = traverse(item);
        if (found && !findAll) {
            break; 
        }
    }

    return results;
}

// Service for managing SailPoint tenants, folders, and their associated credentials.
export class TenantService implements Subject<TenantServiceEventType, any> {

    private readonly eventEmitter = new EventEmitter();

    // Initializes the service with storage and secret storage mechanisms.
    constructor(private storage: Memento, private readonly secretStorage: SecretStorage,) { }

    // Registers an observer for a specific service event.
    public registerObserver(t: TenantServiceEventType, o: Observer<TenantServiceEventType, any>): void {
        this.eventEmitter.on(t, o.update)
    }

    // Removes an observer for a specific service event.
    public removeObserver(t: TenantServiceEventType, o: Observer<TenantServiceEventType, any>): void {
        this.eventEmitter.removeListener(t, o.update);
    }

    // Notifies all registered observers about an event.
    public notifyObservers(t: TenantServiceEventType, message: any): void | Promise<void> {
        this.eventEmitter.emit(t, message)
    }

    // Retrieves tenant information using the legacy flat storage format.
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
            this.updateOrCreateNode(tenantInfo);
        }

        if (tenantInfo && tenantInfo.readOnly === undefined) {
            tenantInfo.readOnly = false
        }

        tenantInfo.type = "TENANT"

        return tenantInfo;
    }

    // Migrates legacy flat tenant storage into the new tree structure.
    private migrateData(): TenantInfo[] {
        let tenants = this.storage.get<string[]>(ALL_TENANTS_KEY);
        if (tenants === undefined) {
            return [];
        }

        let tenantInfoItems = tenants.map(key => this.getTenantOld(key)).filter((t): t is TenantInfo => !!t);

        this.storage.update(TREE_KEY, tenantInfoItems)
        this.notifyObservers(TenantServiceEventType.updateTree, {})
        return tenantInfoItems
    }

    // Returns the top-level nodes of the tenant tree.
    public getRoots(): Array<TenantInfo | FolderTreeNode> {
        let roots = this.storage.get<Array<TenantInfo | FolderTreeNode>>(TREE_KEY);
        if (roots === undefined) {
            roots = this.migrateData()
        }

        roots = roots
            .filter(Boolean) 
            .sort(compareByName)

        return roots
    }

    // Creates or updates a node within a specific folder or at the root level.
    public createOrUpdateInFolder(item: TenantInfo | FolderTreeNode, parentId?: string) {
        if (parentId) {
            const parent = this.getFolder(parentId)
            if (parent === undefined) {
                return
            }
            if (parent.children) {
                parent.children.push(item)
            } else {
                parent.children = [item]
            }
            this.updateOrCreateNode(parent)
        } else {
            const roots = this.getRoots()
            roots.push(item)
            this.storage.update(TREE_KEY, roots)
            this.notifyObservers(TenantServiceEventType.updateTree, {})
        }
    }

    // Retrieves a flat list of all tenants across the entire tree.
    public getTenants(): TenantInfo[] {
        let roots = this.getRoots()
        let tenants = findInTree<TenantInfo>(
            roots,
            item => isTenantInfo(item),
            true
        );

        tenants = tenants
            .filter(Boolean) 
            .sort(compareByName)
        return tenants;
    }

    // Finds a specific node (tenant or folder) by its unique ID.
    public getNode(key: string): FolderTreeNode | TenantInfo | undefined {
        let roots = this.getRoots()

        const results = findInTree<FolderTreeNode>(
            roots,
            item => item.id === key,
            false 
        );
        const folder = results.length > 0 ? results[0] : undefined;
        return folder;
    }

    // Retrieves a specific folder node by its ID.
    public getFolder(key: string): FolderTreeNode | undefined {
        let roots = this.getRoots()

        const results = findInTree<FolderTreeNode>(
            roots,
            item => isFolderTreeNode(item) && item.id === key,
            false 
        );
        const folder = results.length > 0 ? results[0] : undefined;
        return folder;
    }

    // Retrieves a specific tenant node by its ID and ensures required properties are set.
    public getTenant(key: string): TenantInfo | undefined {
        let roots = this.getRoots()

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
            tenantInfo.readOnly = false
        }

        return tenantInfo;
    }

    // Retrieves a tenant node searching specifically by the tenant's hostname/name.
    public async getTenantByTenantName(tenantName: string): Promise<TenantInfo | undefined> {

        let roots = this.getRoots()

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

    // Updates an existing node in the tree or adds it to the root if not found.
    public updateOrCreateNode(value: TenantInfo | FolderTreeNode) {
        let items = this.getRoots()
        const id = value.id

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

        let found = false

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.id === id) {
                items[i] = value;
                found = true
                break
            }

            if (isFolderTreeNode(item)) {
                found = processFolder(item);
                if (found) break;
            }
        }

        if (!found) {
            items.push(value)
        }

        this.storage.update(TREE_KEY, items);
        this.notifyObservers(TenantServiceEventType.updateTree, {})
    }

    // Removes a node from the tree and optionally deletes its associated credentials.
    public async removeNode(id: string, removeCredentials = true): Promise<boolean> {
        let roots = this.getRoots()
        let removed = false

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
            removed = true
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
            this.notifyObservers(TenantServiceEventType.updateTree, {})

            if (removeCredentials) {
                await this.removeTenantCredentials(id);
                await this.removeTenantAccessToken(id);
            }
        }
        return removed
    }

    // Returns the children of a specific folder node.
    public getChildren(id: string) {
        const node = this.getNode(id)
        if (node && isFolderTreeNode(node)) {
            return node.children
        }
        return undefined
    }

    // Moves a node from its current location to a new target folder or to the root.
    public move(nodeIdToMove: string, targetFolderId?: string) {
        const items = this.getRoots()
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
            this.notifyObservers(TenantServiceEventType.updateTree, {})
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
        this.notifyObservers(TenantServiceEventType.updateTree, {})
    }

    // Removes a folder and all its contents (including child tenants and their credentials) recursively.
    public async removeFolderRecursively(id: string) {
        const folder = this.getFolder(id)
        if (!folder) return;

        const processFolder = async (folder: FolderTreeNode): Promise<void> => {
            if (!folder.children) return;

            for (let i = 0; i < folder.children.length; i++) {
                const child = folder.children[i];
                if (isFolderTreeNode(child)) {
                    await processFolder(child);
                } else if (isTenantInfo(child)) {
                    await this.removeTenantCredentials(child.id);
                    await this.removeTenantAccessToken(child.id);
                }
            }
        }
        await processFolder(folder)
        this.removeNode(folder.id, false)
    }

    // Retrieves the stored Personal Access Token (PAT) credentials for a tenant.
    public async getTenantCredentials(tenantId: string): Promise<TenantCredentials | undefined> {
        const credentialsStr = await this.secretStorage.get(this.getPatKey(tenantId));
        if (credentialsStr === undefined) {
            return undefined;
        }
        const credentials = JSON.parse(credentialsStr) as TenantCredentials;
        return credentials;
    }

    // Persists the Personal Access Token (PAT) credentials for a tenant in secret storage.
    public async setTenantCredentials(tenantId: string, credentials: TenantCredentials) {
        await this.secretStorage.store(this.getPatKey(tenantId), JSON.stringify(credentials));
    }

    // Deletes the stored Personal Access Token (PAT) credentials for a tenant.
    public async removeTenantCredentials(tenantId: string) {
        const key = this.getPatKey(tenantId);
        await this.removeSecretKeyIfExists(key);
    }

    // Retrieves the cached access token for a specific tenant.
    public async getTenantAccessToken(tenantId: string): Promise<TenantToken | undefined> {
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
            } catch (err) {
                console.log("WARNING: could not parse Token: ", err);
            }
        } else {
            console.log("WARNING: no token for tenant", tenantId);
        }
        return token;
    }

    // Caches a tenant's access token in secret storage.
    public async setTenantAccessToken(tenantId: string, token: TenantToken) {
        await this.secretStorage.store(
            this.getAccessTokenKey(tenantId),
            JSON.stringify(token));
    }

    // Deletes a tenant's cached access token.
    public async removeTenantAccessToken(tenantId: string) {
        const key = this.getAccessTokenKey(tenantId);
        await this.removeSecretKeyIfExists(key);
    }

    // Returns the internal storage key for a tenant's PAT credentials.
    private getPatKey(tenantId: string): string {
        return SECRET_PAT_PREFIX
            + tenantId;
    }

    // Returns the internal storage key for a tenant's cached access token.
    private getAccessTokenKey(tenantId: string): string {
        return SECRET_AT_PREFIX
            + tenantId;
    }

    // Internal helper to safely delete a key from secret storage if it exists.
    private async removeSecretKeyIfExists(key: string) {
        const secret = await this.secretStorage.get(key);
        if (secret !== undefined) {
            await this.secretStorage.delete(key);
        }
    }
}