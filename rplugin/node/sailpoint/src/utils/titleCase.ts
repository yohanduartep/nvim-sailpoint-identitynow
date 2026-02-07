// Converts a string key to Title Case by capitalizing and adding spaces between words.
export function titleCase(key: string): string {
    return key
        .replace(/(^|[._-])([a-z])/g, (a, b, c) => c.toUpperCase())
        .replace(/([a-z])([A-Z])/g, (a, b, c) => `${b} ${c}`);
}
