import { version } from '../package.json';

import { type Asset, type FrontifyAsset, requestAssetsById } from './Api';
import { FinderError } from './Exception';
import { logMessage } from './Logger';
import { type Token } from './Storage';

export type { FrontifyAsset };

const GHOST_SIZE = 80;

export type FinderOptions = {
    allowMultiSelect?: boolean;
    autoClose?: boolean;
    filters?: FinderFilters;
    permanentDownloadUrls?: boolean;
    enableDragAndDrop?: boolean;
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

export type DropContext = {
    x: number;
    y: number;
    target: Element;
};

export type DropZoneHandler = (assets: FrontifyAsset[], dropContext: DropContext) => void;

type DragCoordinates = {
    x: number;
    y: number;
};

type DragStartPayload = {
    ids: (string | number)[];
    preview?: string;
};

type DragSession = {
    ids: (string | number)[];
};

type FinderMessage = {
    configurationRequested?: boolean;
    assetsChosen?: Asset[];
    aborted?: boolean;
    logout?: boolean;
    dragStart?: DragStartPayload;
    pointerMove?: DragCoordinates;
    pointerUp?: DragCoordinates;
};

export class FrontifyFinder {
    private parentNode: HTMLElement | undefined;
    private readonly iFrame: HTMLIFrameElement;
    private callbacks: FinderCallbacks = {};
    private unsubscribe: (() => void) | undefined;
    private readonly dropZones = new WeakMap<Element, DropZoneHandler>();
    private dragSession: DragSession | undefined;
    private dragGhost: HTMLElement | undefined;

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

            if (data.dragStart) {
                this.handleDragStart(data.dragStart);
                return;
            }

            if (data.pointerMove) {
                this.handleDragMove(data.pointerMove);
                return;
            }

            if (data.pointerUp) {
                // eslint-disable-next-line no-void
                void this.handleDragEnd(data.pointerUp);
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
                dragAndDropEnabled: this.options?.enableDragAndDrop ?? false,
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

    private hydrateAssets(assetIds: (string | number)[]): Promise<FrontifyAsset[]> {
        return requestAssetsById(
            {
                domain: this.domain,
                bearerToken: this.accessToken,
                permanentDownloadUrls: this.options?.permanentDownloadUrls ?? false,
            },
            assetIds,
        );
    }

    private async handleAssetsChosen(assetIds: (string | number)[]): Promise<void> {
        try {
            const assets: FrontifyAsset[] = await this.hydrateAssets(assetIds);

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

    private mapToHostCoordinates({ x, y }: DragCoordinates): DragCoordinates {
        const rect = this.iFrame.getBoundingClientRect();
        return { x: rect.left + x, y: rect.top + y };
    }

    private handleDragStart({ ids, preview }: DragStartPayload): void {
        this.dragSession = { ids };
        this.dragGhost = createDragGhost(preview, ids.length);
        this.parentNode?.ownerDocument.body.appendChild(this.dragGhost);
    }

    private handleDragMove(coordinates: DragCoordinates): void {
        if (!this.dragSession || !this.dragGhost) {
            return;
        }

        const { x, y } = this.mapToHostCoordinates(coordinates);
        this.dragGhost.style.opacity = '1';
        this.dragGhost.style.transform = `translate(${x - GHOST_SIZE / 2}px, ${y - GHOST_SIZE / 2}px)`;
    }

    private async handleDragEnd(coordinates: DragCoordinates): Promise<void> {
        const session = this.dragSession;
        this.dragSession = undefined;
        this.destroyDragGhost();

        if (!session) {
            return;
        }

        const { x, y } = this.mapToHostCoordinates(coordinates);
        const ownerDocument = this.parentNode?.ownerDocument ?? document;
        const dropZone = this.resolveDropZone(ownerDocument.elementFromPoint(x, y));

        if (!dropZone) {
            return;
        }

        try {
            const assets = await this.hydrateAssets(session.ids);
            dropZone.handler(assets, { x, y, target: dropZone.element });
        } catch (error) {
            if (!(error instanceof FinderError)) {
                logMessage('error', {
                    code: 'ERR_FINDER_ASSETS_DROP',
                    message: 'Failed retrieving dropped assets data.',
                });
            }
        }
    }

    private resolveDropZone(target: Element | null): { element: Element; handler: DropZoneHandler } | undefined {
        for (let element = target; element; element = element.parentElement) {
            const handler = this.dropZones.get(element);
            if (handler) {
                return { element, handler };
            }
        }

        return undefined;
    }

    private destroyDragGhost(): void {
        this.dragGhost?.remove();
        this.dragGhost = undefined;
    }

    public onAssetsChosen(callback: (assets: FrontifyAsset[]) => void): FrontifyFinder {
        this.callbacks.assetsChosen = callback;
        return this;
    }

    public onCancel(callback: () => void): FrontifyFinder {
        this.callbacks.cancel = callback;
        return this;
    }

    public enableDropZone(element: Element, handler: DropZoneHandler): FrontifyFinder {
        this.dropZones.set(element, handler);
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
            this.destroyDragGhost();
            this.dragSession = undefined;
            delete this.parentNode;
            delete this.unsubscribe;
        }
    }
}

const SINGLE_SHADOW = '0 4px 12px rgba(0, 0, 0, 0.25)';
const STACK_SHADOW = [
    '0 0 0 1px #d1d5db',
    '5px 5px 0 -1px #ffffff',
    '5px 5px 0 0 #d1d5db',
    '10px 10px 0 -1px #ffffff',
    '10px 10px 0 0 #d1d5db',
    '0 8px 18px rgba(0, 0, 0, 0.2)',
].join(', ');

function createDragGhost(preview: string | undefined, count: number): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = 'frontify-finder-drag-ghost';
    ghost.style.position = 'fixed';
    ghost.style.top = '0';
    ghost.style.left = '0';
    ghost.style.width = `${GHOST_SIZE}px`;
    ghost.style.height = `${GHOST_SIZE}px`;
    ghost.style.borderRadius = '6px';
    ghost.style.boxShadow = count > 1 ? STACK_SHADOW : SINGLE_SHADOW;
    ghost.style.backgroundColor = '#e5e7eb';
    ghost.style.backgroundSize = 'cover';
    ghost.style.backgroundPosition = 'center';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '2147483647';
    ghost.style.opacity = '0';
    ghost.style.transform = 'translate(-9999px, -9999px)';

    if (preview) {
        ghost.style.backgroundImage = `url("${preview}")`;
    }

    if (count > 1) {
        ghost.appendChild(createGhostBadge(count));
    }

    return ghost;
}

function createGhostBadge(count: number): HTMLElement {
    const badge = document.createElement('div');
    badge.textContent = String(count);
    badge.style.position = 'absolute';
    badge.style.top = '-8px';
    badge.style.right = '-8px';
    badge.style.minWidth = '20px';
    badge.style.height = '20px';
    badge.style.padding = '0 6px';
    badge.style.boxSizing = 'border-box';
    badge.style.borderRadius = '10px';
    badge.style.background = '#111110';
    badge.style.color = '#ffffff';
    badge.style.fontFamily = 'sans-serif';
    badge.style.fontSize = '12px';
    badge.style.lineHeight = '20px';
    badge.style.textAlign = 'center';
    badge.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.3)';

    return badge;
}

function createFinderElement(domain: string): HTMLIFrameElement {
    const iFrame: HTMLIFrameElement = document.createElement('iframe');
    iFrame.style.border = 'none';
    iFrame.style.outline = 'none';
    iFrame.style.width = '100%';
    iFrame.style.height = '100%';
    iFrame.style.display = 'block';
    iFrame.className = 'frontify-finder-iframe';
    iFrame.src = `https://${domain}/embedded-asset-chooser`;
    iFrame.name = 'Frontify Finder';
    iFrame.allow = 'clipboard-write';

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
