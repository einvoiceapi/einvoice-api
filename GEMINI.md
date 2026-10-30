# EU E-Invoice API

The `einvoice` MCP server validates, parses and generates EU e-invoices through the EU E-Invoice API. It needs the
environment variable `EINVOICE_API_KEY` (developer portal, Free plan: 100 documents a month: https://einvoice-api.eu).

- `validate_invoice`: check an XRechnung, ZUGFeRD / Factur-X PDF, Peppol BIS, CIUS-RO, HR-CIUS, FatturaPA or KSeF FA(3)
  file. `valid: false` is a normal result, not an error. `fatal` and `error` findings make the invoice invalid; each
  Schematron finding has a `docUrl` with the official rule text: open it before suggesting a fix.
- `parse_invoice`: read an e-invoice into normalized EN 16931 JSON with recomputed totals.
- `generate_invoice`: write a document from that JSON (`format`, e.g. `xrechnung-ubl`, `zugferd-en16931`,
  `peppol-bis`, `ksef-fa3`, `fatturapa-fpr12`). Remove `context.specificationIdentifier` when converting a parsed
  invoice into another format.

Always validate a generated or edited invoice before telling the user it is ready to send. The API does not deliver
invoices (Peppol, SDI, KSeF and French platforms need an access point). Documentation: https://einvoice-api.eu/llms.txt
