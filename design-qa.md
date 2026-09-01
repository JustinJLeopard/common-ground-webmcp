# Image-to-code QA — Civic Ledger Field

Packet `WEBMCP-CG-VISUAL-INTERACTION-03`. Recorded against the live page in the
dedicated WebMCP Chrome profile, viewport **1440×900**, served from
`http://localhost:8100`.

## Source

| | |
|---|---|
| Selected source | `exec-ace12b66-d1ed-4578-85c9-46499187dcac.png` (generated original) |
| Source size | 1536×1024, 2.29 MB PNG |
| Content | Dark ink/teal contour field, copper mineral seams, dotted halftone bands |

## Transformation to shipped asset

`assets/civic-ledger-field.png` — 1200×800, **0.68 MB** (70% smaller).

Resized with Lanczos to 1200px (the shell is 1180px, so anything wider is
wasted bytes), then median-cut quantised to 128 colours with Floyd–Steinberg
dither. The image is almost entirely low-frequency dark teal gradient, so the
palette reduction is not visible at the opacity it is used at, and it removes
1.6 MB from a page a judge has to load.

No second decorative landscape was built in CSS or SVG. This raster is the only
scenic asset on the page, per the lease constraint.

## How it is used

It is a **background on `.studio` only** — depth behind the instrument, nothing
else. It carries no value, label, state or affordance.

Two implementation notes, both of which were bugs I had to see rendered to catch:

1. **First attempt used an absolutely-positioned `::before`.** The design
   detector correctly flagged `clipped-overflow-container`: `body` had
   `overflow-x: hidden`, which clips positioned children — tooltips and
   popovers that need to escape would have been cut off. Fixed by making it a
   plain background on the section and removing the `overflow-x` clamp
   entirely, then verifying no document overflow at 390px rather than masking
   it.

2. **First sizing used `background-size: cover`.** `.studio` is roughly 2200px
   tall, so `cover` scaled a 1200×800 image up about 3× and showed only its
   near-black top corner — the field was invisible and contributed nothing.
   Now `background-size: 100% auto`, which shows the actual contour band before
   the gradient fades it out.

## Contrast verification

The wash over the image is
`linear-gradient(180deg, rgba(9,22,17,0.62) → rgba(9,22,17,0.86) → var(--surface-deep))`.

Worst case measured against the **brightest pixel in the region the image
actually occupies** (`rgb(101,101,87)`, a copper seam), composited under the
0.62 wash → effective background `rgb(44,52,44)`:

| Foreground | Ratio | AA (4.5:1) |
|---|---|---|
| `--ink` `#eef4de` | 11.40:1 | pass |
| `--muted` `#c2d0bf` | 7.99:1 | pass |
| `--lime` `#cef36a` | 10.19:1 | pass |

`--muted` was raised from `#aab9a9` to `#c2d0bf` as part of this packet; the old
value did not clear AA on the stronger surfaces.

## Judgement: does it earn its place?

Partly, and it is worth being honest about the limit. The source is ink/teal;
Common Ground's identity is lime/green. The field cannot be made prominent
without fighting the product's own palette, so it is deliberately held at faint
contour texture — perceptible depth, no competition.

The real design change in this packet is **composition, not imagery**: the first
view is now the live decision (exact `$1,200,000`, `1/3` floors met, the unmet
floors naming their gaps, and the compromise control) instead of a display
headline over an eyebrow. The image supports that; it does not carry it. If the
asset were removed the page would lose some depth and none of its argument.

## Evidence

`artifacts/design-evidence/` — before/after at three named scroll checkpoints,
true 390×844 mobile, forced reduced-motion, and the rejection → find → apply
interaction sequence. `artifacts/design-evidence.json` records measurements and
sha256 for every file.
