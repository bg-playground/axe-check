import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const html = await readFile(new URL('../fixtures/contrast.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
try {
  const page = await context.newPage();
  await page.setContent(html);
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const targets = results.violations.flatMap((rule) =>
    (rule.nodes ?? []).map((node) => (Array.isArray(node.target) ? node.target.join(' ') : '')),
  );
  const failed = targets.some((target) => target.includes('#fail'));
  const passed = targets.some((target) => target.includes('#pass'));
  if (!failed || passed) {
    console.error(`color-contrast test failed: targets=${targets.join(', ') || 'none'}`);
    process.exit(1);
  }
  const node = results.violations[0]?.nodes?.find((item) =>
    (item.target ?? []).join(' ').includes('#fail'),
  );
  console.error(`color-contrast test passed: #fail flagged, #pass clean`);
  console.error(node?.failureSummary?.split('\n').map((line) => line.trim()).find((line) => line.startsWith('Element')) ?? '');
} finally {
  await context.close();
  await browser.close();
}
