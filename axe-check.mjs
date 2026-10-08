#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const IMPACT_RANK = { minor: 1, moderate: 2, serious: 3, critical: 4 };

function help() {
  return `axe-check <url> [--include sel] [--exclude sel] [--fail-on serious] [--timeout 30000] [--out file]

Scan a URL for WCAG 2.1 A/AA issues with Playwright and axe-core.
Fails when a violation is at or above --fail-on. Summary on stderr, JSON on stdout.`;
}

function parseArgs(argv) {
  const args = {
    url: '',
    include: [],
    exclude: [],
    failOn: 'serious',
    timeout: 30000,
    out: '',
    help: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--include') args.include.push(required(argv, ++i, token));
    else if (token === '--exclude') args.exclude.push(required(argv, ++i, token));
    else if (token === '--fail-on') args.failOn = required(argv, ++i, token);
    else if (token === '--timeout') args.timeout = Number(required(argv, ++i, token));
    else if (token === '--out') args.out = required(argv, ++i, token);
    else if (token.startsWith('-')) throw new Error(`Unknown flag ${token}`);
    else positional.push(token);
  }
  args.url = positional[0] ?? '';
  return args;
}

function required(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('-')) throw new Error(`${flag} needs a value`);
  return value;
}

function blocking(violations, failOn) {
  const floor = IMPACT_RANK[failOn];
  if (!floor) throw new Error('--fail-on must be minor, moderate, serious, or critical');
  return violations.filter((violation) => (IMPACT_RANK[violation.impact] ?? 0) >= floor);
}

function summarize(url, violations) {
  if (violations.length === 0) return `${url}: no blocking violations`;
  const lines = [`${url}: ${violations.length} blocking rule(s)`];
  for (const violation of violations) {
    const nodes = violation.nodes?.length ?? 0;
    lines.push(`- ${violation.impact} ${violation.id} (${nodes} node${nodes === 1 ? '' : 's'}) ${violation.help}`);
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

    let builder = new AxeBuilder({ page }).withTags(TAGS);
    for (const selector of args.include) builder = builder.include(selector);
    for (const selector of args.exclude) builder = builder.exclude(selector);
    const results = await builder.analyze();
    const failed = blocking(results.violations, args.failOn);
    const report = {
      url: args.url,
      tags: TAGS,
      failOn: args.failOn,
      violations: failed,
      incomplete: results.incomplete?.length ?? 0,
    };
    const json = JSON.stringify(report, null, 2);
    if (args.out) await writeFile(args.out, `${json}\n`);
    else console.log(json);
    console.error(summarize(args.url, failed));
    process.exitCode = failed.length === 0 ? 0 : 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
