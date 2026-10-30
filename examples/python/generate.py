"""Generate an e-invoice from normalized JSON with the EU E-Invoice API (Python 3.9+, standard library only).

    EINVOICE_API_KEY=... python generate.py invoice.json xrechnung-ubl invoice.xml

Formats: xrechnung-cii, xrechnung-ubl, zugferd-en16931, facturx-basic, en16931-cii, en16931-ubl, peppol-bis,
cius-ro-ubl, hr-cius-ubl, ksef-fa3, fatturapa-fpr12, fatturapa-fpa12. The JSON schema is the one /v1/parse returns.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("EINVOICE_API_BASE_URL", "https://einvoice-api-main-f5141d8.zuplo.app")


def main():
    source, fmt, target = sys.argv[1:4]
    with open(source, "rb") as f:
        body = f.read()
    request = urllib.request.Request(
        f"{BASE}/v1/generate?format={fmt}", data=body,
        headers={"Authorization": "Bearer " + os.environ["EINVOICE_API_KEY"], "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            document = response.read()
    except urllib.error.HTTPError as e:
        problem = json.load(e)
        print(f"HTTP {e.code}: {problem.get('detail') or problem.get('title')}", file=sys.stderr)
        # 422 generated-invoice-invalid: the findings name the rules the input does not meet
        for f in problem.get("findings", []):
            print(f"  {f['severity']} {f['ruleId']}: {f['message']} {f.get('docUrl', '')}", file=sys.stderr)
        sys.exit(1)
    with open(target, "wb") as f:
        f.write(document)
    print(f"{target}: {len(document)} bytes, valid")


if __name__ == "__main__":
    main()
