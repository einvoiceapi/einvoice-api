"""Validate an e-invoice with the EU E-Invoice API (Python 3.9+, standard library only).

    EINVOICE_API_KEY=... python validate.py invoice.pdf

Prints the verdict and every finding; exit code 0 if the invoice is valid, 1 if not.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("EINVOICE_API_BASE_URL", "https://einvoice-api-main-f5141d8.zuplo.app")


def validate(path):
    with open(path, "rb") as f:
        body = f.read()
    request = urllib.request.Request(
        BASE + "/v1/validate",
        data=body,  # raw body: PDF or XML, the format is detected from the content
        headers={"Authorization": "Bearer " + os.environ["EINVOICE_API_KEY"],
                 "Content-Type": "application/octet-stream"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        # errors are RFC 9457 problem+json: "detail" says what to fix
        problem = json.load(e)
        sys.exit(f"HTTP {e.code}: {problem.get('detail') or problem.get('title')}")


def main():
    result = validate(sys.argv[1])
    print(f"valid: {result['valid']}  format: {result.get('format')}  profile: {result.get('profile')}")
    for f in result["findings"]:
        line = f"{f['severity']:7} {f['ruleId']}: {f['message']}"
        if f.get("xpath"):
            line += f"\n        at {f['xpath']}"
        if f.get("docUrl"):
            line += f"\n        {f['docUrl']}"
        print(line)
    sys.exit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
