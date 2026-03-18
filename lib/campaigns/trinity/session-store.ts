import type { TrinitySession } from './types';

export interface TrinitySessionStore {
    save(session: TrinitySession): Promise<void>;
    get(sessionId: string): Promise<TrinitySession | null>;
}

export class TrinitySessionStoreNotImplementedError extends Error {
    constructor() {
        super('Trinity session store is not implemented yet.');
        this.name = 'TrinitySessionStoreNotImplementedError';
    }
}
