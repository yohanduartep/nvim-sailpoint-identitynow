import { FolderTreeNode, isFolderTreeNode } from "../../models/TreeNode";
import { TenantInfo } from "../../models/TenantInfo";

export function findInTree<T extends (FolderTreeNode | TenantInfo)>(
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
