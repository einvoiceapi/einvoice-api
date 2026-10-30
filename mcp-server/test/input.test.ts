import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { InputError, resolveDocument, sniff } from "../src/input.ts";
import { SAMPLES } from "./support.ts";

const enc = (s: string) => new TextEncoder().encode(s);

test("sniffs PDF, XML (with BOM and leading blanks) and unknown content", () => {
  assert.equal(sniff(enc("%PDF-1.7\n")), "application/pdf");
  assert.equal(sniff(enc("<?xml version='1.0'?><a/>")), "application/xml");
  assert.equal(sniff(Uint8Array.of(0xef, 0xbb, 0xbf, 0x0a, 0x20, 0x3c)), "application/xml");
  assert.equal(sniff(enc("{\"json\":true}")), "application/octet-stream");
});

test("reads a sample PDF and XML from disk", async () => {
  assert.equal((await resolveDocument({ path: join(SAMPLES, "zugferd-en16931.pdf") })).contentType, "application/pdf");
  assert.equal((await resolveDocument({ path: join(SAMPLES, "xrechnung-ubl.xml") })).contentType, "application/xml");
});

test("accepts XML text and base64", async () => {
  const fromText = await resolveDocument({ xml: "<Invoice/>" });
  assert.deepEqual(Buffer.from(fromText.bytes).toString(), "<Invoice/>");
  const fromB64 = await resolveDocument({ base64: Buffer.from("%PDF-1.7").toString("base64") });
  assert.equal(fromB64.contentType, "application/pdf");
});

test("requires exactly one source and rejects bad input", async () => {
  await assert.rejects(resolveDocument({}), /exactly one/);
  await assert.rejects(resolveDocument({ xml: "<a/>", base64: "PGEvPg==" }), /got 2/);
  await assert.rejects(resolveDocument({ base64: "not base64!" }), /not valid base64/);
  await assert.rejects(resolveDocument({ path: join(SAMPLES, "missing.xml") }), /ENOENT/);
  await assert.rejects(resolveDocument({ base64: "====" }), InputError);
});
