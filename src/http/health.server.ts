import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Logger } from "../lib/logger.js";

export interface HealthServerOptions {
    port: number;
    host?: string;
    readinessCheck: () => Promise<unknown>;
    statusProvider: () => unknown;
    logger: Logger;
    readinessTimeoutMs?: number;
}

export interface HealthServer {
    port: number;
    close(): Promise<void>;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
    res.end(payload);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`readiness check timed out after ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

export async function startHealthServer(options: HealthServerOptions): Promise<HealthServer> {
    const { port, host = "0.0.0.0", readinessCheck, statusProvider, logger, readinessTimeoutMs = 3000 } = options;

    const server = http.createServer((req, res) => {
        void (async () => {
            const path = (req.url ?? "/").split("?")[0];
            if (req.method !== "GET" || !["/healthz", "/readyz", "/status"].includes(path)) {
                sendJson(res, 404, { error: "not_found" });
                return;
            }
            try {
                if (path === "/healthz") {
                    sendJson(res, 200, { status: "ok" });
                } else if (path === "/readyz") {
                    try {
                        await withTimeout(Promise.resolve().then(readinessCheck), readinessTimeoutMs);
                        sendJson(res, 200, { status: "ready" });
                    } catch (err) {
                        logger.warn({ err }, "Readiness check failed");
                        sendJson(res, 503, { status: "unavailable" });
                    }
                } else {
                    sendJson(res, 200, statusProvider());
                }
            } catch (err) {
                logger.error({ err }, "Health endpoint error");
                sendJson(res, 500, { error: "internal_error" });
            }
        })();
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    const address = server.address() as AddressInfo;
    logger.info({ host: address.address, port: address.port }, "Health server listening");

    return {
        port: address.port,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
                server.closeAllConnections();
            }),
    };
}
