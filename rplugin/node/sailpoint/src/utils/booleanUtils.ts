// Converts various truthy values (strings like "yes", "1", "on") to a boolean.
export function truethy(input: string | undefined | boolean): boolean {
    if (input === undefined) {
        return false;
    }
    if (typeof input === "boolean") {
        return input;
    }
    input = input.trim().toLowerCase();
    switch (input) {
        case "true":
        case "1":
        case "on":
        case "yes":
            return true;
        default:
            return false;
    }
}
