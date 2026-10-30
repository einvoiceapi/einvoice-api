import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError, fileNameFrom } from "../src/client.ts";
import type { Document } from "../src/input.ts";
import { jsonResponse, mockFetch, testConfig } from "./support.ts";

const xml: Document = { bytes: new TextEncoder().encode("<Invoice/>"), contentType: "application/xml" };

test("validate posts the raw document with a bearer key and repeated ruleset parameters", async () => {
  const m = mockFetch(jsonResponse(200, { valid: true }));
  const result = await new ApiClient(testConfig(), m.fetch).validate(xml, ["xrechnung@3.0.2", "zugferd@2.5.2"]);
  assert.deepEqual(result, { valid: true });
  const r = m.requests[0]!;
  assert.equal(r.method, "POST");
  assert.equal(r.url.pathname, "/v1/validate");
  assert.deepEqual(r.url.searchParams.getAll("ruleset"), ["xrechnung@3.0.2", "zugferd@2.5.2"]);
  assert.equal(r.headers.get("authorization"), "Bearer test-key");
  assert.equal(r.headers.get("content-type"), "application/xml");
  assert.equal(r.headers.get("x-rapidapi-key"), null);
});

test("rapidapi mode sends X-RapidAPI-Key and X-RapidAPI-Host instead of Authorization", async () => {
  const m = mockFetch(jsonResponse(200, {}));
  const config = testConfig({ authMode: "rapidapi", rapidapiHost: "e.p.rapidapi.com" });
  await new ApiClient(config, m.fetch).parse(xml);
  const h = m.requests[0]!.headers;
  assert.equal(h.get("x-rapidapi-key"), "test-key");
  assert.equal(h.get("x-rapidapi-host"), "e.p.rapidapi.com");
  assert.equal(h.get("authorization"), null);
  assert.equal(m.requests[0]!.url.pathname, "/v1/parse");
});

test("keeps a gateway base path", async () => {
  const m = mockFetch(jsonResponse(200, {}));
  await new ApiClient(testConfig({ baseUrl: new URL("https://gw.example/einvoice/") }), m.fetch).validate(xml);
  assert.equal(m.requests[0]!.url.href, "https://gw.example/einvoice/v1/validate");
});

test("maps problem+json to ApiError and keeps the request id", async () => {
  const problem = { type: "https://x/problems/unknown-ruleset", title: "Unknown rule set", status: 400, detail: "d" };
  const m = mockFetch(jsonResponse(400, problem, { "X-Request-Id": "req-1" }));
  await assert.rejects(new ApiClient(testConfig(), m.fetch).validate(xml), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.problem.status, 400);
    assert.equal(e.problem.requestId, "req-1");
    assert.match(e.message, /400 Unknown rule set: d/);
    return true;
  });
});

test("a non-JSON error body is not echoed", async () => {
  const m = mockFetch(new Response("<html>secret upstream page</html>", { status: 502, statusText: "Bad Gateway" }));
  await assert.rejects(new ApiClient(testConfig(), m.fetch).validate(xml), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.deepEqual(e.problem, { status: 502, title: "Bad Gateway" });
    return true;
  });
});

test("network failures become status 0 problems", async () => {
  const m = mockFetch(new TypeError("fetch failed"));
  await assert.rejects(new ApiClient(testConfig(), m.fetch).validate(xml), /API not reachable/);
});

test("generate sends JSON, or multipart with invoice and pdf parts", async () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7 generated");
  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": 'attachment; filename="RE-1-zugferd-en16931.pdf"',
    "X-Validation-Warnings": "2",
    "X-Rulesets": "zugferd@2.5.2",
  };
  const m = mockFetch(new Response(pdfBytes, { headers }), new Response(pdfBytes, { headers }));
  const client = new ApiClient(testConfig(), m.fetch);

  const plain = await client.generate({ number: "RE-1" }, "zugferd-en16931");
  assert.equal(m.requests[0]!.url.search, "?format=zugferd-en16931");
  assert.equal(m.requests[0]!.headers.get("content-type"), "application/json");
  assert.equal(m.requests[0]!.body, '{"number":"RE-1"}');
  assert.equal(plain.fileName, "RE-1-zugferd-en16931.pdf");
  assert.equal(plain.validationWarnings, 2);
  assert.equal(plain.rulesets, "zugferd@2.5.2");
  assert.deepEqual(plain.bytes, pdfBytes);

  await client.generate({ number: "RE-1" }, "zugferd-en16931", { bytes: pdfBytes, contentType: "application/pdf" });
  const form = m.requests[1]!.body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(await (form.get("invoice") as Blob).text(), '{"number":"RE-1"}');
  assert.equal((form.get("invoice") as Blob).type, "application/json");
  assert.equal((form.get("pdf") as Blob).type, "application/pdf");
  assert.equal(m.requests[1]!.headers.get("content-type"), null, "fetch sets the multipart boundary itself");
});

test("file names from Content-Disposition cannot escape the output directory", () => {
  assert.equal(fileNameFrom('attachment; filename="../../etc/passwd"', "xrechnung-ubl"), "passwd");
  assert.equal(fileNameFrom('attachment; filename="..\\..\\a b.pdf"', "facturx-basic"), "a_b.pdf");
  assert.equal(fileNameFrom('attachment; filename=".."', "xrechnung-cii"), "invoice-xrechnung-cii.xml");
  assert.equal(fileNameFrom(null, "facturx-basic"), "invoice-facturx-basic.pdf");
  assert.equal(fileNameFrom("attachment; filename*=UTF-8''Rechnung%20%C3%84.xml", "xrechnung-cii"), "Rechnung__.xml");
});
