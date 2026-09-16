import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain ESM script without type declarations
import { parseRuntimeModels, parseTarget, renderUnion, renderOptions } from '../../scripts/sync-runtime-models.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/sync-runtime-models.mjs', import.meta.url));
const REAL_TARGET = fileURLToPath(new URL('../../src/modules/integrations.types.ts', import.meta.url));

/** Build a RuntimeModel enum source the way apper writes it. */
function pyEnum(values: string[], { automatic = true } = {}) {
  const members = (automatic ? ['automatic', ...values] : values)
    .map((v) => `    ${v.toUpperCase().replace(/[^A-Z0-9]/g, '_')} = "${v}"`)
    .join('\n');
  return [
    'from enum import Enum',
    '',
    'class RuntimeModel(str, Enum):',
    '    """Available models for AppAgents."""',
    '    # a comment inside the body',
    members,
    '',
    '',
    '_OTHER = {"x": "y"}',
    '',
  ].join('\n');
}

type RunResult = { status: number; stdout: string; stderr: string; outputs: Record<string, string> };

function run(args: string[], cwd: string): RunResult {
  const outputFile = join(cwd, 'github_output');
  writeFileSync(outputFile, '');
  const env = { ...process.env, GITHUB_OUTPUT: outputFile };
  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err: any) {
    status = err.status;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(outputFile, 'utf8').split('\n').filter(Boolean)) {
    const i = line.indexOf('=');
    outputs[line.slice(0, i)] = line.slice(i + 1);
  }
  return { status, stdout, stderr, outputs };
}

describe('sync-runtime-models: parsing', () => {
  test('extracts values in declaration order, skipping docstring and comments, minus automatic', () => {
    expect(parseRuntimeModels(pyEnum(['b_model', 'a_model', 'c-model']))).toEqual(['b_model', 'a_model', 'c-model']);
  });

  test('accepts single-quoted values and trailing comments', () => {
    const src = pyEnum(['x1', 'x2', 'x3']).replace('"x2"', "'x2'  # trailing");
    expect(parseRuntimeModels(src)).toEqual(['x1', 'x2', 'x3']);
  });

  test('rejects a missing class, a missing automatic member, and unrecognized body lines', () => {
    expect(() => parseRuntimeModels('class Other(str, Enum):\n    A = "a"\n')).toThrow(/exactly one 'class RuntimeModel'/);
    expect(() => parseRuntimeModels(pyEnum(['a', 'b', 'c'], { automatic: false }))).toThrow(/"automatic" member/);
    expect(() => parseRuntimeModels(pyEnum(['a', 'b', 'c']).replace('    B = "b"', '    B = compute()'))).toThrow(/does not understand/);
  });

  test('rejects too few models, duplicates, and unsafe characters', () => {
    expect(() => parseRuntimeModels(pyEnum(['only_one']))).toThrow(/expected at least/);
    expect(() => parseRuntimeModels(pyEnum(['a', 'b', 'c']).replace('    C = "c"', '    C = "c"\n    A_AGAIN = "a"'))).toThrow(/declared twice/);
    expect(() => parseRuntimeModels(pyEnum(['a', 'b', "c'; drop"]))).toThrow(/unexpected characters/);
  });

  test('finds the union and its Options line in the real integrations.types.ts', () => {
    const target = parseTarget(readFileSync(REAL_TARGET, 'utf8'));
    expect(target.unionModels.length).toBeGreaterThanOrEqual(3);
    expect(target.optionModels).toEqual(target.unionModels);
    expect(target.optionsIdx).toBeLessThan(target.unionIdx);
    expect(renderUnion(target.unionIndent, target.unionModels)).toBe(target.lines[target.unionIdx]);
    expect(renderOptions(target.optionsPrefix, target.unionModels)).toBe(target.lines[target.optionsIdx]);
  });

  test('rejects a target with two union lines', () => {
    const src = readFileSync(REAL_TARGET, 'utf8');
    const union = src.split('\n').find((l) => /^\s*model\?: /.test(l))!;
    expect(() => parseTarget(src + '\n' + union + '\n')).toThrow(/exactly one `model\?:` union/);
  });
});

describe('sync-runtime-models: CLI', () => {
  let dir: string;
  let target: string;
  let current: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sync-models-'));
    target = join(dir, 'integrations.types.ts');
    writeFileSync(target, readFileSync(REAL_TARGET, 'utf8'));
    current = parseTarget(readFileSync(target, 'utf8')).unionModels;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('reports in sync and touches nothing when apper matches', () => {
    const src = join(dir, 'models.py');
    writeFileSync(src, pyEnum(current));
    const before = readFileSync(target, 'utf8');
    const res = run(['--source', src, '--target', target, '--write'], dir);
    expect(res.status).toBe(0);
    expect(res.outputs).toMatchObject({ changed: 'false', added: '', removed: '' });
    expect(readFileSync(target, 'utf8')).toBe(before);
    expect(run(['--source', src, '--target', target, '--check'], dir).status).toBe(0);
  });

  test('detects drift, rewrites both lines, and is idempotent', () => {
    const src = join(dir, 'models.py');
    const next = [...current.slice(1), 'brand_new_model'];
    writeFileSync(src, pyEnum(next));

    expect(run(['--source', src, '--target', target, '--check'], dir).status).toBe(2);

    const summary = join(dir, 'summary.md');
    const res = run(['--source', src, '--target', target, '--write', '--summary', summary], dir);
    expect(res.status).toBe(0);
    expect(res.outputs).toEqual({ changed: 'true', added: 'brand_new_model', removed: current[0] });
    const after = parseTarget(readFileSync(target, 'utf8'));
    expect(after.unionModels).toEqual(next);
    expect(after.optionModels).toEqual(next);
    expect(readFileSync(summary, 'utf8')).toContain('**Removed:** `' + current[0] + '`');
    expect(readFileSync(summary, 'utf8')).toContain('breaking change');

    const again = run(['--source', src, '--target', target, '--write'], dir);
    expect(again.status).toBe(0);
    expect(again.outputs.changed).toBe('false');
  });

  test('fails loudly instead of reporting in sync when the source is unparseable', () => {
    const src = join(dir, 'models.py');
    writeFileSync(src, pyEnum(current).replace('class RuntimeModel', 'class Renamed'));
    const res = run(['--source', src, '--target', target, '--write'], dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/exactly one 'class RuntimeModel'/);
    expect(res.outputs).toEqual({});
    expect(existsSync(join(dir, 'summary.md'))).toBe(false);
  });

  test('rejects --check together with --write and a missing --source', () => {
    expect(run(['--check', '--write', '--source', 'x'], dir).status).toBe(1);
    expect(run(['--check'], dir).status).toBe(1);
  });
});
