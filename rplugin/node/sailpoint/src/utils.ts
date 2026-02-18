import * as path from 'node:path';

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function uint8Array2Str(arr: Uint8Array): string {
    return new TextDecoder('utf-8').decode(arr);
}

export function str2Uint8Array(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

export function toTimestamp(strDate: string): number {
    return Date.parse(strDate) / 1000;
}

export function toDateSuffix(): string {
    return new Date().toISOString().replaceAll(':', '-').replace(/\..*$/, '');
}

export function convertToText(data: any): string {
    if (!data) return '';
    if (typeof data === 'object') return JSON.stringify(data, null, 4);
    return String(data);
}

export const compareByName = (a: any, b: any) => compareCaseInsensitive(a, b, 'name');

export function compareCaseInsensitive(a: any, b: any, property: string) {
    const valA = (a[property] || '').toString();
    const valB = (b[property] || '').toString();
    return valA.localeCompare(valB, undefined, { sensitivity: 'base' });
}

export function normalizeTenant(tenantName: string) {
    tenantName = tenantName.toLowerCase();
    if (tenantName.indexOf(".") === -1) {
        tenantName += ".identitynow.com";
    }
    return tenantName;
}

export function parseJwt(token: string): any {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

export function isEmpty(strValue: string | null | undefined): boolean {
    return (!strValue || strValue.trim().length === 0);
}

const illegalRe = /[\/\\?<>:*|"]/g;
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const DEFAULT_REPLACEMENT = '';
const DEFAULT_MAX_LENGTH = 255;

function truncate(input: string, length: number): string {
    const bytes = new TextEncoder().encode(input);
    return new TextDecoder().decode(bytes.slice(0, length));
}

export function sanitizeFilename(input: any, replacement = DEFAULT_REPLACEMENT, maxLength = DEFAULT_MAX_LENGTH) {
    if (typeof input !== 'string') {
        throw new Error('Input must be string');
    }
    const sanitized = input
        .replace(illegalRe, replacement)
        .replace(controlRe, replacement)
        .replace(reservedRe, replacement)
        .replace(windowsReservedRe, replacement)
        .replace(/[. ]+$/g, replacement);
    if (maxLength > 0) {
        return truncate(sanitized, maxLength);
    }
    return sanitized;
}

export function sanitizePath(input: string, options: { replacement?: string, maxLength?: number } = {}) {
    const replacement = options.replacement ?? DEFAULT_REPLACEMENT;
    let maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
    const parts = path.parse(input);
    maxLength = maxLength - (parts.ext ?? '').length;
    parts.name = sanitizeFilename(parts.name, replacement, maxLength);
    if (replacement !== '') {
        parts.name = sanitizeFilename(parts.name, '', maxLength);
    }
    return path.format({
        root: parts.root,
        dir: parts.dir,
        name: parts.name,
        ext: parts.ext
    });
}

export function formatString(str: string, ...args: any[]) {
    return str.replace(/{(\d+)}/g, (match, number) => (typeof args[number] !== 'undefined' ? args[number] : match));
}
