// Validate an e-invoice with the EU E-Invoice API (Node.js 22.18+, no dependencies).
//   EINVOICE_API_KEY=... node validate.ts invoice.pdf
import { readFile } from "node:fs/promises";

const BASE = process.env.EINVOICE_API_BASE_URL ?? "https://einvoice-api-main-f5141d8.zuplo.app";

interface Finding {
  severity: "fatal" | "error" | "warning" | "info";
  ruleId: string;
  message: string;
  xpath?: string;
  source?: string;
  docUrl?: string; // public page of the rule, for Schematron findings
}

interface ValidationResponse {
  requestId: string;
  valid: boolean;
  format?: string;
  profile?: string;
  findings: Finding[];
}

const path = process.argv[2];
const response = await fetch(`${BASE}/v1/validate`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.EINVOICE_API_KEY}`,
    "Content-Type": "application/octet-stream", // raw body; the format is detected from the content
  },
  body: await readFile(path),
});
if (!response.ok) {
  // RFC 9457 problem+json: "detail" says what to fix
  const problem = (await response.json()) as { title?: string; detail?: string };
  throw new Error(`HTTP ${response.status}: ${problem.detail ?? problem.title}`);
}
const result = (await response.json()) as ValidationResponse;
console.log(`valid: ${result.valid}  format: ${result.format}  profile: ${result.profile}`);
for (const f of result.findings) {
  console.log(`${f.severity.padEnd(7)} ${f.ruleId}: ${f.message}${f.docUrl ? `\n        ${f.docUrl}` : ""}`);
}
process.exitCode = result.valid ? 0 : 1;
