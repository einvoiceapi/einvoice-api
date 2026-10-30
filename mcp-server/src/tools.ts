import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import { ApiClient, ApiError, GENERATE_FORMATS, isPdfFormat } from "./client.ts";
import type { Config } from "./config.ts";
import { InputError, resolveDocument } from "./input.ts";
import type { Document } from "./input.ts";

const documentShape = {
  path: z.string().optional().describe("Local path of the invoice file (XML, or PDF with embedded XML)."),
  xml: z.string().optional().describe("The invoice XML as text (CII or UBL)."),
  base64: z.string().optional().describe("The invoice file (XML or PDF), base64-encoded."),
  rulesets: z
    .array(z.string().regex(/^[a-z0-9-]+@.+$/))
    .optional()
    .describe('Pin rule-set versions instead of the defaults, e.g. ["xrechnung@3.0.2"]. See the API\'s GET /v1/formats.'),
};

const generateShape = {
  format: z.enum(GENERATE_FORMATS).describe(
    "xrechnung-cii / xrechnung-ubl: XRechnung XML. zugferd-en16931: ZUGFeRD 2.x / Factur-X PDF/A-3 (EN 16931 " +
      "profile; for France set context.businessProcessType to the billing framework, e.g. S1). facturx-basic: " +
      "Factur-X PDF/A-3 (BASIC profile). en16931-cii / en16931-ubl: plain EN 16931 XML (e.g. France, with BT-23). " +
      "cius-ro-ubl: Romanian CIUS-RO UBL XML. hr-cius-ubl: Croatian eRačun (HR-CIUS) UBL XML; needs issueTime, " +
      "seller.operator (name and OIB) and context.businessProcessType P1-P12. peppol-bis: Peppol BIS Billing 3.0 UBL " +
      "XML (also for Slovakia, with 0245 DIČ addresses). ksef-fa3: Polish KSeF " +
      "FA(3) XML (VAT invoices of a Polish seller). fatturapa-fpr12 / fatturapa-fpa12: Italian FatturaPA XML for " +
      "businesses / the public sector, unsigned (FPA12 must be signed before sending).",
  ),
  invoice: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("The invoice as normalized EN 16931 JSON: the same shape parse_invoice returns in `invoice`."),
  invoicePath: z.string().optional().describe("Local path of a JSON file with the normalized invoice (instead of `invoice`)."),
  pdfPath: z
    .string()
    .optional()
    .describe("PDF formats only: your own PDF/A-1, -2 or -3 as the visual part. Without it a neutral layout is rendered."),
  pdfBase64: z.string().optional().describe("PDF formats only: your own PDF/A, base64-encoded (instead of pdfPath)."),
  outputPath: z
    .string()
    .optional()
    .describe("Where to write the generated file. PDFs are always written to a file; XML is also returned as text."),
  overwrite: z.boolean().optional().describe("Replace outputPath if it exists (default false)."),
};

