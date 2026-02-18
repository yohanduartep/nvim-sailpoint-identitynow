import { Neovim } from 'neovim';
import { logWarn } from './services/logger';

const itemSortLabel = (item: any) => item?.displayName || item?.name || item?.key || item?.attribute || item?.id;


export const sortItems = (items: any[]) => {
    const alphaRegex = /^[a-z]/i;
    const digitRegex = /^[0-9]/;
    const processed = items.map(item => {
        const name = String(itemSortLabel(item) || '').trim();
        const first = name[0] || '';
        const rank = alphaRegex.test(first) ? 0 : (digitRegex.test(first) ? 2 : 1);
        return { item, name, rank };
    });

    processed.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });

    return processed.map(p => p.item);
};

export const getCacheTtlMs = async (nvim: Neovim) => {
    let ttl = 24 * 60 * 60 * 1000; // 24 hours default
    try {
        const userTtl = await nvim.getVar('sailpoint_cache_ttl');
        if (typeof userTtl === 'number' && userTtl > 0) ttl = userTtl;
    } catch (e: any) {
        logWarn(`SailPoint: using default cache TTL (24 hours): ${e?.message || String(e)}`);
    }
    return ttl;
};
