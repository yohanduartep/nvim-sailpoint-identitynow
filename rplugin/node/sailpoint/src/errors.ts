import { Neovim } from 'neovim';

export function handleError(nvim: Neovim, e: any, context: string) {
    let msg = e.message || String(e);
    if (e.response && e.response.data) {
        msg += `: ${JSON.stringify(e.response.data)}`;
    }
    nvim.errWrite(`SailPoint Error (${context}): ${msg}\n`);
}

export class UserCancelledError extends Error {
    _isUserCancelledError = true;
    constructor(stepName?: string) {
        super('Operation cancelled.');
    }
}

export function isUserCancelledError(error: unknown): error is UserCancelledError {
    return !!error &&
        typeof error === 'object' &&
        '_isUserCancelledError' in error &&
        error._isUserCancelledError === true;
}

export class GoBackError extends Error {
    constructor() {
        super('Go back.');
    }
}

export class ParseException extends Error {

    constructor(message?: string) {
        const msg = message ? 'Invalid expression: ' + message : 'Invalid expression';
        super(msg);
    }
}
