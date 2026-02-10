export class Store implements Storage {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required by Storage interface
    [name: string]: any;

    readonly length: number = 0;

    key(): string | null {
        return null;
    }

    clear(): void {
        for (const key of Object.keys(this)) {
            this.removeItem(key);
        }
    }

    getItem(key: string): string | null {
        if (typeof this[key] !== 'string') {
            return null;
        }

        return this[key];
    }

    removeItem(key: string): void {
        if (typeof this[key] === 'string') {
            delete this[key];
        }
    }

    setItem(key: string, value: string): void {
        this[key] = value;
    }
}
