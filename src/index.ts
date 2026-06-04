import { type PopupConfiguration } from '@frontify/frontify-authenticator';

import { FinderError } from './Exception';
import { type FinderOptions, type FrontifyAsset, FrontifyFinder } from './Finder';
import { logMessage } from './Logger';
import { type Token } from './Storage';

const DEFAULT_SESSION_CODE = 'DEV-CODE';

export type { Token, FrontifyAsset, FinderOptions };

type ClientConfiguration = {
    clientId: string;
    domain?: string;
};

export type OpeningOptions = ClientConfiguration & {
    options?: FinderOptions;
};

const DEFAULT_OPTIONS: FinderOptions = {
    autoClose: false,
    allowMultiSelect: false,
    filters: [],
};

/**
 * DEV/CHIPS prototype.
 *
 * Mounts the embedded asset chooser, which authenticates via a CHIPS partitioned session cookie that
 * the backend establishes from a one-time session code — so the OAuth popup is skipped entirely.
 * `popupConfiguration` is accepted for API compatibility but unused in this mode.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function create(
    { domain, options }: OpeningOptions,
    _popupConfiguration?: PopupConfiguration,
): Promise<FrontifyFinder> {
    if (!domain) {
        throw new FinderError('ERR_FINDER_DOMAIN_REQUIRED', 'A domain is required to mount the finder.');
    }

    const sessionCode = options?.sessionCode ?? DEFAULT_SESSION_CODE;

    return new FrontifyFinder(domain, sessionCode, options ?? DEFAULT_OPTIONS, () => {
        logMessage('warning', {
            code: 'WARN_USER_LOGOUT',
            message: 'Logout requested (no-op in CHIPS mock).',
        });
    });
}
