#!/usr/bin/env bash
# EU E-Invoice API with curl. Needs EINVOICE_API_KEY (developer portal, Free plan: 100 documents a month).
# On Windows PowerShell write curl.exe instead of curl.
set -euo pipefail
BASE=${EINVOICE_API_BASE_URL:-https://einvoice-api-main-f5141d8.zuplo.app}
AUTH="Authorization: Bearer ${EINVOICE_API_KEY:?set EINVOICE_API_KEY}"

# Validate: send the PDF or XML as the raw body; the format is detected from the content.
# HTTP 200 with "valid": false is an invalid invoice, not an error. Each Schematron finding has a docUrl.
curl -sS -H "$AUTH" --data-binary @invoice.pdf "$BASE/v1/validate"

# The same as multipart (part name "file")
curl -sS -H "$AUTH" -F "file=@invoice.xml" "$BASE/v1/validate"

# Pin a rule-set version (see GET /v1/formats)
curl -sS -H "$AUTH" --data-binary @invoice.xml "$BASE/v1/validate?ruleset=xrechnung@3.0.2"

# Parse into normalized EN 16931 JSON with recomputed totals
curl -sS -H "$AUTH" --data-binary @invoice.xml "$BASE/v1/parse"

# Generate an XRechnung (UBL) from that JSON; the result is validated before it is returned (422 with findings if not)
curl -sS -H "$AUTH" -H "Content-Type: application/json" --data-binary @invoice.json \
  -o invoice-xrechnung.xml "$BASE/v1/generate?format=xrechnung-ubl"

# Generate a ZUGFeRD PDF with your own PDF/A as the visual part
curl -sS -H "$AUTH" -F "invoice=@invoice.json;type=application/json" -F "pdf=@layout.pdf" \
  -o invoice-zugferd.pdf "$BASE/v1/generate?format=zugferd-en16931"

# Rule-set versions in use
curl -sS -H "$AUTH" "$BASE/v1/formats"
