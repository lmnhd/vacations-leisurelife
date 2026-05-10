/**
 * Agent-safe dev server health check — non-blocking TCP connect.
 * Exits in ≤3s regardless of server state. No Playwright, no fetch().
 *
 * Usage: npx tsx scripts/agent/check-server.ts [--port 3000]
 * Stdout: "RUNNING" or "NOT_RUNNING"
 * Exit code: 0 = RUNNING, 1 = NOT_RUNNING
 */

import * as net from 'net';

const TIMEOUT_MS = 3000;
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg !== -1 ? parseInt(args[portArg + 1] ?? '3000', 10) : 3000;
const HOST = 'localhost';

function tcpCheck(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function main(): Promise<void> {
    const running = await tcpCheck(HOST, PORT, TIMEOUT_MS);
    console.log(running ? 'RUNNING' : 'NOT_RUNNING');
    process.exit(running ? 0 : 1);
}

main();
