import { Neovim } from 'neovim';
import { logError, logInfo, logWarn } from '../services/logger';

let nvim: Neovim;

export function setNvim(instance: Neovim) {
    nvim = instance;
}

export namespace window {
    export function showErrorMessage(message: string) {
        if (nvim) {
            nvim.outWrite(`Error: ${message}\n`);
        } else {
            logError(message);
        }
        return Promise.resolve();
    }

    export function showWarningMessage(message: string, ...items: string[]) {
        if (nvim) {
            nvim.outWrite(`Warning: ${message}\n`);
        } else {
            logWarn(message);
        }
        return Promise.resolve(items[0]);
    }

    export function showInformationMessage(message: string) {
        if (nvim) {
            nvim.outWrite(`Info: ${message}\n`);
        } else {
            logInfo(message);
        }
        return Promise.resolve();
    }

    export function createTreeView(viewId: string, options: any) {
        return {
            dispose: () => {}
        };
    }

    export function registerUriHandler() {
        return { dispose: () => {} };
    }

    export function withProgress(options: any, task: (progress: any, token: any) => Promise<any>) {
        return task({ report: () => {} }, { isCancellationRequested: false });
    }

    export async function showInputBox(options: InputBoxOptions): Promise<string | undefined> {
        if (!nvim) return undefined;
        const prompt = options.prompt || options.title || 'Enter value';
        let defaultValue = options.value || '';
        
        while (true) {
            try {
                const result = await nvim.call(options.password ? 'inputsecret' : 'input', [`${prompt}: `, defaultValue]);
                if (result === undefined || result === '') return undefined;
                
                if (options.validateInput) {
                    const validationMessage = await options.validateInput(result);
                    if (validationMessage) {
                        await nvim.outWrite(`Validation Error: ${validationMessage}\n`);
                        defaultValue = result;
                        continue;
                    }
                }
                return result;
            } catch (e: any) {
                await nvim.outWrite(`Error: ${e.message}\n`);
                return undefined;
            }
        }
    }

    export async function showQuickPick(items: string[], options?: QuickPickOptions): Promise<string | undefined> {
        if (!nvim) return undefined;
        const prompt = options?.placeHolder || options?.title || 'Select an option';
        try {
            const result = await nvim.callFunction('inputlist', [[prompt, ...items.map((item, i) => `${i + 1}. ${item}`)]]);
            if (result === 0 || result > items.length) return undefined;
            return items[result - 1];
        } catch (e: any) {
            await nvim.outWrite(`Error: ${e.message}\n`);
            return undefined;
        }
    }
}

export interface InputBoxOptions {
    title?: string;
    prompt?: string;
    placeHolder?: string;
    value?: string;
    password?: boolean;
    ignoreFocusOut?: boolean;
    validateInput?: (value: string) => string | undefined | null | Promise<string | undefined | null>;
}

export interface QuickPickOptions {
    title?: string;
    placeHolder?: string;
    ignoreFocusOut?: boolean;
    canPickMany?: boolean;
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
}

export class CommandRegistry {
    private commands: Map<string, (...args: any[]) => any> = new Map();

    registerCommand(command: string, callback: (...args: any[]) => any) {
        this.commands.set(command, callback);
        return { dispose: () => this.commands.delete(command) };
    }

    async executeCommand(command: string, ...args: any[]): Promise<any> {
        const cmd = this.commands.get(command);
        if (cmd) return cmd(...args);
        throw new Error(`Command not found: ${command}`);
    }
}

const commandRegistry = new CommandRegistry();

export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any) {
        return commandRegistry.registerCommand(command, callback);
    }
    export function executeCommand(command: string, ...args: any[]): Promise<any> {
        return commandRegistry.executeCommand(command, ...args);
    }
}

export namespace workspace {
    export function getConfiguration(section?: string) {
        return {
            get: (key: string, defaultValue?: any) => defaultValue
        };
    }
}

export namespace env {
    export const uriScheme = 'vscode';
}

export const version = "1.74.0";
export const extensions = {
    getExtension: () => ({ packageJSON: { version: "0.0.2" } })
};
