# Hands-on accessibility lab

**Run → inspect → fix → rerun → check manually.** This small workshop page uses
local HTML, CSS and an inline illustration: no server, CDN, account or network
request is needed for the scan after dependencies and Chromium are installed.

Open [inaccessible.html](inaccessible.html) in your browser, then compare
[accessible.html](accessible.html). Both pages have the same content and demo
interactions; no booking or email is sent. The first page is intentionally broken.

## 1. Run the existing CLI

From the repository root, follow the [installation steps](../README.md#quick-start):

```sh
npm ci
npx playwright install chromium
```

The following command works in PowerShell and POSIX shells. It converts the local
path to an absolute file URL, runs the existing CLI, and propagates its exit code:

```sh
node -e "const {pathToFileURL}=require('node:url'); const {resolve}=require('node:path'); const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['axe-check.mjs',pathToFileURL(resolve('examples/inaccessible.html')).href,'--out','demo-before.json'],{stdio:'inherit'}); process.exit(r.status ?? 2)"
```

Expected exit: **1**, with blocking findings in the terminal and a JSON report in
`demo-before.json`. Immediately inspect the status with `$LASTEXITCODE` in
PowerShell or `echo $?` in a POSIX shell. A failing scan is the intended first step.
If your shell stops on errors, run the exercise commands individually.

This is equivalent to `node axe-check.mjs <absolute-file-URL> --out demo-before.json`.
The wrapper only handles the platform-specific file URL and process invocation.

## 2. Inspect the evidence

```sh
node -e "const r=require('./demo-before.json'); for(const v of r.violations) console.log(v.id,v.impact,v.nodes.map(n=>n.target),v.helpUrl); console.log('blocking rules:',r.blockingViolations.length,'review rules:',r.incomplete.length)"
```

Open the JSON too: each node contains its HTML and `failureSummary`. Follow
`helpUrl` for rule guidance. Counts refer to rules, not the number of elements.

| Finding | Where to look | Repair in the counterpart |
| --- | --- | --- |
| `image-alt` | `#venue-map` | Supply meaningful text for the informative map. |
| `label` | `#email` | Associate a visible label with the input using `for="email"`. |
| `button-name` | `#reserve` | Use descriptive visible button text. The arrow is hidden from assistive technology. |
| `color-contrast` | `#email-hint` | Replace pale gray on white with readable dark text. |

With the committed lockfile and default settings these four rules block the scan.
Rule details can change with axe/browser upgrades; the tests protect these teaching
expectations. `violations` retains all findings, while `blockingViolations`
determines exit 1 at the selected threshold (default: serious).
`incomplete` means human review is needed, not a confirmed violation.

## 3. Make the fixes

Copy `examples/inaccessible.html` to `examples/practice.html`, leaving it beside
`styles.css`. Edit your copy:

1. Add the map's descriptive `alt` from the counterpart (check it against the image).
2. Add `<label for="email">Email address</label>` before the input.
3. Replace the arrow span with the words `Reserve a place`.
4. Remove `class="broken"` from the body to use the readable hint color.

Run the first command again, replacing `inaccessible.html` with `practice.html`
and `demo-before.json` with `demo-practice.json`. Expect exit **0** for the gate,
but keep going: the arrival-details control is still a clickable div. Try reaching
and activating it using only Tab, Enter and Space. The default axe scan does not
catch that missing keyboard behavior in this example.

Replace the div with a native `button type="button"`, add
`aria-expanded="false"` and `aria-controls="details"`, and update
`aria-expanded` when toggling the details. Add `role="status"` to the confirmation
paragraph so the reservation feedback can be announced. Compare the final markup
and toggle handler with `accessible.html`.

## 4. Rerun the corrected counterpart

```sh
node -e "const {pathToFileURL}=require('node:url'); const {resolve}=require('node:path'); const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['axe-check.mjs',pathToFileURL(resolve('examples/accessible.html')).href,'--out','demo-after.json'],{stdio:'inherit'}); process.exit(r.status ?? 2)"
```

Expected exit: **0**, with empty `violations`, `blockingViolations` and
`incomplete` arrays. Inspect the report as before, using `demo-after.json`.
Rerun your practice page too after the interaction fixes.

Exit **2** means a setup/argument/scan/write error; fix it before interpreting
results. Exit **3** is reserved for incomplete findings when `--strict-review`
is enabled and nothing blocks. See the [full output contract](../README.md#output-contract).
Do not hide findings with exclusions or raise the threshold to simulate a repair.

## 5. Check what the scan cannot establish

**Automated axe scanning is evidence, not proof of complete WCAG conformance.**
Exit 0 says this configured gate passed for one rendered page state. It does not
certify the page, its interactions, or a whole website. The corrected counterpart
is a teaching example, not a conformance claim.

- **Keyboard and focus:** Tab through email, arrival details, reserve and the
  comparison link. Activate buttons with Enter and Space; confirm focus is visible,
  follows a sensible order, and stays on the details button when content expands.
  Repeat after collapsing it.
- **Screen reader:** Check the page heading, visible email label and description,
  map alternative, button names, expanded/collapsed state and reservation
  announcement. Confirm the actual reading order and usability with your
  browser/screen-reader combination.
- **Meaning and feedback:** Decide whether the map text conveys what a visitor
  needs. A syntactically present alternative can still be unhelpful. This demo has
  no real submission or validation; a real booking flow also needs accessible
  validation errors, recovery and completion feedback.
- **Zoom and reflow:** Try 200% text/zoom and a viewport about 320 CSS pixels wide
  (or 400% zoom from a 1280px-wide viewport). Check clipping, horizontal scrolling,
  readable text, focus indicators and usable controls.
- **States and journeys:** Check expanded details and confirmation after clicking.
  The CLI opens a fresh page and does not activate these controls. Real products
  need checks across routes, responsive layouts and complete user journeys, plus
  evaluation with people with disabilities.

The automated suite scans both whole pages via local file URLs, verifies the
four blocking rule IDs and useful node evidence, and checks the corrected page
under strict review. It also checks native keyboard interaction and feedback on
the corrected page. Those checks support this lab; they do not replace the manual
evaluation above.

Run `npm test` to include the lab alongside existing CLI and contrast regressions.
Delete your practice copy and generated demo reports when you finish.
