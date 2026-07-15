import fs from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

let cachedUsession: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 23 * 60 * 60 * 1000; // refresh before 24h expiry

export function socialdataBaseUrl(): string {
  return (process.env.SOCIALDATA_BASE_URL || "https://socialdata.garena.vn").replace(/\/$/, "");
}

function credentialsPath(): string {
  const raw = process.env.SOCIALDATA_GOOGLE_CREDENTIALS?.trim();
  if (!raw) {
    throw new Error("SOCIALDATA_GOOGLE_CREDENTIALS is not set");
  }
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function parseUsessionFromSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const parts = setCookie.split(/,(?=\s*[^;]+=)/);
  for (const part of parts) {
    const m = part.trim().match(/^usession=([^;]+)/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

async function exchangeGoogleAccessToken(accessToken: string): Promise<string> {
  const url = `${socialdataBaseUrl()}/connect/google/callback?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: "GET", redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  const usession = parseUsessionFromSetCookie(setCookie);
  if (!usession) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Socialdata token exchange failed (HTTP ${res.status}). No usession cookie. Body: ${body.slice(0, 300)}`,
    );
  }
  return usession;
}

async function mintGoogleAccessToken(): Promise<string> {
  const keyFile = credentialsPath();
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Socialdata Google credentials not found: ${keyFile}`);
  }
  const auth = new GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/userinfo.email", "openid"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Failed to obtain Google access token from service account");
  }
  return token.token;
}

/** Resolve a valid `usession` cookie (manual override, cache, or SA exchange). */
export async function getUsession(forceRefresh = false): Promise<string> {
  const manual = process.env.SOCIALDATA_USESSION?.trim();
  if (manual) return manual;

  const now = Date.now();
  if (!forceRefresh && cachedUsession && now - cachedAt < CACHE_TTL_MS) {
    return cachedUsession;
  }

  const accessToken = await mintGoogleAccessToken();
  const usession = await exchangeGoogleAccessToken(accessToken);
  cachedUsession = usession;
  cachedAt = now;
  return usession;
}

export function clearUsessionCache(): void {
  cachedUsession = null;
  cachedAt = 0;
}
