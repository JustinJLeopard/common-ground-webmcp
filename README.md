# Common Ground

**Common Ground** is a polished, deterministic WebMCP collaboration studio for a fictional community-budget decision. A person and an agent work on the same state: five named commitments, a fixed **$1.20M** budget, and three transparent stakeholder floors. The app—not an LLM—enforces every constraint and calculates every result.

> Rivermark, its people, and all figures are fictional. This is a product prototype demonstrating transparent human-agent collaboration patterns, not a civic decision system or policy recommendation.

## Why this is a WebMCP product

The point is not a chat box beside a dashboard. Common Ground registers five typed, discoverable advisory WebMCP tools with `document.modelContext.registerTool()` at page load. The product has one deliberate handoff: **the agent prices and proves the tradeoff; the person commits it.** A judge can watch an agent:

1. inspect the current allocation and missing commitments;
2. attempt a tempting allocation that the budget rule rejects;
3. put an exact price on Care Link Rides at $225,000;
4. show the two exact reductions and every floor before and after; and
5. hand the proposal to a person, whose visible Apply action alone advances the shared revision.

The page uses feature detection. It remains fully usable in an ordinary browser, but the WebMCP status pill makes the distinction explicit.

## Tool catalog

| Tool | State effect | Purpose |
| --- | --- | --- |
| `get_scenario_state` | Read-only | Returns allocations, budget, stakeholder floors, issues, and score. |
| `preview_allocation` | Read-only | Asks what one named commitment would do at a given amount; returns the exact refusal for an invalid value or overspend. Never changes the scenario — only a person moves a commitment. |
| `evaluate_tradeoffs` | Read-only | Returns the deterministic score and every visible constraint. |
| `find_feasible_compromise` | Read-only | Searches the fixed allocation grid for a valid compromise. |
| `price_of_protecting` | Read-only | Answers “what would it cost to protect this?” with the exact swap, every floor before and after, and proof the budget still balances — or an honest refusal. Never mutates; applying is a human-only action. |

## Who can move the shared scenario

All five registered tools are read-only. The agent can read the scenario,
evaluate it, preview a change, search for a compromise, and price a protection.
It cannot apply a proposal, restore the draft, or write an allocation.

That is a capability boundary, not a policy. An earlier version registered a
`set_allocation` writer and relied on each individual write being validated —
range, $5,000 step, at or under budget. Every one of those checks passed while
an agent replayed a priced protection by writing the four amounts in
reduction-first order, arriving at the exact proposed allocation with no human
involved. Validating each step never constrained where the steps could lead.

So the agent writers are gone. `preview_allocation` returns the same truthful
answer, including the exact over-budget refusal, and mutates nothing. The
registered-handler regression executes every real tool and proves the shared
allocation bytes and revision stay unchanged. Direct human control remains:
the +/− buttons and number inputs can move a commitment, Restore creates a new
revision, and the two visible Apply controls commit only the proposal currently
shown for human review.

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

## The price of protecting something

The opening draft holds **Care Link Rides** — door-to-door rides to medical
appointments — at $100,000. Someone in the room says those rides cannot be cut.
Instead of arguing about whether that is affordable, ask the application.

Calling `price_of_protecting` with `{ proposalId: "care-link-rides", atLeast: 225000 }`
against the opening draft returns this exact swap, and nothing else:

| Commitment | Before | After | Change |
| --- | --- | --- | --- |
| Night Routes | $425,000 | $325,000 | **−$100,000** |
| Heatwave Commons | $350,000 | $250,000 | **−$100,000** |
| Corner Pantry Network | $225,000 | $225,000 | no change |
| Youth Maker Hours | $100,000 | $175,000 | **+$75,000** |
| Care Link Rides | $100,000 | **$225,000** | **+$125,000** |

The five commitments still sum to exactly $1,200,000. Every floor is reported
before and after: *Young people* moves from $35,000 short to protected,
*Older residents* from $21,250 short to protected, and *Outer blocks* stays
protected. Protecting the rides turns out to cost two named reductions and to
repair both broken floors on the way — which is the argument the room should
actually be having.

Ask for something the grid cannot do and the answer is a refusal, not a near
miss: `{ proposalId: "youth-maker-hours", atLeast: 305000 }` is inside that
commitment's own $75,000–$350,000 band, yet no allocation on the shared grid
reaches it without breaking the budget or a floor. The tool says so and returns
no allocation at all.

These figures are asserted by `npm test` against the model itself, so the table
above cannot drift into a persuasive number nobody re-derived.

## Demo journey (about 2.5 minutes)

1. Start on the human draft: it spends the full budget but leaves two stakeholder floors unprotected.
2. Have the agent preview Night Routes at $450,000. The application gives the exact $25,000 over-budget refusal, and revision 0 does not move.
3. Ask **what it costs to protect Care Link Rides at $225,000**. The agent calls `price_of_protecting`; the visible request, result, and activity trail all name the same commitment and minimum.
4. Read the proof: Night Routes falls by exactly $100,000, Heatwave Commons falls by exactly $100,000, the five commitments still total $1,200,000, and all three floors are protected.
5. Press **Apply this swap** as a person. The revision advances exactly once, the decision record identifies Human, and the page becomes feasible.
6. Finish on the readable activity trail. It separates the agent’s refusal and pricing from the person’s accepted decision. The generic compromise finder remains available as supporting advisory capability, not a second finale.

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
- valid solver output and stable proposal identities;
- an exact, still-balanced protection swap, and an impossible one refused rather than approximated;
- byte-equivalent determinism for the same protection question;
- the actual five-tool registration table and read-only annotations;
- a tool-only registered-handler sequence that leaves revision and allocations unchanged;
- Human Find/Apply, Human Price/Apply, monotonic Human Restore, and synchronized refusal controls;
- proof that the demo figures documented above match what the model returns.

`npm run verify` checks the expected source files, imperative WebMCP registration,
exactly five named tools, read-only annotations, and absence of human mutation
functions from the registered executor table.

## Challenge/publication state

- **Source:** local, created for the WebMCP Challenge campaign.
- **License:** MIT; see [`LICENSE`](LICENSE).
- **Deployment:** not performed.
- **Public repository:** not created/published.
- **Custom domain, DNS, credentials, video upload, Devpost entry, and final submission:** not performed and remain explicit Justin gates.

The current official challenge sources are [OpenAI’s WebMCP Challenge page](https://openai.com/webmcp-challenge/) and the [governing Devpost rules](https://webmcp.devpost.com/rules). The official rules require a public source repository, working live URL, open-source license, and public audio-enabled YouTube demo shorter than three minutes. Confirm the signed-in submission form’s exact fields before final submission.

## License

MIT © 2026 Justin Leopard.
