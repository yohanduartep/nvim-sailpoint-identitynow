import { Uri } from "../vscode";

// Utility for constructing IdentityNow URLs and deep links.
export class UriUtils {

    // Internal helper to build a base link for a resource.
    private static getBaseLink(tenantName: string, type: string, id: string, version: string = 'v3'): string {
        return `https://${tenantName}/${version}/${type}/${id}`;
    }

    // Returns a link to view a source in the browser.
    public static getSourceLink(tenantName: string, id: string, version: string = 'v3'): string {
        return this.getBaseLink(tenantName, 'sources', id, version);
    }

    // Returns a link to view a transform in the browser.
    public static getTransformLink(tenantName: string, id: string, version: string = 'v3'): string {
        return this.getBaseLink(tenantName, 'transforms', id, version);
    }

    // Returns a link to view a workflow in the browser.
    public static getWorkflowLink(tenantName: string, id: string, version: string = 'v3'): string {
        return this.getBaseLink(tenantName, 'workflows', id, version);
    }

    // Returns a link to view a workflow execution history.
    public static getWorkflowExecutionLink(tenantName: string, id: string, executionId: string, version: string = 'v3'): string {
        return `https://${tenantName}/${version}/workflow-executions/${id}/history/${executionId}`;
    }
}

// Appends query parameters to a URL string.
export function addQueryParams(url: string, params: Record<string, any>): string {
    const query = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
}