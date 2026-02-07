import { Neovim } from 'neovim';
import { ISCClient } from '../services/ISCClient';
import * as fastJsonPatch from 'fast-json-patch';
import { handleError } from '../errors';

export class SaveCommand {
    constructor(private readonly nvim: Neovim) {}

    public async execute(getClient: () => { client: ISCClient, version: string }): Promise<void> {
        const buffer = await this.nvim.buffer;
        try {
            const type = await buffer.getVar('sailpoint_type') as string;
            if (!type || type === 'list' || type === 'debug') return;
            
            const id = await buffer.getVar('sailpoint_id') as string;
            const originalStr = await buffer.getVar('sailpoint_original') as string;
            const lines = await buffer.getLines({ start: 0, end: -1, strictIndexing: false });
            const newContent = JSON.parse(lines.join('\n'));
            
            const { client, version } = getClient();
            
            const saveWithFallbacks = async (path: string, patchOps: any, fullData: any) => {
                try { 
                    await client.patchResource(path, patchOps); 
                } catch (e: any) {
                    if (!e.message?.includes('404')) throw e;
                    await client.updateResource(path, JSON.stringify(fullData));
                }
            };

            if (type === 'transform') {
                if (!id) await client.createResource(`/${version}/transforms`, newContent);
                else await client.updateResource(`/${version}/transforms/${id}`, JSON.stringify(newContent));
            } else if (type === 'connector-rule') {
                if (!id) await client.createResource('/beta/connector-rules', newContent);
                else await client.updateConnectorRule(newContent);
            } else if (type === 'role') {
                if (!id) await client.createRole(newContent);
                else await saveWithFallbacks(`/${version}/roles/${id}`, fastJsonPatch.compare(JSON.parse(originalStr), newContent), newContent);
            } else if (type === 'access-profile') {
                if (!id) await client.createAccessProfile(newContent);
                else await saveWithFallbacks(`/${version}/access-profiles/${id}`, fastJsonPatch.compare(JSON.parse(originalStr), newContent), newContent);
            } else if (type === 'source') {
                if (id) await saveWithFallbacks(`/${version}/sources/${id}`, fastJsonPatch.compare(JSON.parse(originalStr), newContent), newContent);
            } else if (type === 'workflow') {
                await saveWithFallbacks(`/${version}/workflows/${id}`, fastJsonPatch.compare(JSON.parse(originalStr), newContent), newContent);
            }

            await buffer.setVar('sailpoint_original', JSON.stringify(newContent));
            await buffer.setOption('modified', false);
            this.nvim.outWrite(`${type} saved successfully.\n`);
        } catch (e: any) {
            handleError(this.nvim, e, 'saving');
        }
    }
}
