import { Neovim } from 'neovim';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let nvim: Neovim;

export function setNvim(instance: Neovim) {
    nvim = instance;
}

export type Thenable<T> = Promise<T>;

export interface Disposable {
    dispose(): any;
}

export interface CancellationToken {
    isCancellationRequested: boolean;
    onCancellationRequested: any;
}

export interface QuickInputButton {
    iconPath: Uri | { light: Uri; dark: Uri };
    tooltip?: string;
}

export interface QuickInputButtons {
    readonly Back: QuickInputButton;
}

export interface QuickPickItem {
    label: string;
    description?: string;
    detail?: string;
    picked?: boolean;
    alwaysShow?: boolean;
}

export interface InputBox extends Disposable {
    value: string;
    placeholder: string;
    password: boolean;
    title: string;
    prompt: string;
    step: number;
    totalSteps: number;
    ignoreFocusOut: boolean;
    enabled: boolean;
    busy: boolean;
    validationMessage: string;
    buttons: QuickInputButton[];
    onDidAccept: any;
    onDidHide: any;
    onDidChangeValue: any;
    onDidTriggerButton: any;
    show(): void;
    hide(): void;
}

export interface QuickPick<T extends QuickPickItem> extends Disposable {
    value: string;
    placeholder: string;
    items: readonly T[];
    activeItems: readonly T[];
    selectedItems: readonly T[];
    title: string;
    step: number;
    totalSteps: number;
    ignoreFocusOut: boolean;
    canSelectMany: boolean;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    busy: boolean;
    enabled: boolean;
    buttons: QuickInputButton[];
    onDidAccept: any;
    onDidHide: any;
    onDidChangeSelection: any;
    onDidTriggerButton: any;
    show(): void;
    hide(): void;
}

export interface QuickPickOptions {
    title?: string;
    placeHolder?: string;
    ignoreFocusOut?: boolean;
    canPickMany?: boolean;
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
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

export namespace window {
    export function showErrorMessage(message: string) {
        if (nvim) {
            nvim.errWrite(`Error: ${message}\n`);
        } else {
            console.error(message);
        }
        return Promise.resolve();
    }
    export function showWarningMessage(message: string, ...items: string[]) {
        if (nvim) {
            nvim.outWrite(`Warning: ${message}\n`);
        } else {
            console.warn(message);
        }
        return Promise.resolve(items[0]); 
    }
    export function showInformationMessage(message: string) {
        if (nvim) {
            nvim.outWrite(`Info: ${message}\n`);
        } else {
            console.log(message);
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
                        await nvim.errWrite(`Validation Error: ${validationMessage}\n`);
                        defaultValue = result; // Keep current input for retry
                        continue;
                    }
                }
                return result;
            } catch (e) {
                return undefined;
            }
        }
    }
    export async function showQuickPick<T extends QuickPickItem>(items: T[], options?: QuickPickOptions): Promise<T | undefined> {
        if (!nvim) return undefined;
        const prompt = options?.placeHolder || 'Select an option:';
        const displayItems = [prompt, ...items.map((item, i) => `${i + 1}. ${item.label}`)];
        try {
            const choice = await nvim.call('inputlist', [displayItems]);
            if (choice >= 1 && choice <= items.length) {
                return items[choice - 1];
            }
            return undefined;
        } catch (e) {
            return undefined;
        }
    }
    export function createInputBox(): InputBox {
        throw new Error("createInputBox is not implemented in this environment.");
    }
    export function createQuickPick<T extends QuickPickItem>(): QuickPick<T> {
        throw new Error("createQuickPick is not implemented in this environment.");
    }
}

export class CommandRegistry {
    private static commands = new Map<string, Function>();

    static register(command: string, callback: Function, thisArg?: any) {
        this.commands.set(command, thisArg ? callback.bind(thisArg) : callback);
    }

    static async execute(command: string, args: any[]) {
        const fn = this.commands.get(command);
        if (fn) {
            return await fn(...args);
        }
        console.error(`Command ${command} not found`);
    }
    
    static getCommands() {
        return Array.from(this.commands.keys());
    }
}

