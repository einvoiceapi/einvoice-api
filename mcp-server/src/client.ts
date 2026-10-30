import type { Config } from "./config.ts";
import type { Document } from "./input.ts";

export const GENERATE_FORMATS = [
  "xrechnung-cii",
  "xrechnung-ubl",
  "zugferd-en16931",
  "facturx-basic",
  "en16931-cii",
  "en16931-ubl",
  "cius-ro-ubl",
  "hr-cius-ubl",
  "peppol-bis",
  "ksef-fa3",
  "fatturapa-fpr12",
  "fatturapa-fpa12",
] as const;
export type GenerateFormat = (typeof GENERATE_FORMATS)[number];

/** Formats that produce a ZUGFeRD / Factur-X PDF; every other format produces XML. */
export const PDF_FORMATS: readonly GenerateFormat[] = ["zugferd-en16931", "facturx-basic"];

export function isPdfFormat(format: GenerateFormat): boolean {
  return PDF_FORMATS.includes(format);
}

/** RFC 9457 problem returned by the API (non-2xx). */
export interface Problem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  requestId?: string;
  [member: string]: unknown;
}

type RequestBody = NonNullable<RequestInit["body"]>;

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(`${problem.status} ${problem.title ?? "Error"}${problem.detail ? ": " + problem.detail : ""}`);
    this.problem = problem;
  }
}

export interface GeneratedDocument {
  bytes: Uint8Array;
  contentType: string;
  /** Suggested file name from Content-Disposition, sanitized to a plain base name. */
  fileName: string;
  validationWarnings: number;
  rulesets?: string;
  requestId?: string;
}

/** Thin client for the REST API. Holds no state besides the configuration; nothing is cached or logged. */
export class ApiClient {
  readonly #config: Config;
  readonly #fetch: typeof fetch;

  constructor(config: Config, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  validate(document: Document, rulesets: string[] = []): Promise<unknown> {
    return this.#json("v1/validate", rulesets, document);
  }

  /** Validation against the upcoming rule sets (paid plans; the gateway answers 403 on the Free plan). */
  validatePreview(document: Document, rulesets: string[] = []): Promise<unknown> {
    return this.#json("v1/preview/validate", rulesets, document);
  }

  parse(document: Document, rulesets: string[] = []): Promise<unknown> {
    return this.#json("v1/parse", rulesets, document);
  }

  async generate(invoice: unknown, format: GenerateFormat, pdf?: Document): Promise<GeneratedDocument> {
    const url = new URL("v1/generate", this.#config.baseUrl);
    url.searchParams.set("format", format);
    const json = JSON.stringify(invoice);
    let body: RequestBody;
    const headers: Record<string, string> = { Accept: "application/xml, application/pdf, application/problem+json" };
    if (pdf) {
      const form = new FormData();
      form.append("invoice", new Blob([json], { type: "application/json" }), "invoice.json");
      form.append("pdf", new Blob([pdf.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), "visual.pdf");
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = json;
    }
    const response = await this.#send(url, headers, body);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const result: GeneratedDocument = {
      bytes,
      contentType: response.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream",
      fileName: fileNameFrom(response.headers.get("content-disposition"), format),
      validationWarnings: Number(response.headers.get("x-validation-warnings") ?? 0) || 0,
    };
    const rulesets = response.headers.get("x-rulesets");
    const requestId = response.headers.get("x-request-id");
    if (rulesets) result.rulesets = rulesets;
    if (requestId) result.requestId = requestId;
    return result;
  }

  async #json(path: string, rulesets: string[], document: Document): Promise<unknown> {
    const url = new URL(path, this.#config.baseUrl);
    for (const r of rulesets) {
      url.searchParams.append("ruleset", r);
    }
    const headers = { "Content-Type": document.contentType, Accept: "application/json, application/problem+json" };
    const response = await this.#send(url, headers, document.bytes as Uint8Array<ArrayBuffer>);
    return response.json();
  }

  async #send(url: URL, headers: Record<string, string>, body: RequestBody): Promise<Response> {
    const auth: Record<string, string> =
      this.#config.authMode === "rapidapi"
        ? { "X-RapidAPI-Key": this.#config.apiKey, "X-RapidAPI-Host": this.#config.rapidapiHost ?? "" }
        : { Authorization: `Bearer ${this.#config.apiKey}` };
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: { ...headers, ...auth, "User-Agent": "einvoice-api-mcp/1.0.0" },
        body,
        signal: AbortSignal.timeout(this.#config.timeoutMs),
      });
    } catch (e) {
      const reason = (e as Error).name === "TimeoutError" ? `no response within ${this.#config.timeoutMs} ms` : String(e);
      throw new ApiError({ status: 0, title: "API not reachable", detail: `${url.origin}: ${reason}` });
    }
    if (!response.ok) {
      throw new ApiError(await problemFrom(response));
    }
    return response;
  }
}

async function problemFrom(response: Response): Promise<Problem> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as Partial<Problem>;
    if (parsed && typeof parsed === "object") {
      return { ...parsed, status: response.status, ...(requestId && !parsed.requestId ? { requestId } : {}) };
    }
  } catch {
    // Not JSON: the gateway or a proxy answered. Its body is not echoed, it may be long HTML.
  }
  const problem: Problem = { status: response.status, title: response.statusText || "HTTP error" };
  if (requestId) problem.requestId = requestId;
  return problem;
}

/** Takes the file name from Content-Disposition, keeping only safe characters, so it cannot point elsewhere. */
export function fileNameFrom(disposition: string | null, format: GenerateFormat): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  let name = match?.[1] ? decodeURIComponentSafe(match[1]) : "";
  name = name.replace(/^.*[\\/]/, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!name) {
    name = `invoice-${format}${isPdfFormat(format) ? ".pdf" : ".xml"}`;
  }
  return name.slice(0, 120);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
