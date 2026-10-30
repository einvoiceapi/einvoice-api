# EU E-Invoice API: examples and MCP server

Client code for the [EU E-Invoice API](https://einvoice-api.eu), a REST API that validates, parses and generates EU
e-invoices: XRechnung, ZUGFeRD / Factur-X, Peppol BIS Billing 3.0, the French rules BR-FR, CIUS-RO, HR-CIUS,
FatturaPA, KSeF FA(3) and plain EN 16931.

| Folder | What it is |
|---|---|
| [examples/](examples/) | Copy-paste examples in curl, Python, TypeScript, Java and C# |
| [mcp-server/](mcp-server/) | MCP server for AI assistants and agents, on npm as `@einvoiceapi/mcp` |
| `gemini-extension.json`, `GEMINI.md` | Gemini CLI extension: `gemini extensions install <this repository's URL>` |
| `context7.json` | Rules for coding agents (Context7) |

Get an API key in the developer portal (Free plan: 100 documents a month, no payment details) and set it as
`EINVOICE_API_KEY`. Never commit it: keep it in the environment or a local `.env` file (ignored here).

```bash
npx -y @einvoiceapi/mcp
```

Documentation for developers and coding agents: https://einvoice-api.eu/llms.txt, OpenAPI:
https://einvoice-api.eu/openapi.json, every validation rule: https://einvoice-api.eu/rules/

This repository is published from the API's own repository; changes made here are overwritten. The API is self-service
and comes without personal support, so issues are switched off. The code is MIT-licensed ([LICENSE](LICENSE)); using
the API is subject to its terms (https://einvoice-api.eu/agb.html).
