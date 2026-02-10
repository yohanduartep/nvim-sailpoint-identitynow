const path = require('node:path');

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function uint8Array2Str(arr: Uint8Array): string {
    let bufferAsString = new TextDecoder("utf-8").decode(arr);
    return bufferAsString;
}

export function str2Uint8Array(str: string): Uint8Array {
    const bufView = new TextEncoder().encode(str);
    return bufView;
}

export function toTimestamp(strDate: string): number {
    const datum = Date.parse(strDate);
    return datum / 1000;
}

export function toDateSuffix(): string {
    const date = new Date();
    let str = date.toISOString(); 
    str = str.replaceAll(':', '-').replace(/\..*$/, '');
    return str;
}

export function convertToText(data: any): string {
    if (data) {
        if (typeof data === 'object') {
            return JSON.stringify(data, null, 4);
        } else {
            return data
        }
    }
    return '';
}

export const compareByName = (a: any, b: any) => compareCaseInsensitive(a, b, "name");

export const compareByPriority = (a: any, b: any) => (a.priority > b.priority) ? 1 : -1;

export const compareByLabel = (a: any, b: any) => compareCaseInsensitive(a, b, "label");

export function compareCaseInsensitive(a: any, b: any, property: string) {
    const valA = (a[property] || '').toString();
    const valB = (b[property] || '').toString();
    return valA.localeCompare(valB, undefined, { sensitivity: 'base' })
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

const illegalRe = /[\/\\\?<>:\*\|":]/g;
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const DEFAULT_REPLACEMENT = ''
const DEFAULT_MAX_LENGTH = 255

export function sanitizeFilename(input: any, replacement = DEFAULT_REPLACEMENT, maxLength = DEFAULT_MAX_LENGTH) {
    if (typeof input !== 'string') {
        throw new Error('Input must be string')
    }
    const sanitized = input
        .replace(illegalRe, replacement)
        .replace(controlRe, replacement)
        .replace(reservedRe, replacement)
        .replace(windowsReservedRe, replacement)
        .replace(/\.+$/, '');

    if (maxLength > 0) {
        return truncate(sanitized, maxLength);
    }
    return sanitized
}

function truncate(sanitized: string, length: number): string {
    const uint8Array = new TextEncoder().encode(sanitized)
    const truncated = uint8Array.slice(0, length)
    return new TextDecoder().decode(truncated)
}

export function sanitizePath(input: string, options: undefined | { replacement?: string, maxLength?: number } = undefined) {
    const replacement: string = (options && options.replacement) || DEFAULT_REPLACEMENT;
    let maxLength: number = (options && options.maxLength) || DEFAULT_MAX_LENGTH;

    const parts = path.parse(input);
    maxLength = maxLength - (parts.ext ?? '').length
    parts.name = sanitizeFilename(parts.name, replacement, maxLength)
    if (replacement !== '') {
        parts.name = sanitizeFilename(parts.name, '', maxLength);
    }
    parts.base = undefined;
    const output = path.format(parts);
    return output
};

export function formatString(str: string, ...args: any[]) {
    return str.replace(/{(\d+)}/g, (match, number) => {
        return typeof args[number] !== 'undefined'
            ? args[number]
            : match
            ;
    });
};