export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any) {
        CommandRegistry.register(command, callback, thisArg);
        return {
            dispose: () => {}
        };
    }
    export function executeCommand(command: string, ...args: any[]) {
        return CommandRegistry.execute(command, args);
    }
}

export namespace workspace {
    export function getConfiguration(section: string) {
        return {
            get: (key: string, defaultValue?: any) => defaultValue,
            update: () => Promise.resolve(),
            inspect: () => undefined
        };
    }
    export const onDidSaveTextDocument = (listener: any) => { return { dispose: () => {} } };
    export const registerFileSystemProvider = () => { return { dispose: () => {} } };
}

export namespace env {
    export const openExternal = (uri: Uri) => Promise.resolve(true);
}

export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Thenable<void>;
}

export interface SecretStorage {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
    onDidChange: any;
}

class FileMemento implements Memento {
    private filePath: string;
    private data: any = {};

    constructor(fileName: string) {
        const configDir = path.join(os.homedir(), '.config', 'nvim-sailpoint');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        this.filePath = path.join(configDir, fileName);
        this.load();
    }

    private load() {
        if (fs.existsSync(this.filePath)) {
            try {
                this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
            } catch (e) {
                this.data = {};
            }
        }
    }

    private async save(): Promise<void> {
        try {
            await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error(`Error saving memento to ${this.filePath}:`, e);
        }
    }

    get<T>(key: string, defaultValue?: T): T {
        return this.data[key] ?? defaultValue;
    }

    update(key: string, value: any): Thenable<void> {
        this.data[key] = value;
        return this.save();
    }
}

class KeytarSecretStorage implements SecretStorage {
    private readonly service = 'nvim-sailpoint';
    private readonly legacyFilePath: string;

    constructor() {
        const configDir = path.join(os.homedir(), '.config', 'nvim-sailpoint');
        this.legacyFilePath = path.join(configDir, 'secrets.json');
        this.migrateLegacySecrets();
    }

    private async migrateLegacySecrets() {
        if (fs.existsSync(this.legacyFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.legacyFilePath, 'utf-8'));
                const keytar = require('keytar');
                for (const key of Object.keys(data)) {
                    await keytar.setPassword(this.service, key, data[key]);
                }
                fs.unlinkSync(this.legacyFilePath);
                console.log('Successfully migrated secrets to system keychain.');
            } catch (e) {
                console.error('Error migrating legacy secrets:', e);
            }
        }
    }

    async get(key: string): Promise<string | undefined> {
        try {
            const keytar = require('keytar');
            const secret = await keytar.getPassword(this.service, key);
            return secret || undefined;
        } catch (e) {
            return undefined;
        }
    }

    async store(key: string, value: string): Promise<void> {
        try {
            const keytar = require('keytar');
            await keytar.setPassword(this.service, key, value);
        } catch (e) {
            console.error('Error storing secret:', e);
        }
    }
    
    async delete(key: string): Promise<void> {
        try {
            const keytar = require('keytar');
            await keytar.deletePassword(this.service, key);
        } catch (e) {
            console.error('Error deleting secret:', e);
        }
    }
    
    onDidChange: any = { dispose: () => {} };
}

export const globalStorage = new FileMemento('globalState.json');
export const secretStorage = new KeytarSecretStorage();

export class Uri {
    static parse(value: string): Uri { return new Uri(value); }
    static file(path: string): Uri { return new Uri(path); }
    static joinPath(base: Uri, ...paths: string[]): Uri { return new Uri(path.join(base.path, ...paths)); }
    static from(components: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
        return new Uri(components.path || '');
    }
    constructor(public path: string) {}
    
    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
        return new Uri(change.path || this.path);
    }
    get fsPath(): string { return this.path; }
}

export interface ExtensionContext {
    globalState: Memento;
    secrets: SecretStorage;
    subscriptions: { dispose(): any }[];
    extensionUri: Uri;
    asAbsolutePath(relativePath: string): string;
}

export const version = "1.74.0";
export const extensions = {
    getExtension: () => ({ packageJSON: { version: "0.0.2" } })
};
