# EU E-Invoice API: MCP server

A thin [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants and agents validate,
parse and generate EU e-invoices through the EU E-Invoice API. It runs locally over stdio and forwards every call to the
REST API with your API key. It keeps no state and writes nothing except the generated files you ask for.

| Tool | REST call | Input | Output |
|---|---|---|---|
| `validate_invoice` | `POST /v1/validate`, or `POST /v1/preview/validate` with `preview: true` (paid plans) | `path`, `xml` or `base64` (XML or PDF), optional `rulesets`, `preview` | `valid`, format, profile, findings |
| `parse_invoice` | `POST /v1/parse` | same as validate | normalized EN 16931 JSON, findings, recomputed totals |
| `generate_invoice` | `POST /v1/generate` | `format`, `invoice` (JSON) or `invoicePath`, optional `pdfPath` / `pdfBase64`, `outputPath`, `overwrite` | XML as text (and a file if `outputPath` is set); PDFs as a file path |

Validation and parsing detect the format. `generate_invoice` formats: `xrechnung-cii`, `xrechnung-ubl`,
`zugferd-en16931`, `facturx-basic`, `en16931-cii`, `en16931-ubl`, `peppol-bis`, `cius-ro-ubl`, `hr-cius-ubl`, `ksef-fa3`,
`fatturapa-fpr12`, `fatturapa-fpa12`.

You need an API key from the developer portal (free plan available): https://einvoice-api.eu

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `EINVOICE_API_BASE_URL` | yes | API base URL: `https://einvoice-api-main-f5141d8.zuplo.app`. https only (http for localhost). |
| `EINVOICE_API_KEY` | yes | Your API key. |
| `EINVOICE_API_AUTH` | no | `bearer` (default; Zuplo, sends `Authorization: Bearer <key>`) or `rapidapi` (sends `X-RapidAPI-Key` and `X-RapidAPI-Host`). |
| `EINVOICE_RAPIDAPI_HOST` | no | `X-RapidAPI-Host` value; defaults to the host of the base URL. |
| `EINVOICE_API_TIMEOUT_MS` | no | Request timeout, default 30000. |
| `EINVOICE_MCP_OUTPUT_DIR` | no | Where generated PDFs go when no `outputPath` is given. Default: `<temp dir>/einvoice-mcp`. |

Existing files are never overwritten unless the call sets `overwrite: true`. File names suggested by the API are reduced
to a plain base name, so they cannot point outside the output directory.

## Install and run

Requires Node.js 22.18 or later. The package is on npm as `@einvoiceapi/mcp`; MCP clients start it with `npx`.

Claude Desktop (`claude_desktop_config.json`), or any MCP client that starts stdio servers:

```json
{
  "mcpServers": {
    "einvoice": {
      "command": "npx",
      "args": ["-y", "@einvoiceapi/mcp"],
      "env": {
        "EINVOICE_API_BASE_URL": "https://einvoice-api-main-f5141d8.zuplo.app",
        "EINVOICE_API_KEY": "zpka_..."
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add einvoice --env EINVOICE_API_BASE_URL=https://einvoice-api-main-f5141d8.zuplo.app --env EINVOICE_API_KEY=zpka_... -- npx -y @einvoiceapi/mcp
```

Example prompts: "Validate ~/Downloads/rechnung.pdf", "Parse this XRechnung and show the totals", "Turn this
XRechnung into a ZUGFeRD PDF".

When converting a parsed invoice into another format, remove `context.specificationIdentifier` from the JSON: BT-24
is set from `format`, and a conflicting value is rejected (400 `invalid-for-format`).

Findings of Schematron rules carry `docUrl`, the public page of the rule (https://einvoice-api.eu/rules/).

Gemini CLI: `gemini-extension.json` and its context file `GEMINI.md` are a Gemini CLI extension. In the public GitHub
repository they sit at the root, so `gemini extensions install https://github.com/einvoiceapi/einvoice-api` installs it; set `EINVOICE_API_KEY`
in the environment. They are not part of the npm package.

## Development

From a checkout: `npm ci`, `npm run build`, then point the client at `node <checkout>/mcp-server/dist/index.js`.

```bash
npm run lint
```

```bash
npm test
```

`lint` type-checks sources and tests (`tsc --noEmit`, strict). `test` runs the Node test runner directly on the
TypeScript files (type stripping) with a mocked `fetch`, and covers every tool end to end through an in-memory MCP
client. CI runs lint, test and build (`.github/workflows/ci.yml`, job `mcp`).

## Privacy

Invoices are personal data. The server sends them only to `EINVOICE_API_BASE_URL`, logs nothing about them (stdout
carries only the MCP protocol; stderr only start-up errors), and keeps nothing in memory between calls. Generated files
are written only where you ask (or to `EINVOICE_MCP_OUTPUT_DIR`); deleting them is up to you.

## Licence

MIT, see [LICENSE](LICENSE). The licence covers this client only; using the API is subject to its terms
(https://einvoice-api.eu/agb.html).
