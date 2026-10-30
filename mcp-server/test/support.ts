import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.ts";
import { createServer } from "../src/server.ts";

/** Stand-ins for invoice files: the API is mocked, so only their type and bytes matter. */
const FIXTURES: Record<string, string> = {
  "zugferd-en16931.pdf": "%PDF-1.7\n% test fixture\n",
  "facturx-basic.pdf": "%PDF-1.7\n% test fixture\n",
  "xrechnung-ubl.xml": '<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>RE-2026-0042</ID></Invoice>',
  "xrechnung-cii.xml": '<?xml version="1.0" encoding="UTF-8"?><CrossIndustryInvoice/>',
  "invoice.json": JSON.stringify({ number: "RE-2026-0042" }),
};

export const SAMPLES = await mkdtemp(join(tmpdir(), "einvoice-mcp-samples-"));
await Promise.all(Object.entries(FIXTURES).map(([name, body]) => writeFile(join(SAMPLES, name), body)));

export interface Recorded {
  url: URL;
  method: string;
  headers: Headers;
  body: RequestInit["body"];
}

/** A fetch stand-in that records each request and answers with the next queued response. */
export function mockFetch(...responses: Array<Response | Error>) {
  const requests: Recorded[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({
      url: new URL(input instanceof Request ? input.url : input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch: impl as typeof fetch, requests };
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    baseUrl: new URL("https://api.test.example/"),
    apiKey: "test-key",
    authMode: "bearer",
    timeoutMs: 5_000,
    outputDir: join(tmpdir(), "einvoice-mcp-test"),
    ...overrides,
  };
}

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "einvoice-mcp-"));
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const type = status >= 400 ? "application/problem+json" : "application/json";
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": type, ...headers } });
}

/** Connects an MCP client to a server built with the given config and fetch, in memory. */
export async function connect(config: Config, fetchImpl: typeof fetch): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(config, fetchImpl);
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

export function textOf(result: unknown): string {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  return content.map((c) => c.text ?? "").join("\n");
}
