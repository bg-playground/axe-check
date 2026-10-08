#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const IMPACT_RANK = { minor: 1, moderate: 2, serious: 3, critical: 4 };

function help() {
  return `axe-check <url> [--include sel] [--exclude sel] [--fail-on serious] [--timeout 30000]
         [--wait-for body] [--tags tag] [--strict-review] [--out file]

Scan a URL for WCAG A/AA issues with Playwright and axe-core.
Fails when a violation is at or above --fail-on. Summary on stderr, JSON on stdout.
Incomplete rules are printed and do not fail the run unless --strict-review is set.`;
}

function parseArgs(argv) {
  const args = {
    url: '',
    include: [],
    exclude: [],
    tags: [],
    failOn: 'serious',
    timeout: 30000,
    waitFor: 'body',
    out: '',
    strictReview: false,
    help: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--include') args.include.push(required(argv, ++i, token));
    else if (token === '--exclude') args.exclude.push(required(argv, ++i, token));
    else if (token === '--tags') args.tags.push(...splitTags(required(argv, ++i, token)));
    else if (token === '--fail-on') args.failOn = required(argv, ++i, token);
    else if (token === '--timeout') args.timeout = Number(required(argv, ++i, token));
    else if (token === '--wait-for') args.waitFor = required(argv, ++i, token);
    else if (token === '--out') args.out = required(argv, ++i, token);
    else if (token === '--strict-review') args.strictReview = true;
    else if (token.startsWith('-')) throw new Error(`Unknown flag ${token}`);
    else positional.push(token);
  }
  args.url = positional[0] ?? '';
  if (args.tags.length === 0) args.tags = [...DEFAULT_TAGS];
  return args;
}

function required(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('-')) throw new Error(`${flag} needs a value`);
  return value;
}

function splitTags(value) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function blocking(violations, failOn) {
  const floor = IMPACT_RANK[failOn];
  if (!floor) throw new Error('--fail-on must be minor, moderate, serious, or critical');
  return violations.filter((violation) => (IMPACT_RANK[violation.impact] ?? 0) >= floor);
}

function firstDetail(rule) {
  const node = rule.nodes?.[0];
  if (!node) return '';
  const target = Array.isArray(node.target) ? node.target.join(' ') : String(node.target ?? '');
  const reason = (node.failureSummary || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('Fix '));
  return `  ${target}: ${reason || 'needs review'}`;
}

function ruleLine(rule) {
  const nodes = rule.nodes?.length ?? 0;
  return `- ${rule.impact ?? 'unknown'} ${rule.id} (${nodes} node${nodes === 1 ? '' : 's'}) ${rule.help}`;
}

function summarize(url, violations, incomplete, strictReview) {
  const lines = [
    violations.length === 0
      ? `${url}: no blocking violations`
      : `${url}: ${violations.length} blocking rule(s)`,
  ];
  for (const rule of violations) {
    lines.push(ruleLine(rule));
    const detail = firstDetail(rule);
    if (detail) lines.push(detail);
  }
  if (incomplete.length === 0) return lines.join('\n');
  const review = strictReview && violations.length === 0
    ? 'incomplete, failed the run because --strict-review is set:'
    : 'incomplete, did not fail the run:';
  lines.push(review);
  for (const rule of incomplete) {
    lines.push(ruleLine(rule));
    const detail = firstDetail(rule);
    if (detail) lines.push(detail);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    console.error(help());
    process.exit(args.help ? 0 : 2);
  }
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) {
    throw new Error('--timeout must be a positive number');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const response = await page.goto(args.url, {
      waitUntil: 'domcontentloaded',
      timeout: args.timeout,
    });
    if (response && response.status() >= 400) {
      throw new Error(`${args.url} returned HTTP ${response.status()}`);
    }
    await page.waitForSelector(args.waitFor, { state: 'visible', timeout: args.timeout });

    let builder = new AxeBuilder({ page }).withTags(args.tags);
    for (const selector of args.include) builder = builder.include(selector);
    for (const selector of args.exclude) builder = builder.exclude(selector);
    const results = await builder.analyze();
    const failed = blocking(results.violations, args.failOn);
    const review = results.incomplete ?? [];
    const report = {
      url: args.url,
      tags: args.tags,
      failOn: args.failOn,
      waitFor: args.waitFor,
      strictReview: args.strictReview,
      violations: failed,
      incomplete: review,
    };
    const json = JSON.stringify(report, null, 2);
    if (args.out) await writeFile(args.out, `${json}\n`);
    else console.log(json);
    console.error(summarize(args.url, failed, review, args.strictReview));
    if (failed.length > 0) process.exitCode = 1;
    else if (args.strictReview && review.length > 0) process.exitCode = 3;
    else process.exitCode = 0;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
