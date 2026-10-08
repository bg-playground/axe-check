# axe-check

One file. One URL. A WCAG 2.1 A/AA scan with Playwright and axe-core. Fails the process when a serious or critical violation is found.

Star if this replaced a 40-line workflow file.

```bash
npm install
npx playwright install chromium
node axe-check.mjs https://example.com
```

Exit `0` when nothing at or above the fail level is found. Exit `1` when violations block. Exit `2` on bad arguments or a page that never loads. A short summary goes to stderr. The JSON report goes to stdout, or to `--out`.

```bash
node axe-check.mjs https://example.com --include "#main" --exclude "#chat" --fail-on serious --out axe-report.json
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--include` | whole page | CSS selector, repeatable |
| `--exclude` | none | CSS selector, repeatable |
| `--fail-on` | `serious` | `minor`, `moderate`, `serious`, or `critical` |
| `--timeout` | `30000` | Navigation timeout in milliseconds |
| `--out` | stdout | Write the JSON report here |

Automated scans do not prove WCAG conformance. They catch the rules axe can see. The same scan, wired into a product workflow, is what [nat-testing.io](https://nat-testing.io) runs. More at [BradGuider.com](https://BradGuider.com).
