import * as path from 'path';
import * as os from 'os';

export const CONFIG_ROOT = path.join(os.homedir(), '.config', 'nvim-sailpoint');
export const CACHE_ROOT = path.join(CONFIG_ROOT, 'cache');
