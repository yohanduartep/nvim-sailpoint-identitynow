// Checks if a string is null, undefined, or empty.
export function isEmpty(strValue: string | null | undefined): boolean {
    return (!strValue || strValue.trim() === "" || (strValue.trim()).length === 0);
}

// Checks if a value is a non-empty string.
export function isNotEmpty(val: any) {
    return typeof val === 'string' && !!val;
}

// Checks if a string contains at least one non-whitespace character.
export function isNotBlank(val: any) {
    return typeof val === 'string' && ((val?.trim()?.length || 0) > 0);
}

// Checks if a value is not a string or consists only of whitespace.
export function isBlank(val: any) {
    return typeof val !== 'string' || ((val?.trim()?.length || 0) === 0);
}

// Converts PascalCase or camelCase strings to space-separated words.
export function convertPascalCase2SpaceBased(input: string) {
    return input
        .replace(/([A-Z]+)([A-Z][a-z])/g, ' $1 $2')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/^./, function (str) { return str.toUpperCase(); })
        .trim();
}

// Converts SNAKE_CASE constants to Title Case.
export function convertConstantToTitleCase(constantString: string): string {
    return constantString
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Capitalizes the first letter of a string and lowers the rest.
export function capitalizeFirstLetter(input: string) {
    return input.charAt(0).toUpperCase()
        + input.slice(1).toLowerCase()
}

// Converts space, dash, or underscore separated strings to camelCase.
export function toCamelCase(input: string): string {
    const words = input.split(/[\s-_]+/);

    return words.map((word, index) => {
        word = word.toLowerCase();

        if (index !== 0) {
            word = word.charAt(0).toUpperCase() + word.slice(1);
        }

        return word;
    }).join('');
}

// Removes accents and diacritical marks from a string.
export function decomposeDiacriticalMarks(input: string): string {
    return input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, "");
}

// Escapes backslashes and double quotes for use in API filters.
export function escapeFilter(input: string | undefined) {
    return input?.replaceAll("\\", "\\\\")
        .replaceAll("\"", "\\\"")
}
