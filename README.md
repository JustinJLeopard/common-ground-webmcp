# Common Ground

**Common Ground** is a polished, deterministic WebMCP collaboration studio for a fictional community-budget decision. A person and an agent work on the same state: five named commitments, a fixed **$1.20M** budget, and three transparent stakeholder floors. The app—not an LLM—enforces every constraint and calculates every result.

> Rivermark, its people, and all figures are fictional. This is a product prototype demonstrating transparent human-agent collaboration patterns, not a civic decision system or policy recommendation.

## Why this is a WebMCP product

The point is not a chat box beside a dashboard. Common Ground registers six typed, discoverable imperative WebMCP tools with `document.modelContext.registerTool()` at page load. Human controls and WebMCP tool calls run through the same deterministic state engine, so a judge can watch an agent:

1. inspect the current allocation and missing commitments;
2. attempt a tempting allocation that the budget rule rejects;
3. request a feasible compromise from the application’s fixed-grid solver;
4. apply that recommendation to the same live scenario; and
5. see the budget, floors, score, visible UI, and readable activity trail change together.

The page uses feature detection. It remains fully usable in an ordinary browser, but the WebMCP status pill makes the distinction explicit.

## Tool catalog

| Tool | State effect | Purpose |
| --- | --- | --- |
| `get_scenario_state` | Read-only | Returns allocations, budget, stakeholder floors, issues, and score. |
| `set_allocation` | Mutation | Sets one named commitment in $5,000 increments; rejects invalid values or overspend. |
| `evaluate_tradeoffs` | Read-only | Returns the deterministic score and every visible constraint. |
| `find_feasible_compromise` | Read-only | Searches the fixed allocation grid for a valid compromise. |
| `apply_compromise` | Mutation | Applies the pending deterministic recommendation to shared state. |
| `reset_scenario` | Mutation | Restores the seeded human starting draft. |

## Local run

This repository intentionally has **no third-party runtime dependencies**.

Prerequisites: **Node.js 20 or newer with npm**, plus **Python 3** for the
local static server. From the directory that contains your clone:

```bash
cd common-ground-webmcp
npm test
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

For a live WebMCP check, use Chrome with WebMCP enabled (the host has a dedicated Chrome 151 profile/launcher) and a secure or potentially trustworthy context. `localhost` is suitable for local development; the challenge’s later live URL must use the required public HTTPS-compatible route. Do not use `file://` or `about:blank` as a WebMCP test page.

## Demo journey (about 2.5 minutes)

1. Start on the human draft: it spends the full budget but leaves two stakeholder floors unprotected.
2. Use the visible **Try an over-budget move** control, or have an agent call `set_allocation`, to show that the $1.20M limit rejects a tempting increase.
3. Have the agent call `get_scenario_state` and `evaluate_tradeoffs`; point to the visible activity trail and exact floor deficits.
4. Call `find_feasible_compromise`. The deterministic solver returns the candidate set, its deltas, score, and candidate count.
5. Review the visible recommendation with the human, then call `apply_compromise`.
6. The page moves to **Feasible**: every dollar is assigned, all three floors are protected, and the before/after state is readable in the interface.

## Accessibility and reliability

- Semantic headings, buttons, table structure, form labels, live feedback, and a skip link.
- All allocation controls work by keyboard; no drag-only interaction.
- Stakeholder state always has text and symbols in addition to color.
- The allocation table is the primary non-visual equivalent for the visual meters/cards.
- Respects `prefers-reduced-motion` and `prefers-contrast: more`.
- All computations use bundled, deterministic fixture data. No network calls, account state, external data, or hidden model decision changes the scenario.
- The activity log makes human and agent actions inspectable inside the product.

## Testing

`npm test` runs Node’s built-in test runner against the shared model. It covers:

- the seeded human draft;
- an over-budget rejection;
- deterministic feasible-compromise selection;
- valid solver output and stable proposal identities.

`npm run verify` checks the expected source files, imperative WebMCP registration, and all required tool names.

## Challenge/publication state

- **Source:** local, created for the WebMCP Challenge campaign.
- **License:** MIT; see [`LICENSE`](LICENSE).
- **Deployment:** not performed.
- **Public repository:** not created/published.
- **Custom domain, DNS, credentials, video upload, Devpost entry, and final submission:** not performed and remain explicit Justin gates.

The current official challenge sources are [OpenAI’s WebMCP Challenge page](https://openai.com/webmcp-challenge/) and the [governing Devpost rules](https://webmcp.devpost.com/rules). The official rules require a public source repository, working live URL, open-source license, and public audio-enabled YouTube demo shorter than three minutes. Confirm the signed-in submission form’s exact fields before final submission.

## License

MIT © 2026 Justin Leopard.
