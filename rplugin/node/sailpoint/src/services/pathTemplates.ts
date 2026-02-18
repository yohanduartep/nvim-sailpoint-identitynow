export function ensureLeadingSlash(value: string): string {
    return value.startsWith('/') ? value : `/${value}`;
}

export function applyTemplate(
    template: string,
    values: Record<string, string | undefined>
): string {
    let resolved = template;
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
            resolved = resolved.replaceAll(`{${key}}`, value);
        }
    }
    return resolved;
}

export function buildVersionedPath(version: string, pathTemplate: string): string {
    return ensureLeadingSlash(applyTemplate(pathTemplate, { version }));
}

export function resolveResourcePath(template: string, version: string, id?: string): string {
    return ensureLeadingSlash(applyTemplate(template, { version, id }));
}
