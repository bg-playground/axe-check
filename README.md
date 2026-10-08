# axe-check

One file. One URL. A WCAG 2.1 A/AA scan with Playwright and axe-core. Fails the process when a serious or critical violation is found.

Star if this replaced a 40-line workflow file.

```bash
npm install
npx playwright install chromium
node axe-check.mjs https://example.com
```

Exit `0` when nothing at or above the fail level is found. Exit `1` when violations block. Exit `2` on bad arguments or a page that never loads. Exit `3` only when `--strict-review` is set and axe left rules incomplete. A short summary goes to stderr. The JSON report goes to stdout, or to `--out`.

Incomplete rules are printed with the first node and the reason. They do not fail the run unless you ask. A background image axe cannot measure is a review, not a red build.

```bash
node axe-check.mjs https://example.com --include "#main" --exclude "#chat" --fail-on serious --wait-for "#main" --tags wcag2aa,wcag21aa,wcag22aa --out axe-report.json
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--include` | whole page | CSS selector, repeatable |
| `--exclude` | none | CSS selector, repeatable |
| `--fail-on` | `serious` | `minor`, `moderate`, `serious`, or `critical` |
| `--wait-for` | `body` | Visible selector to wait for after `domcontentloaded` |
| `--tags` | `wcag2a,wcag2aa,wcag21a,wcag21aa` | Rule tags, repeatable or comma-separated. Replaces the default |
| `--strict-review` | off | Exit `3` when any rule is incomplete and nothing else failed |
| `--timeout` | `30000` | Navigation and wait timeout in milliseconds |
| `--out` | stdout | Write the JSON report here |

Automated scans do not prove WCAG conformance. They catch the rules axe can see. The same scan, wired into a product workflow, is what [nat-testing.io](https://nat-testing.io) runs. More at [BradGuider.com](https://BradGuider.com).
