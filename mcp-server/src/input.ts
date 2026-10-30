import { readFile } from "node:fs/promises";

export interface DocumentInput {
  /** Local file path of an XML or PDF invoice. */
  path?: string | undefined;
  /** Invoice XML as text. */
  xml?: string | undefined;
  /** Invoice XML or PDF, base64-encoded. */
  base64?: string | undefined;
}

export interface Document {
  bytes: Uint8Array;
  contentType: "application/pdf" | "application/xml" | "application/octet-stream";
}

export class InputError extends Error {}

/** Resolves exactly one of path, xml or base64 into bytes and a content type for the REST API. */
export async function resolveDocument(input: DocumentInput, what = "document"): Promise<Document> {
  const given = (["path", "xml", "base64"] as const).filter((k) => input[k] !== undefined && input[k] !== "");
  if (given.length !== 1) {
    throw new InputError(`Give the ${what} as exactly one of "path", "xml" or "base64" (got ${given.length}).`);
  }
  let bytes: Uint8Array;
  if (input.path !== undefined && input.path !== "") {
    try {
      bytes = await readFile(input.path);
    } catch (e) {
      throw new InputError(`Cannot read ${what} file "${input.path}": ${(e as NodeJS.ErrnoException).code ?? e}`);
    }
  } else if (input.xml !== undefined && input.xml !== "") {
    bytes = new TextEncoder().encode(input.xml);
  } else {
    bytes = decodeBase64(input.base64 ?? "", what);
  }
  if (bytes.length === 0) {
    throw new InputError(`The ${what} is empty.`);
  }
  return { bytes, contentType: sniff(bytes) };
}

export function decodeBase64(value: string, what: string): Uint8Array {
  const compact = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new InputError(`The ${what} is not valid base64.`);
  }
  return Buffer.from(compact, "base64");
}

/** PDF by magic number, XML if the first non-blank character (after a BOM) is "<", otherwise let the API decide. */
export function sniff(bytes: Uint8Array): Document["contentType"] {
  const head = Buffer.from(bytes.subarray(0, 1024));
  if (head.indexOf("%PDF-") === 0) {
    return "application/pdf";
  }
  let i = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 3 : 0;
  while (i < head.length && (head[i] === 0x20 || head[i] === 0x09 || head[i] === 0x0a || head[i] === 0x0d)) {
    i++;
  }
  return head[i] === 0x3c ? "application/xml" : "application/octet-stream";
}
