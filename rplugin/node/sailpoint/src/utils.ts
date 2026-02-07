const path = require('node:path');

// Returns a promise that resolves after a specified number of milliseconds.
export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Converts a Uint8Array to a UTF-8 string.
export function uint8Array2Str(arr: Uint8Array): string {
    let bufferAsString = new TextDecoder("utf-8").decode(arr);
    return bufferAsString;
}

// Converts a string to a Uint8Array using UTF-8 encoding.
export function str2Uint8Array(str: string): Uint8Array {
    const bufView = new TextEncoder().encode(str);
    return bufView;
}

// Converts a date string to a Unix timestamp (seconds).
export function toTimestamp(strDate: string): number {
    const datum = Date.parse(strDate);
    return datum / 1000;
}

// Returns the current date as a filesystem-friendly string suffix.
export function toDateSuffix(): string {
    const date = new Date();
    let str = date.toISOString(); 
    str = str.replaceAll(':', '-').replace(/\..*$/, '');
    return str;
}

// Converts an object to a formatted JSON string or returns the value if it's already a string.
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

// Comparison helper for sorting objects by their 'name' property.
export const compareByName = (a: any, b: any) => compareCaseInsensitive(a, b, "name");

// Comparison helper for sorting objects by their 'priority' property.
export const compareByPriority = (a: any, b: any) => (a.priority > b.priority) ? 1 : -1;

// Comparison helper for sorting objects by their 'label' property.
export const compareByLabel = (a: any, b: any) => compareCaseInsensitive(a, b, "label");

// Case-insensitive comparison for two objects based on a specific property.
export function compareCaseInsensitive(a: any, b: any, property: string) {
    return a[property].localeCompare(b[property], undefined, { sensitivity: 'base' })
}

// Normalizes a tenant name by making it lowercase and appending the default domain if missing.
export function normalizeTenant(tenantName: string) {
    tenantName = tenantName.toLowerCase();
    if (tenantName.indexOf(".") === -1) {
        tenantName += ".identitynow.com";
    }
    return tenantName;
}

// Decodes and parses the payload segment of a JWT.
export function parseJwt(token: string): any {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

const illegalRe = /[\/\\\?<>:\*\|":]/g;
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const DEFAULT_REPLACEMENT = ''
const DEFAULT_MAX_LENGTH = 255

// Sanitizes a string for use as a filename by removing illegal characters.
export function sanitizeFilename(input: any, replacement = DEFAULT_REPLACEMENT, maxLength = DEFAULT_MAX_LENGTH) {
    if (typeof input !== 'string') {
        throw new Error('Input must be string')
    }
    const sanitized = input
        .replace(illegalRe, replacement)
        .replace(controlRe, replacement)
        .replace(reservedRe, replacement)
        .replace(windowsReservedRe, replacement);

    if (maxLength > 0) {
        return truncate(sanitized, maxLength);
    }
    return sanitized
}

// Internal helper to truncate a string to a specific byte length.
function truncate(sanitized: string, length: number): string {
    const uint8Array = new TextEncoder().encode(sanitized)
    const truncated = uint8Array.slice(0, length)
    return new TextDecoder().decode(truncated)
}

// Sanitizes a file path, ensuring the filename portion is safe and within length limits.
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

// Formats a string by replacing placeholders like {0}, {1} with provided arguments.
export function formatString(str: string, ...args: any[]) {
    return str.replace(/{(\d+)}/g, (match, number) => {
        return typeof args[number] !== 'undefined'
            ? args[number]
            : match
            ;
    });
};