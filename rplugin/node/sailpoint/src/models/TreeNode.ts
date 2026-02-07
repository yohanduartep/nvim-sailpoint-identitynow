import { TenantInfo } from "./TenantInfo";

// Represents a folder in the tenant tree structure.
export interface FolderTreeNode {
    id: string;
    name: string;
    type: "FOLDER";
    children: Array<FolderTreeNode | TenantInfo>;
}

// Type guard to check if a node is a TenantInfo object.
export function isTenantInfo(item: any): item is TenantInfo {
    return item !== null && item !== undefined && item.type === "TENANT";
}

// Type guard to check if a node is a FolderTreeNode object.
export function isFolderTreeNode(item: any): item is FolderTreeNode {
    return item !== null && item !== undefined && item.type === "FOLDER";
}