/** Registers validate_invoice, parse_invoice and generate_invoice. */
export function registerTools(server: McpServer, client: ApiClient, config: Config): void {
  server.registerTool(
    "validate_invoice",
    {
      title: "Validate e-invoice",
      description:
        "Validate an XRechnung / EN 16931 invoice (CII or UBL XML), a Peppol BIS, CIUS-RO, Croatian eRačun (HR-CIUS), " +
        "Polish KSeF FA(3) or Italian FatturaPA invoice, or a ZUGFeRD / Factur-X PDF against the official rules (KoSIT " +
        "XRechnung, EN 16931 Schematron, FeRD, the French rules BR-FR for sellers in France, OpenPeppol, CIUS-RO, the " +
        "Croatian HR-CIUS rules, the FA(3) and FatturaPA " +
        "XML schemas plus the offline SDI controls, PDF/A-3 via veraPDF). The format is detected from the " +
        "content. Returns `valid`, the detected format and profile, and every finding with rule id, severity, " +
        "message and XPath.",
      inputSchema: {
        ...documentShape,
        preview: z
          .boolean()
          .optional()
          .describe(
            "Validate against the upcoming rule sets (published but not yet mandatory) instead of the rules in force, " +
              "to check early whether invoices will still pass. Paid plans only.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const document = await resolveDocument(args, "invoice");
        const report = (await (args.preview
          ? client.validatePreview(document, args.rulesets)
          : client.validate(document, args.rulesets))) as { valid?: boolean; summary?: unknown };
        const label = args.preview ? "upcoming rules: " : "";
        return json(`${label}valid: ${report.valid}, summary: ${JSON.stringify(report.summary)}`, report);
      }),
  );

  server.registerTool(
    "parse_invoice",
    {
      title: "Parse e-invoice to JSON",
      description:
        "Read an XRechnung / EN 16931 XML or a ZUGFeRD / Factur-X PDF into normalized EN 16931 JSON (fields " +
        "annotated with their BT numbers), validate it, and recompute the totals. Returns `invoice` (normalized JSON) " +
        "plus `valid`, `findings` and `calculation` (declared vs computed totals). The `invoice` object can be edited " +
        "and passed to generate_invoice.",
      inputSchema: documentShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const document = await resolveDocument(args, "invoice");
        const result = (await client.parse(document, args.rulesets)) as { valid?: boolean; summary?: unknown };
        return json(`parsed; valid: ${result.valid}, summary: ${JSON.stringify(result.summary)}`, result);
      }),
  );

  server.registerTool(
    "generate_invoice",
    {
      title: "Generate e-invoice",
      description:
        "Generate an e-invoice (XRechnung, plain EN 16931, CIUS-RO, Peppol BIS, KSeF FA(3) or FatturaPA XML, or a " +
        "ZUGFeRD / Factur-X PDF/A-3) from normalized EN 16931 JSON. " +
        "Every document is validated by the API before it is returned; if it is not valid you get the findings " +
        "instead. PDFs are written to a file and the path is returned. The specification identifier (BT-24) is set " +
        "from `format`: when converting a parsed invoice to another format, remove `context.specificationIdentifier`.",
      inputSchema: generateShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const invoice = await resolveInvoice(args.invoice, args.invoicePath);
        const isPdf = isPdfFormat(args.format);
        let pdf: Document | undefined;
        if (args.pdfPath || args.pdfBase64) {
          if (!isPdf) {
            throw new InputError(`pdfPath / pdfBase64 only apply to PDF formats, not ${args.format}.`);
          }
          pdf = await resolveDocument({ path: args.pdfPath, base64: args.pdfBase64 }, "PDF");
          if (pdf.contentType !== "application/pdf") {
            throw new InputError("The supplied visual PDF does not start with %PDF-.");
          }
        }
        const generated = await client.generate(invoice, args.format, pdf);
        const meta = {
          format: args.format,
          contentType: generated.contentType,
          bytes: generated.bytes.length,
          validationWarnings: generated.validationWarnings,
          rulesets: generated.rulesets,
          requestId: generated.requestId,
        };
        let file: string | undefined;
        if (isPdf || args.outputPath) {
          file = args.outputPath ? resolve(args.outputPath) : join(config.outputDir, generated.fileName);
          await write(file, generated.bytes, args.overwrite ?? false);
        }
        if (isPdf) {
          return json(`Wrote ${file}`, { ...meta, file });
        }
        const xml = new TextDecoder().decode(generated.bytes);
        return {
          content: [
            { type: "text", text: JSON.stringify(file ? { ...meta, file } : meta, null, 2) },
            { type: "text", text: xml },
          ],
        };
      }),
  );
}

async function resolveInvoice(invoice: Record<string, unknown> | undefined, path: string | undefined): Promise<unknown> {
  if ((invoice === undefined) === (path === undefined || path === "")) {
    throw new InputError('Give the invoice as exactly one of "invoice" (JSON object) or "invoicePath".');
  }
  if (invoice !== undefined) {
    return invoice;
  }
  let text: string;
  try {
    text = await readFile(path as string, "utf8");
  } catch (e) {
    throw new InputError(`Cannot read invoice file "${path}": ${(e as NodeJS.ErrnoException).code ?? e}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new InputError(`"${path}" is not valid JSON: ${(e as Error).message}`);
  }
}

async function write(file: string, bytes: Uint8Array, overwrite: boolean): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(file, bytes, { flag: overwrite ? "w" : "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new InputError(`${file} already exists. Choose another outputPath or set overwrite: true.`);
    }
    throw e;
  }
}

function json(headline: string, value: unknown): CallToolResult {
  return { content: [{ type: "text", text: `${headline}\n${JSON.stringify(value, null, 2)}` }] };
}

/** Turns input and API errors into tool errors the model can act on; anything else is a bug and propagates. */
async function run(body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof ApiError) {
      return { isError: true, content: [{ type: "text", text: `${e.message}\n${JSON.stringify(e.problem, null, 2)}` }] };
    }
    if (e instanceof InputError) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
    throw e;
  }
}
