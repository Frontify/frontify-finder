import { version } from '../package.json';

import { type Asset, type FrontifyAsset, requestAssetsById } from './Api';
import { FinderError } from './Exception';
import { logMessage } from './Logger';
import { type Token } from './Storage';

export type { FrontifyAsset };

export type FinderOptions = {
    allowMultiSelect?: boolean;
    autoClose?: boolean;
    filters?: FinderFilters;
    permanentDownloadUrls?: boolean;
};

type FinderFilters = FinderFilter[] | [];

type FinderFilter = {
    key: string;
    values: string[];
    inverted: boolean;
};

type FinderCallbacks = {
    cancel?: () => void;
    assetsChosen?: (assets: FrontifyAsset[]) => void;
};

type FinderMessage = {
    configurationRequested?: boolean;
    assetsChosen?: Asset[];
    aborted?: boolean;
    logout?: boolean;
};

export class FrontifyFinder {
    private parentNode: HTMLElement | undefined;
    private readonly iFrame: HTMLIFrameElement;
    private callbacks: FinderCallbacks = {};
    private unsubscribe: (() => void) | undefined;

    constructor(
        private token: Token,
        private options: FinderOptions,
        private onLogoutRequested: () => void,
    ) {
        this.iFrame = createFinderElement(token.bearerToken.domain);
    }

    private subscribeToFinderEvents() {
        const windowObject = this.parentNode?.ownerDocument?.defaultView || window;
        this.unsubscribe = subscribeToEvents(windowObject, 'message', (event: MessageEventInit) => {
            // Ensure the events are originating from the right source
            if (this.iFrame.contentWindow !== event.source || event.origin !== this.origin) {
                return;
            }

            const data = event.data as FinderMessage;

            if (data.configurationRequested) {
                this.initialize();
                return;
            }

            if (data.assetsChosen) {
                // eslint-disable-next-line no-void
                void this.handleAssetsChosen(data.assetsChosen.map((asset: Asset) => asset.id));
                return;
            }

            if (data.aborted) {
                this.handleFinderCancel();
                return;
            }

            if (data.logout) {
                this.onLogoutRequested();
                this.handleFinderCancel();
                return;
            }

            logMessage('warning', {
                code: 'WARN_FINDER_UNKNOWN_EVENT',
                message: 'Unknown event from Frontify Finder.',
            });
        });
    }

    private get origin(): string {
        return `https://${this.token.bearerToken.domain}`;
    }

    private get domain(): string {
        return this.token.bearerToken.domain;
    }

    private get accessToken(): string {
        return this.token.bearerToken.accessToken;
    }

    private initialize(): void {
        this.iFrame?.contentWindow?.postMessage(
            {
                version,
                token: this.accessToken,
                supports: {
                    cancel: true,
                    logout: true,
                },
                multiSelectionAllowed: this.options?.allowMultiSelect ?? false,
                filters: this.options?.filters,
            },
            this.origin,
        );
    }

    private handleFinderCancel(): void {
        if (this.options.autoClose) {
            this.close();
        }

        if (this.callbacks.cancel) {
            this.callbacks.cancel();
        }
    }

    private async handleAssetsChosen(assetIds: (string | number)[]): Promise<void> {
        try {
            const assets: FrontifyAsset[] = await requestAssetsById(
                {
                    domain: this.domain,
                    bearerToken: this.accessToken,
                    permanentDownloadUrls: this.options?.permanentDownloadUrls ?? false,
                },
                assetIds,
            );

            if (this.options?.autoClose) {
                this.close();
            }

            if (this.callbacks.assetsChosen) {
                this.callbacks.assetsChosen(assets);
            }
        } catch (error) {
            if (!(error instanceof FinderError)) {
                logMessage('error', {
                    code: 'ERR_FINDER_ASSETS_SELECTION',
                    message: 'Failed retrieving assets data.',
                });
            }
        }
    }

    public onAssetsChosen(callback: (assets: FrontifyAsset[]) => void): FrontifyFinder {
        this.callbacks.assetsChosen = callback;
        return this;
    }

    public onCancel(callback: () => void): FrontifyFinder {
        this.callbacks.cancel = callback;
        return this;
    }

    public mount(parentNode: HTMLElement): void {
        if (this.parentNode) {
            throw new FinderError('ERR_FINDER_ALREADY_MOUNTED', 'Frontify Finder already mounted on a parent node.');
        }

        this.parentNode = parentNode;
        this.subscribeToFinderEvents();
        this.parentNode.appendChild(this.iFrame);
    }

    public close(): void {
        try {
            if (this.unsubscribe) {
                this.unsubscribe();
            }

            if (this.parentNode) {
                this.parentNode.removeChild(this.iFrame);
            }
        } catch {
            logMessage('error', {
                code: 'ERR_FINDER_CLOSE',
                message: 'Error closing Frontify Finder.',
            });
        } finally {
            delete this.parentNode;
            delete this.unsubscribe;
        }
    }
}

function createFinderElement(domain: string): HTMLIFrameElement {
    const iFrame: HTMLIFrameElement = document.createElement('iframe');
    iFrame.style.border = 'none';
    iFrame.style.outline = 'none';
    iFrame.style.width = '100%';
    iFrame.style.height = '100%';
    iFrame.style.display = 'block';
    iFrame.className = 'frontify-finder-iframe';
    iFrame.src = `https://${domain}/external-asset-chooser`;
    iFrame.name = 'Frontify Finder';

    iFrame.sandbox.add('allow-same-origin');
    iFrame.sandbox.add('allow-scripts');
    iFrame.sandbox.add('allow-forms');

    return iFrame;
}

function subscribeToEvents(element: HTMLElement | Window, eventName: string, listener: EventListener): () => void {
    const eventListener = (e: Event) => {
        listener(e);
    };
    element.addEventListener(eventName, eventListener);
    return () => {
        element.removeEventListener(eventName, eventListener);
    };
}
