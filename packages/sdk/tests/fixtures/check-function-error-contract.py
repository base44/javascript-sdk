"""Checks function-error-header-v2.json against apper's own reader.

    python check-function-error-contract.py <apper checkout>

Run it with apper's Python environment (the reader imports pydantic). Exits non-zero on a mismatch.
"""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
from backend.app.cloudflare_functions.function_error import read_function_error  # noqa: E402

fixture = json.loads((Path(__file__).parent / "function-error-header-v2.json").read_text())
failures = 0
for case in fixture["cases"]:
    response = SimpleNamespace(headers={"x-b44-function-error": case["header"]}, status_code=case["status"])
    got = read_function_error(response, version=2)
    if not case["accept"]:
        ok = got is None
    else:
        ok = got is not None and {
            "kind": got.kind,
            "message": got.message,
            "name": got.name,
            "fn": got.fn,
            "frames": got.frames,
        } == case["expected"]
    if not ok:
        failures += 1
        print(f"MISMATCH {case['name']}: {got}")
print(f"{len(fixture['cases']) - failures}/{len(fixture['cases'])} cases match")
sys.exit(1 if failures else 0)
