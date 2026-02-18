export * from './types';
export * from './config';
export { window, setNvim, commands, workspace, env, version, extensions } from './window';
export { FileMemento } from './storage/FileMemento';
export { TenantFileMemento } from './storage/TenantFileMemento';
export { KeytarSecretStorage } from './storage/KeytarSecretStorage';

import { FileMemento } from './storage/FileMemento';
import { TenantFileMemento } from './storage/TenantFileMemento';
import { KeytarSecretStorage } from './storage/KeytarSecretStorage';

export const globalStorage = new FileMemento('globalState.json');
export const tenantCache = new TenantFileMemento();
export const secretStorage = new KeytarSecretStorage();
