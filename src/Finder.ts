import { FrontifyAsset, Asset, requestAssetsById } from './Api';
import { Token } from './Storage';
import { FinderError } from './Exception';
import { logMessage } from './Logger';

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

export class FrontifyFinder {
    private parentNode: HTMLElement | undefined;
    private readonly iFrame: HTMLIFrameElement;
    private listeners: { [key: string]: CallableFunction } = {};
    private unsubscribe: CallableFunction | undefined;

    private static get VERSION(): number {
        return 2.0;
    }

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

            if (event.data.configurationRequested) {
                this.initialize();
                return;
            }

            if (event.data.assetsChosen) {
                try {
                    this.handleAssetsChosen(event.data.assetsChosen.map((asset: Asset) => asset.id));
                } catch (error) {
                    throw error;
                }
                return;
            }

            if (event.data.aborted) {
                this.handleFinderCancel();
                return;
            }

            if (event.data.logout) {
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
                version: FrontifyFinder.VERSION,
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

        if (this.listeners['cancel']) {
            this.listeners['cancel']();
        }
    }

    private async handleAssetsChosen(assetIds: Asset[]): Promise<void> {
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

            if (this.listeners['assetsChosen']) {
                this.listeners['assetsChosen'](assets);
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
        this.listeners['assetsChosen'] = callback;
        return this;
    }

    public onCancel(callback: () => void): FrontifyFinder {
        this.listeners['cancel'] = callback;
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
        } catch (error) {
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
