import { Neovim } from 'neovim';
import { ISCClient } from '../services/ISCClient';
import { BufferUtils } from '../utils/BufferUtils';
import { handleError } from '../errors';

export class ResourceCommands {
    constructor(
        private readonly nvim: Neovim,
        private readonly bufferUtils: BufferUtils
    ) {}

    public async aggregate(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try {
            const { client } = getClient();
            if (args[0] === 'entitlements') await client.startEntitlementAggregation(args[1]);
            else await client.startAccountAggregation(args[1]);
            this.nvim.outWrite(`Aggregation triggered.
`);
        } catch (e) { handleError(this.nvim, e, 'aggregating'); }
    }

    public async deleteResource(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            await client.deleteResource(args[0]); 
            this.nvim.outWrite(`Deleted: ${args[0]}
`); 
        } 
        catch (e: any) { handleError(this.nvim, e, `deleting ${args[0]}`); }
    }

    public async getSource(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            const s = await client.getSourceById(args[0]); 
            await this.bufferUtils.openBuffer(s.name || s.id || 'unnamed', s, 'source', args[0], s); 
        } 
        catch (e) { handleError(this.nvim, e, 'getting source'); }
    }

    public async getTransform(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            const t = await client.getTransformByName(args[0]); 
            // Transform usually uses 'name' as ID, id might be undefined in type def but present in API.
            // Using name or casting to any to access id if needed, but SDK says no ID.
            await this.bufferUtils.openBuffer(t.name || 'unnamed', t, 'transform', (t as any).id || args[0], t); 
        }
        catch (e) { handleError(this.nvim, e, 'getting transform'); }
    }

    public async getRole(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            const r = (await client.getRoles({ filters: `id eq "${args[0]}"` })).data[0]; 
            await this.bufferUtils.openBuffer(r.name || r.id || 'unnamed', r, 'role', args[0], r); 
        }
        catch (e) { handleError(this.nvim, e, 'getting role'); }
    }

    public async getAccessProfile(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            const p = await client.getAccessProfileById(args[0]); 
            await this.bufferUtils.openBuffer(p.name || p.id || 'unnamed', p, 'access-profile', args[0], p); 
        }
        catch (e) { handleError(this.nvim, e, 'getting access profile'); }
    }

    public async getConnectorRule(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            const r = await client.getConnectorRuleById(args[0]); 
            await this.bufferUtils.openBuffer(r.name || r.id || 'unnamed', r, 'connector-rule', args[0], r); 
        }
        catch (e) { handleError(this.nvim, e, 'getting connector rule'); }
    }

    public async getWorkflow(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            const w = await client.getWorflow(args[0]); 
            await this.bufferUtils.openBuffer(w.name || w.id || 'unnamed', w, 'workflow', args[0], w); 
        }
        catch (e) { handleError(this.nvim, e, 'getting workflow'); }
    }

    public async getRaw(args: any[], getClient: () => { client: ISCClient }): Promise<void> {
        try { 
            const { client } = getClient(); 
            await this.bufferUtils.openBuffer('raw', await client.getResource(args[0]), 'raw', args[0], null); 
        }
        catch (e) { handleError(this.nvim, e, 'raw fetch'); }
    }
}
