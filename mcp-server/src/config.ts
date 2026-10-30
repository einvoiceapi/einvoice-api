import { tmpdir } from "node:os";
import { join } from "node:path";

/** How the API key is sent: Zuplo expects a bearer token, RapidAPI its own two headers. */
export type AuthMode = "bearer" | "rapidapi";

export interface Config {
  baseUrl: URL;
  apiKey: string;
  authMode: AuthMode;
  /** X-RapidAPI-Host value (rapidapi mode only). */
  rapidapiHost?: string;
  timeoutMs: number;
  /** Where generated documents are written when the caller gives no outputPath. */
  outputDir: string;
}

export class ConfigError extends Error {}

/** Reads the configuration from environment variables. Throws ConfigError with a message naming the variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawBase = env.EINVOICE_API_BASE_URL?.trim();
  if (!rawBase) {
    throw new ConfigError("EINVOICE_API_BASE_URL is not set (for example https://api.einvoice-api.eu).");
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBase.endsWith("/") ? rawBase : rawBase + "/");
  } catch {
    throw new ConfigError(`EINVOICE_API_BASE_URL is not a valid URL: ${rawBase}`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !(local && baseUrl.protocol === "http:")) {
    throw new ConfigError("EINVOICE_API_BASE_URL must use https (http is allowed for localhost only).");
  }

  const apiKey = env.EINVOICE_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError("EINVOICE_API_KEY is not set.");
  }

  const mode = (env.EINVOICE_API_AUTH?.trim() || "bearer").toLowerCase();
  if (mode !== "bearer" && mode !== "rapidapi") {
    throw new ConfigError(`EINVOICE_API_AUTH must be "bearer" (Zuplo) or "rapidapi", not "${mode}".`);
  }

  const timeoutRaw = env.EINVOICE_API_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ConfigError(`EINVOICE_API_TIMEOUT_MS must be a positive integer, not "${timeoutRaw}".`);
  }

  const config: Config = {
    baseUrl,
    apiKey,
    authMode: mode,
    timeoutMs,
    outputDir: env.EINVOICE_MCP_OUTPUT_DIR?.trim() || join(tmpdir(), "einvoice-mcp"),
  };
  if (mode === "rapidapi") {
    config.rapidapiHost = env.EINVOICE_RAPIDAPI_HOST?.trim() || baseUrl.host;
  }
  return config;
}
