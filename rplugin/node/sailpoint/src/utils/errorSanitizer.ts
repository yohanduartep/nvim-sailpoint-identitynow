export function sanitizeErrorMessage(error: unknown): string {
    let message: string;

    // Extract base message
    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    } else {
        message = 'Unknown error occurred';
    }

    // Remove common secret patterns
    message = message.replace(/client_secret=[^&\s"']+/gi, 'client_secret=***');
    message = message.replace(/clientSecret["']?\s*:\s*["'][^"']+["']/gi, 'clientSecret: "***"');
    message = message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
    message = message.replace(/access_token["']?\s*:\s*["'][^"']+["']/gi, 'access_token: "***"');
    message = message.replace(/password["']?\s*:\s*["'][^"']+["']/gi, 'password: "***"');
    message = message.replace(/token["']?\s*:\s*["'][^"']+["']/gi, 'token: "***"');

    // Remove long strings that look like secrets (40+ chars of base64/hex)
    message = message.replace(/[A-Za-z0-9+/=_-]{40,}/g, '***');

    return message;
}
