import { Store } from './Store';
import { getFinderStoragePrefix } from './Utils';

const FINDER_STORAGE_ITEM_TEST = {
    key: `${getFinderStoragePrefix()}_test`,
    value: 'yes',
};

let storage: Storage | undefined = undefined;

export type Token = {
    bearerToken: {
        tokenType: string;
        expiresIn: number;
        accessToken: string;
        refreshToken: string;
        domain: string;
    };
    clientId: string;
    scopes: string[];
};

type StorageItem<Token> = {
    expiresAt?: number;
    data: Token;
};

function getStorage(): Storage {
    if (storage === undefined) {
        storage = getBestAvailableStorage();
    }
    return storage;
}

function getCurrentTimeInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function isPastTimestamp(timestamp: number): boolean {
    return timestamp < getCurrentTimeInSeconds();
}

function removeItem(key: string): void {
    getStorage().removeItem(key);
}

export function setItem(key: string, data: Token, expiresInSeconds?: number): void {
    const item: StorageItem<Token> = {
        expiresAt: expiresInSeconds ? getCurrentTimeInSeconds() + expiresInSeconds : undefined,
        data,
    };

    getStorage().setItem(key, JSON.stringify(item));
}

export function popItem<Token>(key: string): Token | undefined {
    const item = getItem<Token>(key);

    if (item) {
        removeItem(key);
    }

    return item;
}

export function getItem<Token>(key: string): Token | undefined {
    const item = getStorage().getItem(key);

    if (!item) {
        return;
    }

    const decodedItem = JSON.parse(item) as StorageItem<Token> | null;

    if (!decodedItem) {
        removeItem(key);
        return;
    }

    if (decodedItem.expiresAt && isPastTimestamp(decodedItem.expiresAt)) {
        removeItem(key);
        return;
    }

    return decodedItem.data;
}

function getBestAvailableStorage(): Storage {
    if (isStorageAvailable('localStorage')) {
        return window.localStorage;
    }

    if (isStorageAvailable('sessionStorage')) {
        return window.sessionStorage;
    }

    return new Store();
}

function isStorageAvailable(storageName: 'localStorage' | 'sessionStorage'): boolean {
    try {
        if (typeof window[storageName] === 'undefined') {
            return false;
        }

        const storage = window[storageName] as Storage;

        storage.setItem(FINDER_STORAGE_ITEM_TEST.key, FINDER_STORAGE_ITEM_TEST.value);
        if (storage.getItem(FINDER_STORAGE_ITEM_TEST.key) === FINDER_STORAGE_ITEM_TEST.value) {
            storage.removeItem(FINDER_STORAGE_ITEM_TEST.key);
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}
