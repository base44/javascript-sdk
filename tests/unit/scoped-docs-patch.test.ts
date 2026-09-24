import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../scripts/scoped-docs-patch.mjs', import.meta.url));
const DOCS_PATH = 'developers/references/sdk/docs';
const LOCALES = ['de', 'fr'];
const PAGE = 'type-aliases/integrations.mdx';

const basePage = ['# InvokeLLM', '', 'intro', '', '<ParamField body="model" type="&quot;a&quot; | &quot;b&quot;">', '', 'Options: ``"a"``, ``"b"``', '', '</ParamField>', ''].join('\n');
const headPage = basePage.replace('&quot;a&quot; | &quot;b&quot;', '&quot;a&quot; | &quot;b&quot; | &quot;c&quot;').replace('``"a"``, ``"b"``', '``"a"``, ``"b"``, ``"c"``');

function write(root: string, rel: string, content: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

type RunResult = { status: number; stdout: string; stderr: string; outputs: Record<string, string> };

function run(args: string[], cwd: string): RunResult {
  const outputFile = join(cwd, 'github_output');
  writeFileSync(outputFile, '');
  let status = 0, stdout = '', stderr = '';
  try {
    stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env, GITHUB_OUTPUT: outputFile }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err: any) {
    status = err.status; stdout = err.stdout ?? ''; stderr = err.stderr ?? '';
  }
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(outputFile, 'utf8').split('\n').filter(Boolean)) {
    const i = line.indexOf('=');
    outputs[line.slice(0, i)] = line.slice(i + 1);
  }
  return { status, stdout, stderr, outputs };
}

describe('scoped-docs-patch', () => {
  let dir: string, base: string, head: string, target: string;
  const allCopies = () => ['', ...LOCALES.map((l) => `${l}/`)].map((p) => `${p}${DOCS_PATH}/${PAGE}`);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scoped-docs-'));
    base = join(dir, 'base');
    head = join(dir, 'head');
    target = join(dir, 'mintlify-docs');

    // Generated trees before and after an SDK change. README.mdx differs too
    // but is never published, so it must be ignored. One page is unchanged.
    for (const [root, page, readme] of [[base, basePage, 'readme v1'], [head, headPage, 'readme v2']] as const) {
      write(root, PAGE, page);
      write(root, 'interfaces/agents.mdx', 'unchanged\n');
      write(root, 'README.mdx', readme);
    }

    // A mintlify-docs checkout whose published pages match the base state.
    const docsJson = { navigation: { languages: [{ language: 'en', default: true, tabs: [] }, ...LOCALES.map((l) => ({ language: l, tabs: [] }))] } };
    write(target, 'docs.json', JSON.stringify(docsJson));
    for (const rel of allCopies()) write(target, rel, basePage);
    git(target, 'init', '-q');
    git(target, 'add', '-A');
    git(target, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'published');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('applies only the changed page to English and every locale mirror', () => {
    const summary = join(dir, 'summary.md');
    const res = run(['--base', base, '--head', head, '--target', target, '--apply', '--summary', summary], dir);
    expect(res.status, res.stderr).toBe(0);
    expect(res.outputs).toEqual({ changed: 'true', files: PAGE });
    for (const rel of allCopies()) expect(readFileSync(join(target, rel), 'utf8')).toBe(headPage);
    const status = git(target, 'status', '--porcelain').trimEnd().split('\n');
    expect(status).toHaveLength(allCopies().length);
    expect(status.every((l) => l.startsWith(' M '))).toBe(true);
    const text = readFileSync(summary, 'utf8');
    expect(text).toContain(`${DOCS_PATH}/${PAGE}`);
    expect(text).toContain('+Options: ``"a"``, ``"b"``, ``"c"``');
    expect(text).not.toContain('README');
  });

  test('dry run checks every copy but writes nothing', () => {
    const res = run(['--base', base, '--head', head, '--target', target], dir);
    expect(res.status, res.stderr).toBe(0);
    expect(res.outputs.changed).toBe('true');
    expect(git(target, 'status', '--porcelain')).toBe('');
  });

  test('refuses when the published page already differs in the same lines', () => {
    expect(run(['--base', base, '--head', head, '--target', target, '--apply'], dir).status).toBe(0);
    const res = run(['--base', base, '--head', head, '--target', target, '--apply'], dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/does not apply cleanly/);
    expect(res.stderr).toMatch(/patch does not apply/);
  });

  test('refuses when a locale copy is missing rather than patching the rest', () => {
    rmSync(join(target, 'fr', DOCS_PATH, PAGE));
    const res = run(['--base', base, '--head', head, '--target', target, '--apply'], dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/fr\//);
    expect(git(target, 'status', '--porcelain')).toMatch(/^ D /);
    expect(git(target, 'status', '--porcelain').split('\n').filter((l) => l.startsWith(' M'))).toHaveLength(0);
  });

  test('reports nothing to publish when only ignored files differ', () => {
    const same = join(dir, 'same');
    cpSync(base, same, { recursive: true });
    writeFileSync(join(same, 'README.mdx'), 'readme changed');
    const res = run(['--base', base, '--head', same, '--target', target, '--apply'], dir);
    expect(res.status, res.stderr).toBe(0);
    expect(res.outputs).toEqual({ changed: 'false', files: '' });
    expect(res.stdout).toMatch(/nothing to publish/);
    expect(git(target, 'status', '--porcelain')).toBe('');
  });

  test('refuses page additions and removals because they need a nav update', () => {
    write(head, 'type-aliases/new-page.mdx', 'new\n');
    const res = run(['--base', base, '--head', head, '--target', target, '--apply'], dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/adds or removes reference pages/);
    expect(res.stderr).toMatch(/A type-aliases\/new-page\.mdx/);
    expect(git(target, 'status', '--porcelain')).toBe('');
  });

  test('rejects a target that is not a mintlify-docs checkout or has no locales', () => {
    expect(run(['--base', base, '--head', head, '--target', dir], dir).stderr).toMatch(/no docs.json/);
    write(target, 'docs.json', JSON.stringify({ navigation: { languages: [{ language: 'en', default: true }] } }));
    expect(run(['--base', base, '--head', head, '--target', target], dir).stderr).toMatch(/no non-default locales/);
  });
});
