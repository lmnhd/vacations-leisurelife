/**
 * OdysseusSessionManager
 *
 * Maintains a single persistent OdysseusEngine instance across requests.
 * Eliminates the 40-60s browser init + login + validateHealth overhead on every search.
 *
 * Lifecycle:
 *  - First call: full init → login → validateHealth (~60s, one time)
 *  - Subsequent calls: reuse warm session → validateHealth only (~3-5s)
 *  - If health check fails or browser crashes: teardown + re-init transparently
 */

import { OdysseusEngine } from './OdysseusEngine';

interface ManagedSession {
    engine: OdysseusEngine;
    readyAt: number;
    lastUsedAt: number;
}

const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle → close and re-init

let _session: ManagedSession | null = null;
let _initPromise: Promise<ManagedSession> | null = null;

async function createSession(): Promise<ManagedSession> {
    console.log('[OdysseusSessionManager] Starting new persistent session...');
    const engine = new OdysseusEngine();
    await engine.init(true);
    await engine.login();
    await engine.validateHealth();
    const now = Date.now();
    console.log('[OdysseusSessionManager] Persistent session ready.');
    return { engine, readyAt: now, lastUsedAt: now };
}

async function teardown(): Promise<void> {
    if (_session) {
        console.log('[OdysseusSessionManager] Tearing down existing session...');
        try {
            await _session.engine.close();
        } catch {
            // silent — browser may already be gone
        }
        _session = null;
    }
    _initPromise = null;
}

export async function getOdysseusSession(): Promise<OdysseusEngine> {
    // If idle too long, close and start fresh
    if (_session && Date.now() - _session.lastUsedAt > SESSION_IDLE_TIMEOUT_MS) {
        console.log('[OdysseusSessionManager] Session idle timeout reached. Recycling...');
        await teardown();
    }

    // If already initializing, wait on the same promise
    if (_initPromise) {
        const session = await _initPromise;
        session.lastUsedAt = Date.now();
        return session.engine;
    }

    // If session exists, run health check before returning
    if (_session) {
        try {
            await _session.engine.validateHealth();
            _session.lastUsedAt = Date.now();
            console.log('[OdysseusSessionManager] Reusing warm session.');
            return _session.engine;
        } catch (err) {
            console.warn('[OdysseusSessionManager] Health check failed on warm session — reinitializing.', err);
            await teardown();
        }
    }

    // Cold start or after teardown
    _initPromise = createSession().then((session) => {
        _session = session;
        _initPromise = null;
        return session;
    }).catch(async (err) => {
        _initPromise = null;
        _session = null;
        throw err;
    });

    const session = await _initPromise;
    return session.engine;
}

export async function releaseOdysseusSession(): Promise<void> {
    await teardown();
}
