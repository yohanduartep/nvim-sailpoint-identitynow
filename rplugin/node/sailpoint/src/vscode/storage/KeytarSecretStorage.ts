import * as fs from 'fs';
import * as path from 'path';
import { SecretStorage, Thenable } from '../types';
import { CONFIG_ROOT } from '../config';
import { logError, logInfo } from '../../services/logger';

export class KeytarSecretStorage implements SecretStorage {
    private readonly service = 'nvim-sailpoint';
    private readonly legacyFilePath: string;

    constructor() {
        this.legacyFilePath = path.join(CONFIG_ROOT, 'secrets.json');
        this.migrateLegacySecrets();
    }

    private async migrateLegacySecrets() {
        if (fs.existsSync(this.legacyFilePath)) {
            try {
                // Check file permissions for security (should be 0600 = owner read/write only)
                const stats = fs.statSync(this.legacyFilePath);
                const permissions = stats.mode & 0o777;
                
                // Warn if file has insecure permissions (readable by group or others)
                if (permissions !== 0o600) {
                    logError(
                        `WARNING: ${this.legacyFilePath} has insecure permissions (${permissions.toString(8)}). ` +
                        `File should be readable/writable by owner only (0600). ` +
                        `Aborting migration to prevent potential security breach. ` +
                        `Please fix permissions with: chmod 600 ${this.legacyFilePath}`
                    );
                    return;
                }
                
                const data = JSON.parse(fs.readFileSync(this.legacyFilePath, 'utf-8'));
                const keytar = require('keytar');
                for (const key of Object.keys(data)) {
                    await keytar.setPassword(this.service, key, data[key]);
                }
                fs.unlinkSync(this.legacyFilePath);
                logInfo('Successfully migrated secrets to system keychain.');
            } catch (e) {
                logError('Error migrating legacy secrets:', e);
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
            logError('Error storing secret:', e);
        }
    }
    
    async delete(key: string): Promise<void> {
        try {
            const keytar = require('keytar');
            await keytar.deletePassword(this.service, key);
        } catch (e) {
            logError('Error deleting secret:', e);
        }
    }
    
    onDidChange: any = { dispose: () => {} };
}
