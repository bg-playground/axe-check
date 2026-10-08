import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const cli = fileURLToPath(new URL('../axe-check.mjs', import.meta.url));
let server, base, dir;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'axe-check-'));
  const html = await readFile(new URL('../fixtures/cli.html', import.meta.url));
  server = createServer((req, res) => {
    res.writeHead(req.url === '/missing' ? 404 : 200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(dir, { recursive: true, force: true });
});
function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, ...env }, timeout: 45000,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
function report(result, code) {
  assert.equal(result.code, code, result.stderr);
  return JSON.parse(result.stdout);
}
test('help and invalid arguments complete before browser launch', async () => {
  const env = { PLAYWRIGHT_BROWSERS_PATH: join(dir, 'no-browsers') };
  const help = await run(['--help'], env);
  assert.equal(help.code, 0);
  assert.equal(help.stdout, '');
  assert.match(help.stderr, /axe-check <url>/);
  const cases = [
    [[], /exactly one URL/],
    [['not-a-url'], /absolute/],
    [['ftp://example.com'], /http:/],
    [[base, base], /exactly one URL/],
    [[base, '--fail-on', 'urgent'], /--fail-on must/],
    [[base, '--fail-on', 'constructor'], /--fail-on must/],
    [[base, '--timeout', '0'], /--timeout must/],
    [[base, '--timeout', 'NaN'], /--timeout must/],
    [[base, '--timeout', '1.5'], /--timeout must/],
    [[base, '--timeout', 'Infinity'], /--timeout must/],
    [[base, '--timeout', '9007199254740992'], /--timeout must/],
    [[base, '--tags', ','], /non-empty/],
    [[base, '--tags', 'wcag2a,'], /non-empty/],
    [[base, '--include', ' '], /needs a value/],
    [[base, '--out'], /needs a value/],
    [[base, '--wait-for', '--strict-review'], /needs a value/],
    [[base, '--unknown'], /Unknown flag/],
  ];
  for (const [args, message] of cases) {
    const result = await run(args, env);
    assert.equal(result.code, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stderr, /Executable doesn't exist/);
  }
});
test('clean scope exits 0; file URLs are supported', async () => {
  const result = await run([new URL('../fixtures/cli.html', import.meta.url).href, '--include', '#clean']);
  const data = report(result, 0);
  assert.deepEqual(data.violations, []);
  assert.deepEqual(data.blockingViolations, []);
  assert.deepEqual(data.incomplete, []);
  assert.deepEqual(data.tags, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  assert.match(result.stderr, /no blocking violations/);
});
test('all violations survive threshold filtering and blocking exits 1', async () => {
  const result = await run([base, '--include', '#violation', '--fail-on', 'critical']);
  const data = report(result, 1);
  assert.ok(data.violations.some((rule) => rule.id === 'color-contrast' && rule.impact === 'serious'));
  assert.ok(data.blockingViolations.some((rule) => rule.id === 'image-alt'));
  assert.ok(data.blockingViolations.every((rule) => rule.impact === 'critical'));
  assert.deepEqual(data.blockingViolations, data.violations.filter((rule) => rule.impact === 'critical'));
  assert.match(result.stderr, /blocking rule/);
  assert.doesNotMatch(result.stderr, /serious color-contrast/);
});
test('nonblocking violations stay in JSON with exit 0', async () => {
  const data = report(await run([base, '--include', '#contrast', '--fail-on', 'critical']), 0);
  assert.ok(data.violations.some((rule) => rule.id === 'color-contrast'));
  assert.deepEqual(data.blockingViolations, []);
});
test('strict review exits 3; default review exits 0; blocking takes precedence', async () => {
  for (const strict of [false, true]) {
    const result = await run([base, '--include', '#manual', ...(strict ? ['--strict-review'] : [])]);
    const data = report(result, strict ? 3 : 0);
    assert.ok(data.incomplete.some((rule) => rule.id === 'color-contrast'));
    assert.equal(data.strictReview, strict);
    assert.match(result.stderr, /#review/);
    assert.match(result.stderr, strict ? /failed the run because/ : /did not fail the run/);
  }
  const data = report(await run([base, '--strict-review']), 1);
  assert.ok(data.blockingViolations.length > 0);
  assert.ok(data.incomplete.length > 0);
});
test('repeatable scope and tags, wait selector, and file output', async () => {
  const out = join(dir, 'report.json');
  const result = await run([base, '--include', '#clean', '--include', '#violation',
    '--exclude', '#contrast', '--exclude', 'img', '--wait-for', '#clean',
    '--tags', 'wcag2a,wcag2aa', '--tags', 'wcag21aa', '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  const text = await readFile(out, 'utf8');
  assert.ok(text.endsWith('\n'));
  const data = JSON.parse(text);
  assert.deepEqual(data.tags, ['wcag2a', 'wcag2aa', 'wcag21aa']);
  assert.equal(data.waitFor, '#clean');
  assert.deepEqual(data.violations, []);
  assert.match(result.stderr, /no blocking violations/);
  const blocked = await run([base, '--include', '#violation', '--out', out]);
  assert.equal(blocked.code, 1, blocked.stderr);
  assert.equal(blocked.stdout, '');
  assert.ok(JSON.parse(await readFile(out, 'utf8')).blockingViolations.length > 0);
});
test('HTTP, wait, selector and output errors exit 2 without stdout JSON', async () => {
  const cases = [
    [[`${base}/missing`], /HTTP 404/],
    [[base, '--wait-for', '#absent', '--timeout', '1000'], /Timeout/],
    [[base, '--include', '['], /selector/i],
    [[base, '--include', '#clean', '--out', dir], /EISDIR|EPERM|EACCES/],
  ];
  for (const [args, message] of cases) {
    const result = await run(args);
    assert.equal(result.code, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
  }
});
