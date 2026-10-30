#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.ts";
import { createServer } from "./server.ts";

// stdout carries the MCP protocol; diagnostics go to stderr and never include invoice content.
try {
  const server = createServer(loadConfig());
  await server.connect(new StdioServerTransport());
} catch (e) {
  process.stderr.write(`einvoice-api-mcp: ${e instanceof ConfigError ? e.message : (e as Error).stack}\n`);
  process.exit(1);
}
