# EU E-Invoice API: examples

Copy-paste examples for the [EU E-Invoice API](https://einvoice-api.eu), which validates, parses and generates EU
e-invoices: XRechnung, ZUGFeRD / Factur-X, Peppol BIS Billing 3.0, the French rules BR-FR, CIUS-RO, HR-CIUS,
FatturaPA, KSeF FA(3) and plain EN 16931.

Get an API key in the developer portal (Free plan: 100 documents a month, no payment details) and set it as
`EINVOICE_API_KEY`. `EINVOICE_API_BASE_URL` overrides the base URL.

| Language | File | What it does |
|---|---|---|
| curl | [curl/examples.sh](curl/examples.sh) | validate, pin a rule set, parse, generate XML and PDF, list rule sets |
| Bruno | [bruno/](bruno/) | collection for the [Bruno](https://www.usebruno.com) API client: validate, parse, generate, list rule sets. Open the folder, choose the environment and set `apiKey` |
| Python (standard library) | [python/validate.py](python/validate.py), [python/generate.py](python/generate.py) | validate a file and print the findings; generate a document from JSON |
| TypeScript (Node.js 22.18+) | [typescript/validate.ts](typescript/validate.ts) | validate a file and print the findings |
| Java 17+ | [java/Validate.java](java/Validate.java) | validate a file (`java Validate.java invoice.pdf`) |
| C# (.NET 8+) | [csharp/Program.cs](csharp/Program.cs) | validate a file and print the findings |

Documentation for developers and coding agents: https://einvoice-api.eu/llms.txt (Markdown docs, OpenAPI at
https://einvoice-api.eu/openapi.json). MCP server for AI assistants: `npx -y @einvoiceapi/mcp`.

The examples are MIT-licensed. The API itself is a paid service with a permanent free plan; it is self-service, with
no personal support.
