import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { SAMPLES, connect, jsonResponse, mockFetch, tempDir, testConfig, textOf } from "./support.ts";

test("lists the three tools with their schemas", async () => {
  const client = await connect(testConfig(), mockFetch().fetch);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["generate_invoice", "parse_invoice", "validate_invoice"]);
  const generate = tools.find((t) => t.name === "generate_invoice")!;
  assert.deepEqual((generate.inputSchema.properties as Record<string, { enum?: string[] }>).format?.enum,
    ["xrechnung-cii", "xrechnung-ubl", "zugferd-en16931", "facturx-basic", "en16931-cii", "en16931-ubl", "cius-ro-ubl",
      "hr-cius-ubl", "peppol-bis", "ksef-fa3", "fatturapa-fpr12", "fatturapa-fpa12"]);
  assert.equal(tools.find((t) => t.name === "validate_invoice")!.annotations?.readOnlyHint, true);
});

test("validate_invoice sends the file from path and returns the report", async () => {
  const report = { requestId: "r", valid: true, summary: { fatal: 0, error: 0, warning: 0, info: 0 }, findings: [] };
  const m = mockFetch(jsonResponse(200, report));
  const client = await connect(testConfig(), m.fetch);
  const result = await client.callTool({ name: "validate_invoice", arguments: { path: join(SAMPLES, "zugferd-en16931.pdf") } });
  assert.equal(result.isError, undefined);
  assert.match(textOf(result), /^valid: true/);
  assert.equal(m.requests[0]!.headers.get("content-type"), "application/pdf");
  const sent = Buffer.from(m.requests[0]!.body as Uint8Array);
  assert.deepEqual(sent, await readFile(join(SAMPLES, "zugferd-en16931.pdf")));
});

test("validate_invoice with preview calls the preview endpoint; a 403 from the gateway is a tool error", async () => {
  const report = { valid: false, summary: { fatal: 0, error: 1, warning: 0, info: 0 }, findings: [] };
  const forbidden = { title: "Not included in your plan", status: 403, detail: "/v1/preview/validate is not included" };
  const m = mockFetch(jsonResponse(200, report), jsonResponse(403, forbidden));
  const client = await connect(testConfig(), m.fetch);
  const args = { xml: "<Invoice/>", preview: true };

  const ok = await client.callTool({ name: "validate_invoice", arguments: args });
  assert.match(textOf(ok), /^upcoming rules: valid: false/);
  assert.equal(m.requests[0]!.url.pathname, "/v1/preview/validate");

  const denied = await client.callTool({ name: "validate_invoice", arguments: args });
  assert.equal(denied.isError, true);
  assert.match(textOf(denied), /403 Not included in your plan/);
});

test("parse_invoice accepts XML text and ruleset pins", async () => {
  const m = mockFetch(jsonResponse(200, { valid: false, summary: { fatal: 1 }, invoice: {} }));
  const client = await connect(testConfig(), m.fetch);
  const xml = await readFile(join(SAMPLES, "xrechnung-cii.xml"), "utf8");
  const result = await client.callTool({ name: "parse_invoice", arguments: { xml, rulesets: ["xrechnung@3.0.2"] } });
  assert.match(textOf(result), /^parsed; valid: false/);
  assert.equal(m.requests[0]!.url.pathname, "/v1/parse");
  assert.equal(m.requests[0]!.url.searchParams.get("ruleset"), "xrechnung@3.0.2");
});

test("input errors are tool errors and make no request", async () => {
  const m = mockFetch();
  const client = await connect(testConfig(), m.fetch);
  const result = await client.callTool({ name: "validate_invoice", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /exactly one of "path", "xml" or "base64"/);
  assert.equal(m.requests.length, 0);
});

test("API problems are returned as tool errors with the problem members", async () => {
  const problem = { title: "Generated invoice is not valid", status: 422, detail: "d", findings: [{ ruleId: "BR-DE-15" }] };
  const m = mockFetch(jsonResponse(422, problem));
  const client = await connect(testConfig(), m.fetch);
  const invoice = JSON.parse(await readFile(join(SAMPLES, "invoice.json"), "utf8"));
  const result = await client.callTool({ name: "generate_invoice", arguments: { format: "xrechnung-ubl", invoice } });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /422 Generated invoice is not valid: d/);
  assert.match(textOf(result), /BR-DE-15/);
});

