#!/usr/bin/env python3
"""Read the values the SDK mirrors from apper source, with Python's ast module (apper is
never imported or run), and print them as JSON for sync-sdk.mjs.

  models       InvokeLLM model presets apper offers: the RuntimeModel enum minus
               _LEGACY_RUNTIME_MODELS and "automatic", in enum order
  tool-status  values of the status Literal on apper's ToolCall model
  connectors   connectors in the seed catalog that aren't behind a feature flag or in beta

Gated connectors are counted but not named: this repo is public, and naming them would
announce unreleased integrations.

Usage: extract_apper.py --apper DIR {models,tool-status,connectors}
"""

from __future__ import annotations

import argparse
import ast
import json
import pathlib
import re
import sys

MODELS_FILE = "backend/app/integrations/core/runtime_model_config.py"
MESSAGE_FILE = "backend/app/ai/models/message.py"
SEED_FILE = "backend/app/external_auth/integrations/config/connectors.json"
CONSTANTS_FILE = "backend/app/external_auth/models/constants.py"
FLAG_CHECK = re.compile(r"flag|require_feature", re.IGNORECASE)


def module(apper: pathlib.Path, rel: str) -> tuple[str, ast.Module]:
    text = (apper / rel).read_text()
    try:
        return text, ast.parse(text)
    except SyntaxError:
        # The traceback would print apper source into this public repo's logs.
        raise SystemExit(f"Can't parse {rel}") from None


def assigned(tree: ast.Module, name: str) -> ast.expr:
    for node in tree.body:
        target = node.target if isinstance(node, ast.AnnAssign) else node.targets[0] if isinstance(node, ast.Assign) else None
        if isinstance(target, ast.Name) and target.id == name:
            return node.value
    raise SystemExit(f"No module-level {name}")


def models(apper: pathlib.Path) -> dict:
    text, tree = module(apper, MODELS_FILE)
    # Nothing in this file is gated today. If a model ever is, this check can't tell
    # which, so it stops rather than publish a gated model in the public SDK.
    if FLAG_CHECK.search(text):
        raise SystemExit(f"{MODELS_FILE} now mentions feature flags; update extract_apper.py to leave gated models out")
    enum = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "RuntimeModel")
    members = {s.targets[0].id: s.value.value for s in enum.body if isinstance(s, ast.Assign) and isinstance(s.value, ast.Constant)}
    legacy_node = assigned(tree, "_LEGACY_RUNTIME_MODELS")
    legacy = {e.attr for e in legacy_node.args[0].elts}  # frozenset({RuntimeModel.X, ...})
    unknown = legacy - members.keys()
    if unknown:
        raise SystemExit(f"_LEGACY_RUNTIME_MODELS names members RuntimeModel doesn't have: {sorted(unknown)}")
    return {"offered": [v for k, v in members.items() if k not in legacy and v != "automatic"]}


def tool_status(apper: pathlib.Path) -> dict:
    _, tree = module(apper, MESSAGE_FILE)
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "ToolCall")
    field = next(s for s in cls.body if isinstance(s, ast.AnnAssign) and isinstance(s.target, ast.Name) and s.target.id == "status")
    literal = next(
        n for n in ast.walk(field.annotation)
        if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name) and n.value.id == "Literal"
    )
    values = literal.slice.elts if isinstance(literal.slice, ast.Tuple) else [literal.slice]
    return {"values": [v.value for v in values]}


def connectors(apper: pathlib.Path) -> dict:
    seed = json.loads((apper / SEED_FILE).read_text())
    _, tree = module(apper, CONSTANTS_FILE)
    flagged = {k.value for k in assigned(tree, "INTEGRATION_FEATURE_FLAGS").keys}
    public, gated = [], 0
    for entry in seed:
        display = entry.get("display", {})
        if entry["integration_type"] in flagged or display.get("display_status") == "beta":
            gated += 1
        else:
            public.append({"type": entry["integration_type"], "name": display["display_name"]})
    return {"connectors": public, "gated": gated}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apper", type=pathlib.Path, required=True)
    parser.add_argument("check", choices=["models", "tool-status", "connectors"])
    args = parser.parse_args()
    extract = {"models": models, "tool-status": tool_status, "connectors": connectors}[args.check]
    json.dump(extract(args.apper), sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
