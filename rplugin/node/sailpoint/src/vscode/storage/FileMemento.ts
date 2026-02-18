import * as fs from 'fs';
import * as path from 'path';
import { Memento, Thenable } from '../types';
import { CONFIG_ROOT } from '../config';
import { logError } from '../../services/logger';

export class FileMemento implements Memento {
    private filePath: string;
    private data: any = {};

    constructor(fileName: string) {
        if (!fs.existsSync(CONFIG_ROOT)) {
            fs.mkdirSync(CONFIG_ROOT, { recursive: true });
        }
        this.filePath = path.join(CONFIG_ROOT, fileName);
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
            await fs.promises.writeFile(this.filePath, JSON.stringify(this.data));
        } catch (e) {
            logError(`Error saving memento to ${this.filePath}:`, e);
        }
    }

    get<T>(key: string, defaultValue?: T): T {
        const entry = this.data[key];
        if (entry && typeof entry === 'object' && 'value' in entry && 'timestamp' in entry) {
            return entry.value;
        }
        return (entry ?? defaultValue) as T;
    }

    getWithTimestamp<T>(key: string): { value: T, timestamp: number } | undefined {
        return this.data[key];
    }

    update(key: string, value: any): Thenable<void> {
        this.data[key] = {
            value: value,
            timestamp: Date.now()
        };
        return this.save();
    }

    public async clearByPrefix(prefix: string): Promise<number> {
        let removed = 0;
        for (const key of Object.keys(this.data)) {
            if (key.startsWith(prefix)) {
                delete this.data[key];
                removed++;
            }
        }
        if (removed > 0) {
            await this.save();
        }
        return removed;
    }
    
    updateRaw(key: string, value: any): Thenable<void> {
        this.data[key] = value;
        return this.save();
    }
}
