const dedupeKey = (item: any): string => {
    if (!item) return 'null';
    if (item.id) return `id:${item.id}`;
    if (item.key) return `key:${item.key}`;
    if (item.attribute) return `attribute:${item.attribute}`;
    if (item.displayName) return `displayName:${item.displayName}`;
    if (item.name) return `name:${item.name}`;
    return `json:${JSON.stringify(item)}`;
};

export const dedupeItems = <T = any>(items: T[]): T[] => {
    const seen = new Set<string>();
    const unique: T[] = [];
    for (const item of items || []) {
        const key = dedupeKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    return unique;
};
