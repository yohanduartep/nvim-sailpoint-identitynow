import { Neovim } from 'neovim';
import { ISCClient } from '../services/ISCClient';
import { BufferUtils } from '../utils/BufferUtils';
import { handleError } from '../errors';
import { RESOURCE_REGISTRY } from '../resourceRegistry';
import { ResourceOpeners } from './ResourceOpeners';

type CommandArgs = Array<string | number | undefined>;
type GetClient = () => { client: ISCClient };
type ResourceObject = Record<string, unknown>;
type ByIdMethod = 'getSourceById' | 'getAccessProfileById' | 'getEntitlement' | 'getConnectorRuleById' | 'getWorflow';

const toStringArg = (value: string | number | undefined): string => String(value || '');
const toOptionalStringArg = (value: string | number | undefined): string | undefined => value == null ? undefined : String(value);
const toTargetWinId = (value: string | number | undefined): number | undefined => {
    if (typeof value === 'number' && value > 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        const n = Number(value);
        return n > 0 ? n : undefined;
    }
    return undefined;
};

export class ResourceCommands {
    private readonly openers: ResourceOpeners;

    constructor(
        private readonly nvim: Neovim,
        private readonly bufferUtils: BufferUtils
    ) {
        this.openers = new ResourceOpeners(bufferUtils);
    }

    private async openFetchedResource(
        args: CommandArgs,
        getClient: GetClient,
        opts: {
            type: string;
            action: string;
            load: (client: ISCClient, inputId: string) => Promise<ResourceObject>;
            resolveId?: (item: ResourceObject, inputId: string) => string;
        }
    ): Promise<void> {
        try {
            const { client } = getClient();
            const inputId = String(args[0] || '');
            const matchedField = toOptionalStringArg(args[1]);
            const targetWinId = toTargetWinId(args[2]);
            const item = await opts.load(client, inputId);
            const resolvedId = opts.resolveId ? opts.resolveId(item, inputId) : inputId;
            const label = String(item.name || item.id || 'unnamed');
            await this.bufferUtils.openBuffer(label, item, opts.type, resolvedId, item, matchedField, targetWinId);
        } catch (e) {
            handleError(this.nvim, e, opts.action);
        }
    }

    private async loadById(client: ISCClient, method: ByIdMethod, id: string): Promise<ResourceObject> {
        const loader = client[method] as unknown as (resourceId: string) => Promise<unknown>;
        return await loader.call(client, id) as ResourceObject;
    }

    public async openFromRegistry(resourceId: string, args: CommandArgs, getClient: GetClient): Promise<void> {
        const entry = RESOURCE_REGISTRY.find(item => item.id === resourceId);
        if (!entry?.commandOpen) {
            throw new Error(`No registry command loader configured for resource: ${resourceId}`);
        }

        const { commandOpen } = entry;
        if (await this.openers.tryOpenSpecial(commandOpen.loader, args, getClient)) {
            return;
        }

        await this.openFetchedResource(args, getClient, {
            type: commandOpen.resourceType,
            action: commandOpen.action,
            load: async (client, id) => {
                if (commandOpen.loader === 'roleByIdQuery') {
                    return ((await client.getRoles({ filters: `id eq "${id}"` })).data[0] || {}) as unknown as ResourceObject;
                }
                if (commandOpen.loader === 'byId' && commandOpen.clientMethod) {
                    return await this.loadById(client, commandOpen.clientMethod, id);
                }
                throw new Error(`Unsupported command loader for ${resourceId}`);
            }
        });
    }

    public async openFromCommand(commandName: string, args: CommandArgs, getClient: GetClient): Promise<void> {
        const entry = RESOURCE_REGISTRY.find((item) =>
            item.openConfig.type === 'command' &&
            item.openConfig.command === commandName &&
            !!item.commandOpen
        );
        if (!entry) {
            throw new Error(`No registry command mapped for ${commandName}`);
        }
        await this.openFromRegistry(entry.id, args, getClient);
    }

    public async aggregate(args: CommandArgs, getClient: GetClient): Promise<void> {
        try {
            const { client } = getClient();
            if (args[0] === 'entitlements') await client.startEntitlementAggregation(toStringArg(args[1]));
            else await client.startAccountAggregation(toStringArg(args[1]));
            this.nvim.outWrite(`Aggregation triggered.
`);
        } catch (e) { handleError(this.nvim, e, 'aggregating'); }
    }

    public async deleteResource(args: CommandArgs, getClient: GetClient): Promise<void> {
        try {
            const { client } = getClient();
            const target = toStringArg(args[0]);
            await client.deleteResource(target);
            this.nvim.outWrite(`Deleted: ${target}
`);
        }
        catch (e: unknown) { handleError(this.nvim, e, `deleting ${args[0]}`); }
    }

    public async getSource(args: CommandArgs, getClient: GetClient): Promise<void> {
        await this.openFromRegistry('sources', args, getClient);
    }

    public async getTransform(args: CommandArgs, getClient: GetClient): Promise<void> {
        try {
            await this.openers.openTransform(args, getClient);
        }
        catch (e) { handleError(this.nvim, e, 'getting transform'); }
    }

    public async getRole(args: CommandArgs, getClient: GetClient): Promise<void> {
        await this.openFromRegistry('roles', args, getClient);
    }

    public async getAccessProfile(args: CommandArgs, getClient: GetClient): Promise<void> {
        await this.openFromRegistry('access-profiles', args, getClient);
    }

    public async getEntitlement(args: CommandArgs, getClient: GetClient): Promise<void> {
        await this.openFromRegistry('entitlements', args, getClient);
    }

    public async getConnectorRule(args: CommandArgs, getClient: GetClient): Promise<void> {
        await this.openFromRegistry('rules', args, getClient);
    }

    public async getWorkflow(args: CommandArgs, getClient: GetClient): Promise<void> {
        await this.openFromRegistry('workflows', args, getClient);
    }

    public async getSearchAttribute(args: CommandArgs, getClient: GetClient): Promise<void> {
        try {
            await this.openers.openSearchAttribute(args, getClient);
        } catch (e) { handleError(this.nvim, e, 'getting search attribute'); }
    }

    public async getIdentityAttribute(args: CommandArgs, getClient: GetClient): Promise<void> {
        try {
            await this.openers.openIdentityAttribute(args, getClient);
        } catch (e) { handleError(this.nvim, e, 'getting identity attribute'); }
    }

    public async getRaw(args: CommandArgs | [CommandArgs], getClient: GetClient): Promise<void> {
        try {
            await this.openers.openRaw(args, getClient);
        }
        catch (e) { handleError(this.nvim, e, 'raw fetch'); }
    }
}
