import { readFile } from "node:fs/promises";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const createAuth = (credentials: Record<string, unknown>) => new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
type SheetsAuth = ReturnType<typeof createAuth>;

let cached: { path: string; auth: SheetsAuth } | null = null;

/** Loads a service-account key file, validates it and returns a cached GoogleAuth. Never logs key material. */
export async function loadGoogleAuth(credentialsPath: string): Promise<SheetsAuth> {
    if (cached && cached.path === credentialsPath) return cached.auth;

    let credentials: unknown;
    try {
        credentials = JSON.parse(await readFile(credentialsPath, "utf-8"));
    } catch (cause) {
        throw new Error(`Failed to read Google credentials from ${credentialsPath}`, { cause });
    }

    const record = credentials as Record<string, unknown> | null;
    if (!record || typeof record !== "object" || typeof record.client_email !== "string" || typeof record.private_key !== "string") {
        throw new Error("Google credentials must contain client_email and private_key");
    }

    const auth = createAuth(record);
    cached = { path: credentialsPath, auth };
    return auth;
}
