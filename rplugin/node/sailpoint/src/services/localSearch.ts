import { dedupeItems } from '../utils/dedupe';

export interface MatchResult {
    matched: boolean;
    field?: string;
}

interface ParsedQuery {
    searchField: string | null;
    searchValue: string;
}

const parseQuery = (query: string): ParsedQuery => {
    const lowerQuery = query.toLowerCase();
    const colonIndex = lowerQuery.indexOf(':');
    if (colonIndex === -1) {
        return { searchField: null, searchValue: lowerQuery };
    }
    return {
        searchField: lowerQuery.substring(0, colonIndex).trim(),
        searchValue: lowerQuery.substring(colonIndex + 1).trim()
    };
};

export function createMatcher(query: string): (item: unknown) => MatchResult {
    const { searchField, searchValue } = parseQuery(query);
    
    // Handle wildcard - match everything
    if (searchValue === '*') {
        return (item: unknown): MatchResult => {
            return { matched: true, field: undefined };
        };
    }

    return (item: unknown): MatchResult => {
        let matchedField: string | undefined;

        const visit = (value: unknown, path = ''): boolean => {
            if (typeof value === 'string' && value.toLowerCase().includes(searchValue)) {
                matchedField = path;
                return true;
            }
            if ((typeof value === 'number' || typeof value === 'boolean') && String(value).toLowerCase().includes(searchValue)) {
                matchedField = path;
                return true;
            }
            if (Array.isArray(value)) {
                return value.some((entry, i) => visit(entry, `${path}[${i}]`));
            }
            if (value && typeof value === 'object') {
                for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                    const currentPath = path ? `${path}.${k}` : k;
                    // If searching for a specific field, ONLY match that field (contains match)
                    if (searchField && k.toLowerCase() === searchField) {
                        const valueStr = String(v).toLowerCase();
                        // Contains match: the value must contain the search value
                        if (valueStr.includes(searchValue)) {
                            matchedField = currentPath;
                            return true;
                        }
                        // Don't continue searching other fields if we specified one
                        continue;
                    }
                    // If no specific field, match on key names too (contains)
                    if (!searchField && k.toLowerCase().includes(searchValue)) {
                        matchedField = currentPath;
                        return true;
                    }
                    if (visit(v, currentPath)) return true;
                }
            }
            return false;
        };

        return { matched: visit(item), field: matchedField };
    };
}

export function dedupeByIdOrKey<T extends Record<string, any>>(items: T[]): T[] {
    return dedupeItems(items);
}
