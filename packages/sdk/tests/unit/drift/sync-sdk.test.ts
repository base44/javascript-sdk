import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncModels, syncToolStatus, syncConnectors, SyncError } from "../../../scripts/drift/sync-sdk.mjs";

const EXTRACT = fileURLToPath(new URL("../../../scripts/drift/extract_apper.py", import.meta.url));

const INTEGRATIONS = [
  "export interface InvokeLLMParams {",
  "  /** Model.",
  "   *",
  '   * Options: `"a"`, `"old"`',
  "   */",
  "  model?: 'a' | 'old';",
  "}",
].join("\n");

const AGENTS = [
  "export interface Other {",
  '  status: "x";',
  "}",
  "export interface AgentMessageToolCall {",
  '  status: "running" | "success";',
  "}",
].join("\n");

const CONNECTORS = [
  " * ## Available connectors",
  " *",
  " * | Service | Type identifier |",
  " * |---|---|",
  " * | Airtable | `airtable` |",
  " * | Slack | `slack` |",
  " * | Zoom | `zoom` |",
  " *",
].join("\n");

describe("syncModels", () => {
  test("adds offered models, keeps retired ones in the union, and lists only offered ones as options", () => {
    const { text, added, retired } = syncModels(INTEGRATIONS, ["a", "b", "c"]);
    expect(text).toContain("model?: 'a' | 'b' | 'c' | 'old';");
    expect(text).toContain('Options: `"a"`, `"b"`, `"c"`');
    expect(added).toEqual(["b", "c"]);
    expect(retired).toEqual(["old"]);
  });

  test("refuses values that would break the TS literal and suspiciously short lists", () => {
    expect(() => syncModels(INTEGRATIONS, ["a", "b", "bad'quote"])).toThrow(SyncError);
    expect(() => syncModels(INTEGRATIONS, ["a"])).toThrow(SyncError);
  });
});

describe("syncToolStatus", () => {
  test("appends new values only inside AgentMessageToolCall", () => {
    const { text, added, retired } = syncToolStatus(AGENTS, ["running", "error"]);
    expect(text).toContain('  status: "running" | "success" | "error";');
    expect(text).toContain('  status: "x";');
    expect(added).toEqual(["error"]);
    expect(retired).toEqual(["success"]);
  });
});

describe("syncConnectors", () => {
  test("inserts new connectors alphabetically, applies display-name overrides, removes dropped ones", () => {
    const { text, added, removed } = syncConnectors(CONNECTORS, [
      { type: "airtable", name: "Airtable" },
      { type: "github", name: "GitHub API" },
      { type: "zoom", name: "Zoom" },
    ]);
    const rows = text.split("\n").filter((l: string) => l.startsWith(" * | ") && l.includes("`"));
    expect(rows).toEqual([" * | Airtable | `airtable` |", " * | GitHub | `github` |", " * | Zoom | `zoom` |"]);
    expect(added).toEqual([{ name: "GitHub", type: "github" }]);
    expect(removed).toEqual(["slack"]);
  });

  test("refuses a catalog that suddenly lists far fewer connectors", () => {
    expect(() => syncConnectors(CONNECTORS, [{ type: "airtable", name: "Airtable" }])).toThrow(SyncError);
  });
});

describe("extract_apper.py", () => {
  function apper(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), "apper-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  }
  const extract = (root: string, check: string) =>
    JSON.parse(execFileSync("python3", [EXTRACT, "--apper", root, check], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }));

  test("offered models leave out legacy models and automatic", () => {
    const root = apper({
      "backend/app/integrations/core/runtime_model_config.py": [
        "class RuntimeModel(str, Enum):",
        '    AUTOMATIC = "automatic"',
        '    NEW = "new_model"',
        '    OLD = "old_model"',
        "_LEGACY_RUNTIME_MODELS: frozenset[RuntimeModel] = frozenset({RuntimeModel.OLD})",
      ].join("\n"),
    });
    expect(extract(root, "models")).toEqual({ offered: ["new_model"] });
  });

  test("tool statuses come from the Literal inside Annotated", () => {
    const root = apper({
      "backend/app/ai/models/message.py": [
        "class ToolCall(BaseModel):",
        "    status: Annotated[",
        '        Literal["running", "success"], _PUBLIC,',
        '    ] = Field(default="running")',
      ].join("\n"),
    });
    expect(extract(root, "tool-status")).toEqual({ values: ["running", "success"] });
  });

  test("flagged and beta connectors are counted, not named", () => {
    const root = apper({
      "backend/app/external_auth/integrations/config/connectors.json": JSON.stringify([
        { integration_type: "slack", display: { display_name: "Slack" } },
        { integration_type: "secret", display: { display_name: "Secret" } },
        { integration_type: "early", display: { display_name: "Early", display_status: "beta" } },
      ]),
      "backend/app/external_auth/models/constants.py": 'INTEGRATION_FEATURE_FLAGS: dict[str, FeatureFlag] = {"secret": FeatureFlag.X}',
    });
    expect(extract(root, "connectors")).toEqual({ connectors: [{ type: "slack", name: "Slack" }], gated: 2 });
  });
});
