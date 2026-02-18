import * as path from 'path';

export type Thenable<T> = Promise<T>;

export interface Disposable {
    dispose(): any;
}

export interface Memento {
    get<T>(key: string, defaultValue?: T): T;
    update(key: string, value: any): Thenable<void>;
    getWithTimestamp?<T>(key: string): { value: T, timestamp: number } | undefined;
    clearByPrefix?(prefix: string): Promise<number>;
}

export interface SecretStorage {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
    onDidChange: any;
}

export interface ExtensionContext {
    globalState: Memento;
    secrets: SecretStorage;
    subscriptions: { dispose(): any }[];
    extensionUri: Uri;
    asAbsolutePath(relativePath: string): string;
}

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
