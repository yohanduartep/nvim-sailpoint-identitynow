import { Neovim } from 'neovim';

export class BufferUtils {
    constructor(private readonly nvim: Neovim) {}

    public async openBuffer(
        name: string,
        content: any,
        type: string,
        id: string,
        original?: any,
        matchedField?: string,
        targetWinId?: number
    ): Promise<void> {
        const isEmpty = !content || 
                        (Array.isArray(content) && content.length === 0) ||
                        (typeof content === 'object' && Object.keys(content).length === 0);

        if (isEmpty) {
            this.nvim.outWrite(`SailPoint: Error - Received empty content for ${name || id}. Not opening.\n`);
            return;
        }

        const hasExplicitTarget = typeof targetWinId === 'number' && targetWinId > 0;
        if (typeof targetWinId === 'number' && targetWinId > 0) {
            try {
                await this.nvim.call('win_gotoid', [targetWinId]);
            } catch (e: any) {
                this.nvim.outWrite(`SailPoint: Warning - failed to switch target window: ${e?.message || String(e)}\n`);
            }
        }

        const safeId = String(id || 'new').replace(/[^a-zA-Z0-9]/g, '_');
        const targetName = `SailPoint:/${type}/${safeId}.json`;
        const existingBufnr = await this.nvim.call('bufnr', [targetName]);

        if (existingBufnr !== -1) {
            if (hasExplicitTarget) {
                await this.nvim.command(`buffer ${existingBufnr}`);
            } else {
                const winid = await this.nvim.call('bufwinid', [existingBufnr]);
                if (winid !== -1) {
                    await this.nvim.call('win_gotoid', [winid]);
                } else {
                    await this.nvim.command(`buffer ${existingBufnr}`);
                }
            }
        } else {
            await this.nvim.command('enew');
            const buffer = await this.nvim.buffer;
            await buffer.setOption('buftype', 'acwrite');
            await buffer.setOption('filetype', 'json');
            await this.nvim.command(`file ${targetName}`);
        }

        const buffer = await this.nvim.buffer;
        const jsonStr = JSON.stringify(content, null, 2);
        const lines = jsonStr.split('\n');
        await buffer.setLines(lines, { start: 0, end: -1, strictIndexing: false });
        
        await buffer.setVar('sailpoint_type', type);
        await buffer.setVar('sailpoint_id', id);
        if (original) await buffer.setVar('sailpoint_original', JSON.stringify(original));
        
        await this.nvim.command(`autocmd BufWriteCmd <buffer> SailPointSave`);
        await buffer.setOption('modified', false);

        if (matchedField) {
            let lineIndex = -1;
            let searchPattern = '';
            const searchTerm = matchedField.toLowerCase();
            
            // Strategy 1: If it looks like a field name (no spaces, alphanumeric), search for field pattern
            if (/^[a-zA-Z0-9_]+$/.test(matchedField)) {
                const fieldPattern = `"${matchedField}":`;
                lineIndex = lines.findIndex(l => l.toLowerCase().includes(fieldPattern.toLowerCase()));
                if (lineIndex !== -1) {
                    searchPattern = `"${matchedField}"`;
                }
            }
            
            // Strategy 2: Search for the value as a quoted string
            if (lineIndex === -1) {
                lineIndex = lines.findIndex(l => {
                    const lower = l.toLowerCase();
                    return lower.includes(`"${searchTerm}"`) || lower.includes(`": "${searchTerm}"`);
                });
                if (lineIndex !== -1) {
                    searchPattern = searchTerm;
                }
            }
            
            // Strategy 3: Case-insensitive search anywhere in line
            if (lineIndex === -1) {
                lineIndex = lines.findIndex(l => l.toLowerCase().includes(searchTerm));
                if (lineIndex !== -1) {
                    searchPattern = searchTerm;
                }
            }
            
            if (lineIndex !== -1) {
                // Set Vim's search register so user can press 'n' to find next occurrence
                if (searchPattern) {
                    await this.nvim.command(`let @/ = "\\\\c${searchPattern.replace(/"/g, '\\"')}"`);
                    await this.nvim.command('set hlsearch');
                }
                await this.nvim.call('cursor', [lineIndex + 1, 1]);
                await this.nvim.command('normal! zz');
            }
        }
    }
}
