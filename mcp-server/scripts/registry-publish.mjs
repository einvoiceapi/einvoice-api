// Lists the server in the official MCP registry (https://registry.modelcontextprotocol.io) as eu.einvoice-api/mcp.
// Usage: node scripts/registry-publish.mjs <key.pem> <auth|publish> [server.json]
// HTTP domain auth: signs the current timestamp with the Ed25519 key whose public half is served at
// https://einvoice-api.eu/.well-known/mcp-registry-auth, then (publish) posts server.json. The npm package named in
// server.json must already be published, with "mcpName": "eu.einvoice-api/mcp" in its package.json.
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const [keyPath, mode, serverJson] = process.argv.slice(2);
const REGISTRY = "https://registry.modelcontextprotocol.io";
const key = createPrivateKey(readFileSync(keyPath));
const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const signed = sign(null, Buffer.from(timestamp), key).toString("hex");

const auth = await fetch(`${REGISTRY}/v0/auth/http`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ domain: "einvoice-api.eu", timestamp, signed_timestamp: signed }),
});
const authBody = await auth.json();
if (!auth.ok) { console.error("auth", auth.status, JSON.stringify(authBody)); process.exit(1); }
console.log("auth ok, token expires", authBody.expires_at ?? "(n/a)");

if (mode === "publish") {
  const res = await fetch(`${REGISTRY}/v0/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authBody.registry_token}` },
    body: readFileSync(serverJson, "utf8"),
  });
  console.log("publish", res.status, (await res.text()).slice(0, 1500));
  if (!res.ok) process.exit(1);
}
