import { ISCClient } from '../services/ISCClient';
import { BufferUtils } from '../utils/BufferUtils';

type CommandArgs = Array<string | number | undefined>;
type GetClient = () => { client: ISCClient };
type ResourceObject = Record<string, unknown>;

const toOptionalStringArg = (value: string | number | undefined): string | undefined => value == null ? undefined : String(value);
const toTargetWinId = (value: string | number | undefined): number | undefined => {
    if (typeof value === 'number' && value > 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        const n = Number(value);
        return n > 0 ? n : undefined;
    }
    return undefined;
};

const normalizeArgs = (args: CommandArgs): string[] =>
    args
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0);

const popTargetWinIdToken = (tokens: string[]): number | undefined => {
    if (tokens.length === 0) return undefined;
    const last = tokens[tokens.length - 1];
    if (/^\d+$/.test(last)) {
        tokens.pop();
        const parsed = Number(last);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
    return undefined;
};

const matchByKey = (items: ResourceObject[], key: string): ResourceObject | undefined => {
    const equalsKey = (value: unknown): boolean => value != null && String(value) === key;
    return items.find((item) =>
        equalsKey(item?.id) ||
        equalsKey(item?.name) ||
        equalsKey(item?.displayName) ||
        equalsKey(item?.key) ||
        equalsKey(item?.attribute)
    );
};

export class ResourceOpeners {
    constructor(private readonly bufferUtils: BufferUtils) {}

    public async openTransform(args: CommandArgs, getClient: GetClient): Promise<void> {
        const { client } = getClient();
        const input = String(args[0] || '');
        const looksLikeId = /^[0-9a-fA-F-]{20,}$/.test(input);
        let transform: ResourceObject | undefined;
        if (looksLikeId) {
            try {
                transform = await client.getTransformById(input) as unknown as ResourceObject;
            } catch {
                transform = undefined;
            }
        }
        if (!transform) {
            transform = await client.getTransformByName(input) as unknown as ResourceObject;
        }
        if (!transform) {
            throw new Error(`Transform not found: ${input}`);
        }
        const label = String(transform.name || 'unnamed');
        const transformId = String(transform.id || input);
        await this.bufferUtils.openBuffer(label, transform, 'transform', transformId, transform, toOptionalStringArg(args[1]));
    }

    public async tryOpenSpecial(loader: string, args: CommandArgs, getClient: GetClient): Promise<boolean> {
        if (loader === 'transform') {
            await this.openTransform(args, getClient);
            return true;
        }
        if (loader === 'searchAttribute') {
            await this.openSearchAttribute(args, getClient);
            return true;
        }
        if (loader === 'identityAttribute') {
            await this.openIdentityAttribute(args, getClient);
            return true;
        }
        return false;
    }

    public async openSearchAttribute(args: CommandArgs, getClient: GetClient): Promise<void> {
        const { client } = getClient();
        const key = String(args[0] || '').trim();
        if (!key) {
            throw new Error('Search attribute key is required');
        }
        const items = await client.getSearchAttributes();
        const match = matchByKey(items as ResourceObject[], key);
        if (!match) {
            throw new Error(`Search attribute not found: ${key}`);
        }

        const label = String(match.name || match.displayName || match.key || match.attribute || key);
        await this.bufferUtils.openBuffer(
            label,
            match,
            'search-attributes',
            key,
            match,
            toOptionalStringArg(args[1]),
            toTargetWinId(args[2])
        );
    }

    public async openIdentityAttribute(args: CommandArgs, getClient: GetClient): Promise<void> {
        const { client } = getClient();
        const tokens = normalizeArgs(args);
        const targetWinId = popTargetWinIdToken(tokens);
        let matchedField: string | undefined;
        if (tokens.length >= 2) {
            matchedField = tokens.pop();
        }

        const key = tokens.join(' ').trim();
        if (!key) {
            throw new Error('Identity attribute key is required');
        }

        const items = await client.getIdentityAttributes();
        const match = matchByKey(items as ResourceObject[], key);
        if (!match) {
            throw new Error(`Identity attribute not found: ${key}`);
        }

        const label = String(match.name || match.displayName || match.key || match.attribute || key);
        await this.bufferUtils.openBuffer(
            label,
            match,
            'identity-attributes',
            key,
            match,
            matchedField,
            targetWinId
        );
    }

    public async openRaw(args: CommandArgs | [CommandArgs], getClient: GetClient): Promise<void> {
        const { client } = getClient();
        const flatArgs = Array.isArray(args[0]) ? args[0] as CommandArgs : args as CommandArgs;

        let path = String(flatArgs[0] || '');
        if (!path) {
            throw new Error('Path is required');
        }

        let type = String(flatArgs[1] || 'raw');
        let id = String(flatArgs[2] || '');
        let matchedField = String(flatArgs[3] || '');

        if (flatArgs.length === 1 && path.includes(' ')) {
            const parts = path.split(/\s+/);
            path = parts[0];
            type = parts[1] || 'raw';
            id = parts[2] || '';
            matchedField = parts[3] || '';
        }

        if (!id) {
            const parts = path.split('/');
            id = parts[parts.length - 1] || 'raw';
        }

        await this.bufferUtils.openBuffer(id, await client.getResource(path), type, id, null, matchedField);
    }
}
