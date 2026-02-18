import { AxiosResponse } from 'axios';
import { logWarn } from './logger';

const TOTAL_COUNT_HEADER = 'x-total-count';

export async function fetchAllParallel(
    apiCall: (params: Record<string, unknown>) => Promise<AxiosResponse<Record<string, unknown>[]>>,
    withRetry: <T>(fn: () => Promise<T>, retries?: number) => Promise<T>,
    onProgress?: (count: number, total: number) => void,
    fields?: string,
    totalItems?: number
): Promise<Record<string, unknown>[]> {
    const limit = 250;
    let total = totalItems ?? 0;
    let firstPageData: Record<string, unknown>[] = [];

    if (total === 0) {
        const firstResp = await withRetry(() => apiCall({ offset: 0, limit, count: true, fields }));
        total = parseInt(firstResp.headers[TOTAL_COUNT_HEADER] || '0', 10);
        firstPageData = firstResp.data;
    }

    const items: Record<string, unknown>[] = [...firstPageData];
    if (onProgress) onProgress(items.length, total);
    if (items.length >= total) return items;

    const offsets: number[] = [];
    const startOffset = firstPageData.length > 0 ? limit : 0;
    for (let o = startOffset; o < total; o += limit) {
        offsets.push(o);
    }

    const concurrency = 5; // Safe concurrency for high-rate tenants
    let offsetIndex = 0;

    const worker = async () => {
        while (offsetIndex < offsets.length) {
            const idx = offsetIndex++;
            if (idx >= offsets.length) break;

            try {
                const r = await withRetry(() => apiCall({ offset: offsets[idx], limit, count: false, fields }));
                items.push(...r.data);
                if (onProgress) onProgress(items.length, total);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                logWarn(`SailPoint: parallel page fetch failed at offset ${offsets[idx]}: ${message}`);
            }
        }
    };

    const workers = Array(concurrency).fill(null).map(() => worker());
    await Promise.all(workers);

    return items;
}
