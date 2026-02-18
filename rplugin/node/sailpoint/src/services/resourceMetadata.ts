export interface MetadataRequest {
    url: string;
    params: Record<string, any>;
}

import { getRegistryEntry } from '../resourceRegistry';
import { buildVersionedPath } from './pathTemplates';

export function resolveMetadataRequest(version: string, type: string, filter?: string): MetadataRequest {
    const params: Record<string, any> = { limit: 1, count: true };
    if (filter) {
        params.filters = filter;
    }

    const entry = getRegistryEntry(type);
    if (entry?.metadata?.sorters) {
        params.sorters = entry.metadata.sorters;
    }

    return {
        url: buildVersionedPath(version, entry?.metadata?.path || type),
        params
    };
}