test("generate_invoice returns XML as text and writes PDFs to a file", async () => {
  const dir = await tempDir();
  const xml = await readFile(join(SAMPLES, "xrechnung-ubl.xml"));
  const pdf = await readFile(join(SAMPLES, "zugferd-en16931.pdf"));
  const m = mockFetch(
    new Response(xml, { headers: { "Content-Type": "application/xml", "Content-Disposition": 'attachment; filename="a.xml"' } }),
    new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="RE.pdf"' } }),
  );
  const client = await connect(testConfig({ outputDir: dir }), m.fetch);
  const invoicePath = join(SAMPLES, "invoice.json");

  const xmlResult = await client.callTool({ name: "generate_invoice", arguments: { format: "xrechnung-ubl", invoicePath } });
  assert.equal(xmlResult.isError, undefined);
  assert.match(textOf(xmlResult), /RE-2026-0042/);
  assert.equal(m.requests[0]!.body, JSON.stringify(JSON.parse(await readFile(invoicePath, "utf8"))));

  const pdfResult = await client.callTool({ name: "generate_invoice", arguments: { format: "zugferd-en16931", invoicePath } });
  assert.match(textOf(pdfResult), new RegExp(`Wrote ${join(dir, "RE.pdf").replace(/\\/g, "\\\\")}`));
  assert.deepEqual(await readFile(join(dir, "RE.pdf")), pdf);
});

test("generate_invoice does not overwrite unless asked", async () => {
  const dir = await tempDir();
  const target = join(dir, "out.pdf");
  await writeFile(target, "existing");
  const pdfResponse = () => new Response("%PDF-1.7 new", { headers: { "Content-Type": "application/pdf" } });
  const m = mockFetch(pdfResponse(), pdfResponse());
  const client = await connect(testConfig({ outputDir: dir }), m.fetch);
  const args = { format: "facturx-basic", invoice: { number: "1" }, outputPath: target };

  const refused = await client.callTool({ name: "generate_invoice", arguments: args });
  assert.equal(refused.isError, true);
  assert.match(textOf(refused), /already exists/);
  assert.equal(await readFile(target, "utf8"), "existing");

  const replaced = await client.callTool({ name: "generate_invoice", arguments: { ...args, overwrite: true } });
  assert.equal(replaced.isError, undefined);
  assert.equal(await readFile(target, "utf8"), "%PDF-1.7 new");
});

test("generate_invoice embeds into a supplied PDF and rejects it for XML formats", async () => {
  const dir = await tempDir();
  const m = mockFetch(new Response("%PDF-1.7 out", { headers: { "Content-Type": "application/pdf" } }));
  const client = await connect(testConfig({ outputDir: dir }), m.fetch);
  const pdfPath = join(SAMPLES, "facturx-basic.pdf");

  const xmlFormat = await client.callTool({ name: "generate_invoice", arguments: { format: "xrechnung-cii", invoice: {}, pdfPath } });
  const peppol = await client.callTool({ name: "generate_invoice", arguments: { format: "peppol-bis", invoice: {}, pdfPath } });
  assert.match(textOf(peppol), /only apply to PDF formats/);
  assert.equal(xmlFormat.isError, true);
  assert.match(textOf(xmlFormat), /only apply to PDF formats/);

  const ok = await client.callTool({ name: "generate_invoice", arguments: { format: "facturx-basic", invoice: {}, pdfPath } });
  assert.equal(ok.isError, undefined);
  assert.ok(m.requests[0]!.body instanceof FormData);
  assert.equal(m.requests.length, 1);
});

test("generate_invoice needs exactly one of invoice or invoicePath", async () => {
  const client = await connect(testConfig(), mockFetch().fetch);
  const none = await client.callTool({ name: "generate_invoice", arguments: { format: "xrechnung-cii" } });
  assert.equal(none.isError, true);
  assert.match(textOf(none), /exactly one of "invoice"/);
});
