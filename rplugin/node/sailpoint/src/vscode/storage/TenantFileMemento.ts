import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { CACHE_ROOT } from '../config';
import { logWarn } from '../../services/logger';

// Promisified compression functions for non-blocking operations
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export class TenantFileMemento {
    private configDir: string;

    constructor() {
        this.configDir = CACHE_ROOT;
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }

    private getFilePath(tenantId: string, resourceType: string, subId?: string): string {
        const suffix = subId ? `_${subId}` : '';
        return path.join(this.configDir, `${tenantId}_${resourceType}${suffix}.json.gz`);
    }

    private getLegacyFilePath(tenantId: string, resourceType: string, subId?: string): string {
        const suffix = subId ? `_${subId}` : '';
        return path.join(this.configDir, `${tenantId}_${resourceType}${suffix}.json`);
    }

    private async writeCompressed(filePath: string, data: any): Promise<void> {
        const payload = Buffer.from(JSON.stringify(data), 'utf-8');
        
        // Use async compression with maximum compression level for better ratio
        // Level 9 provides ~20% better compression than default level 6
        const gzipped = await gzipAsync(payload, { level: 9 });
        
        await fs.promises.writeFile(filePath, gzipped);
    }

    private async readTimestamp(filePath: string): Promise<number | undefined> {
        try {
            if (filePath.endsWith('.json.gz')) {
                const compressed = await fs.promises.readFile(filePath);
                // Use async decompression to avoid blocking event loop
                const buffer = await gunzipAsync(compressed);
                const json = buffer.toString('utf-8');
                const data = JSON.parse(json);
                return typeof data?.timestamp === 'number' ? data.timestamp : undefined;
            }
            if (filePath.endsWith('.json')) {
                const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
                return typeof data?.timestamp === 'number' ? data.timestamp : undefined;
            }
        } catch (e: any) {
            logWarn(`SailPoint: failed to read cache timestamp from ${filePath}: ${e?.message || String(e)}`);
        }
        return undefined;
    }

    public async get<T>(tenantId: string, resourceType: string, subId?: string): Promise<{ value: T, timestamp: number } | undefined> {
        const gzPath = this.getFilePath(tenantId, resourceType, subId);
        if (fs.existsSync(gzPath)) {
            try {
                const compressed = await fs.promises.readFile(gzPath);
                // Use async decompression to avoid blocking event loop
                const buffer = await gunzipAsync(compressed);
                const json = buffer.toString('utf-8');
                const data = JSON.parse(json);
                return data;
            } catch (e) {
            }
        }

        const legacyPath = this.getLegacyFilePath(tenantId, resourceType, subId);
        if (fs.existsSync(legacyPath)) {
            try {
                const data = JSON.parse(await fs.promises.readFile(legacyPath, 'utf-8'));
                // Migrate to compressed format with async compression
                await this.writeCompressed(gzPath, data);
                await fs.promises.unlink(legacyPath);
                return data;
            } catch (e) {
                return undefined;
            }
        }

        return undefined;
    }

    public async update(tenantId: string, resourceType: string, value: any, subId?: string): Promise<void> {
        const filePath = this.getFilePath(tenantId, resourceType, subId);
        const data = {
            value: value,
            timestamp: Date.now()
        };
        await this.writeCompressed(filePath, data);
    }

    public async clear(tenantId: string, resourceType: string, subId?: string): Promise<void> {
        const gzPath = this.getFilePath(tenantId, resourceType, subId);
        const legacyPath = this.getLegacyFilePath(tenantId, resourceType, subId);
        if (fs.existsSync(gzPath)) {
            await fs.promises.unlink(gzPath);
        }
        if (fs.existsSync(legacyPath)) {
            await fs.promises.unlink(legacyPath);
        }
    }

    public async clearTenant(tenantId: string): Promise<number> {
        let removed = 0;
        const prefix = `${tenantId}_`;
        let files: string[] = [];
        try {
            files = await fs.promises.readdir(this.configDir);
        } catch (e) {
            return 0;
        }

        for (const file of files) {
            if (!file.startsWith(prefix) || (!file.endsWith('.json') && !file.endsWith('.json.gz'))) continue;
            const filePath = path.join(this.configDir, file);
            try {
                await fs.promises.unlink(filePath);
                removed++;
            } catch (e: any) {
                logWarn(`SailPoint: failed to remove cache file ${filePath}: ${e?.message || String(e)}`);
            }
        }
        return removed;
    }

    public async pruneOlderThan(maxAgeMs: number): Promise<number> {
        if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0;
        const cutoff = Date.now() - maxAgeMs;
        let files: string[] = [];
        let removed = 0;
        try {
            files = await fs.promises.readdir(this.configDir);
        } catch (e) {
            return 0;
        }

        for (const file of files) {
            if (!file.endsWith('.json') && !file.endsWith('.json.gz')) continue;
            const filePath = path.join(this.configDir, file);
            try {
                const ts = await this.readTimestamp(filePath);
                if (typeof ts === 'number' && ts < cutoff) {
                    await fs.promises.unlink(filePath);
                    removed++;
                }
            } catch (e: any) {
                logWarn(`SailPoint: failed to prune cache file ${filePath}: ${e?.message || String(e)}`);
            }
        }
        return removed;
    }
}
