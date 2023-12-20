import { authorize, PopupConfiguration, revoke } from '@frontify/frontify-authenticator';
import { getItem, popItem, setItem, Token } from './Storage';
import { FrontifyFinder, FinderOptions, FrontifyAsset } from './Finder';
import { logMessage } from './Logger';
import { computeStorageKey } from './Utils';
import { FinderError } from './Exception';

const FINDER_CLIENT_SCOPES = ['basic:read', 'finder:read'];
const EXPIRES_IN_LEEWAY = 300;

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

export async function create(
    { clientId, domain, options }: OpeningOptions,
    popupConfiguration?: PopupConfiguration,
): Promise<FrontifyFinder> {
    if (!isAuthorized({ clientId }))
    {
        if (options?.serviceToken && domain)
        {
            const token: Token = {
                bearerToken: {
                    accessToken: options.serviceToken,
                    domain: domain,
                    expiresIn: Number.MAX_SAFE_INTEGER,
                    tokenType: 'Bearer',
                    refreshToken: options.serviceToken
                },
                clientId: clientId, 
                scopes: FINDER_CLIENT_SCOPES
            }; 
            storeAccessToken(token, { clientId });
        } 
        else
        {
            const token = (await authorize({ domain, clientId, scopes: FINDER_CLIENT_SCOPES }, popupConfiguration)
            .then((token) => {
                return token;
            })
            .catch(() => {
                logMessage('error', {
                    code: 'ERR_FINDER_AUTH_FAILED',
                    message: 'Authentication Failed!',
                });
            })) as Token;
            storeAccessToken(token, { clientId });
        }
    }

    const token = getItem<Token>(computeStorageKey(clientId));
    if (!token) {
        throw new FinderError('ERR_FINDER_ACCESS_STORED_TOKEN', 'Error accessing stored token.');
    }

    return new FrontifyFinder(token, options ?? DEFAULT_OPTIONS, async () => {
        await logout({ clientId });
        logMessage('warning', {
            code: 'WARN_USER_LOGOUT',
            message: 'User successfully logged out',
        });
    });
}

export async function logout({ clientId }: { clientId: string }): Promise<void> {
    const storageKey = computeStorageKey(clientId);
    const token = popItem<Token>(storageKey);

    if (token) {
        await revoke(token);
    }
}

function isAuthorized({ clientId }: ClientConfiguration): boolean {
    const storageKey: string = computeStorageKey(clientId);
    return !!getItem<Token>(storageKey);
}

function storeAccessToken(token: Token, { clientId }: ClientConfiguration): void {
    const expiresIn: number = token.bearerToken.expiresIn - EXPIRES_IN_LEEWAY;
    const key: string = computeStorageKey(clientId);
    setItem(key, token, expiresIn);
}
