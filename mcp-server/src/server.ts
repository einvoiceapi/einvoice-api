import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient } from "./client.ts";
import type { Config } from "./config.ts";
import { registerTools } from "./tools.ts";

export const VERSION = "1.0.0";

export function createServer(config: Config, fetchImpl: typeof fetch = fetch): McpServer {
  const server = new McpServer(
    { name: "einvoice-api", version: VERSION },
    {
      instructions:
        "Tools for EU e-invoices (XRechnung, EN 16931, ZUGFeRD / Factur-X). Use validate_invoice to check a file, " +
        "parse_invoice to read it as JSON, and generate_invoice to produce XRechnung XML or a ZUGFeRD / Factur-X " +
        "PDF from that JSON. Documents are processed in memory by the API and not stored.",
    },
  );
  registerTools(server, new ApiClient(config, fetchImpl), config);
  return server;
}
