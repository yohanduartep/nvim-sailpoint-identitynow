import { Neovim } from 'neovim';

/**
 * Utility for managing Neovim buffers and displaying SailPoint resources.
 */
export class BufferUtils {
    constructor(private readonly nvim: Neovim) {}

    /**
     * Opens a new tab with a JSON buffer containing the specified resource.
     */
    public async openBuffer(name: string, content: any, type: string, id: string, original?: any): Promise<void> {
        if (!content || (typeof content === 'object' && Object.keys(content).length === 0 && !Array.isArray(content))) {
            this.nvim.errWrite(`SailPoint: Warning - Received empty content for ${name || id}\n`);
        }
        
        await this.nvim.command('tabnew');
        const buffer = await this.nvim.buffer;
        await buffer.setOption('buftype', 'acwrite');
        await buffer.setOption('filetype', 'json');
        
        const fileName = (name || id || 'unnamed').replace(/[^a-zA-Z0-9]/g, '_');
        const targetName = `SailPoint:/${type}/${fileName}.json`;
        
        const existingBufnr = await this.nvim.call('bufnr', [targetName]);
        if (existingBufnr !== -1) {
            await this.nvim.command(`bwipeout! ${existingBufnr}`);
        }
        
        await this.nvim.command(`file ${targetName}`);
        
        const jsonStr = JSON.stringify(content, null, 2);
        await buffer.setLines(jsonStr.split('\n'), { start: 0, end: -1, strictIndexing: false });
        
        await buffer.setVar('sailpoint_type', type);
        await buffer.setVar('sailpoint_id', id);
        if (original) await buffer.setVar('sailpoint_original', JSON.stringify(original));
        
        await this.nvim.command(`autocmd BufWriteCmd <buffer> SailPointSave`);
        await buffer.setOption('modified', false);
    }
}
