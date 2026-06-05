import { version } from '../package.json';

import { type FrontifyAsset } from './Api';
import { FinderError } from './Exception';
import { logMessage } from './Logger';

export type { FrontifyAsset };

export type FinderOptions = {
    allowMultiSelect?: boolean;
    autoClose?: boolean;
    filters?: FinderFilters;
    permanentDownloadUrls?: boolean;
    /** DEV/CHIPS mock: one-time code the embedded route exchanges for a partitioned session cookie. */
    sessionCode?: string;
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
    assetsChosen?: FrontifyAsset[];
    aborted?: boolean;
    logout?: boolean;
};

export class FrontifyFinder {
    private parentNode: HTMLElement | undefined;
    private readonly iFrame: HTMLIFrameElement;
    private callbacks: FinderCallbacks = {};
    private unsubscribe: (() => void) | undefined;

    constructor(
        private domain: string,
        private sessionCode: string,
        private options: FinderOptions,
        private onLogoutRequested: () => void,
    ) {
        this.iFrame = createFinderElement(domain);
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
                this.handleAssetsChosen(data.assetsChosen);
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
        return `https://${this.domain}`;
    }

    private initialize(): void {
        this.iFrame?.contentWindow?.postMessage(
            {
                version,
                sessionCode: this.sessionCode,
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

    private handleAssetsChosen(assets: FrontifyAsset[]): void {
        // The embedded route already resolves selections via graphql-internal and posts full asset
        // payloads, so the finder no longer re-fetches by id — it just forwards them to the consumer.
        if (this.options?.autoClose) {
            this.close();
        }

        if (this.callbacks.assetsChosen) {
            this.callbacks.assetsChosen(assets);
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
    iFrame.src = `https://${domain}/embedded-asset-chooser?devFlags=NEW_FINDER_REACT_IFRAME`;
    iFrame.name = 'Frontify Finder';

    iFrame.sandbox.add('allow-same-origin');
    iFrame.sandbox.add('allow-scripts');
    iFrame.sandbox.add('allow-forms');
    // Required so the embedded chooser can call document.requestStorageAccess() to reach the user's
    // real first-party Frontify session (Storage Access API).
    iFrame.sandbox.add('allow-storage-access-by-user-activation');

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
