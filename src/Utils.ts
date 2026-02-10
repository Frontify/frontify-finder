import { FinderError } from './Exception';

export function getFinderStoragePrefix(): string {
    return 'FRONTIFY_FINDER';
}

export function computeStorageKey(clientId: string): string {
    return `${getFinderStoragePrefix()}-${clientId}`;
}

export async function httpCall<JsonResponse>(url: string, init?: RequestInit): Promise<JsonResponse> {
    try {
        const response = await fetch(url, init);

        if (response.status < 200 || response.status >= 300) {
            throw new FinderError('ERR_FINDER_HTTP_REQUEST', response.statusText);
        }

        return (await response.json()) as JsonResponse;
    } catch (error) {
        if (error instanceof FinderError) {
            throw error;
        }

        const errorMesssage = error instanceof Error ? error.message : '';

        throw new FinderError('ERR_FINDER_HTTP_REQUEST', errorMesssage);
    }
}
