import { logMessage } from './Logger';

export class FinderError extends Error {
    constructor(
        public code: string,
        message: string,
    ) {
        super(`${code}: ${message}`);
        logMessage('error', {
            code,
            message,
        });
    }
}
