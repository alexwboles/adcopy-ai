# AdCopy AI

**Describe your business. Get ready-to-run ads in seconds.**

AdCopy AI is a free, single-page web app that writes Google Search ads and Facebook ads for small businesses. No sign-up, no API keys, no server — everything runs locally in your browser and your data never leaves your device.

## The problem

Small business owners know they should run ads, but writing ad copy is slow, the character limits are fiddly (30-char headlines!), and hiring a copywriter costs money they don't have.

## The solution

Type a plain-English description of your business, pick a tone and a call-to-action, and AdCopy AI generates:

- **Google Search ad** — 3 headlines (≤ 30 chars) + 2 descriptions (≤ 90 chars), with **live character counters** that turn red over the limit
- **Facebook ad** — primary text + headline + link description
- **3 tone variants** — Friendly, Bold, Professional; regenerate for fresh variants
- **CTA picker** — Shop Now, Call Today, Book Online, Get a Free Quote, Learn More, Visit Us
- **Live best-practice checklist** — 8 checks (length limits, keyword use, CTA presence, benefit/number mention, no ALL-CAPS, no unproven superlatives, FB length ideal) re-validated as you type
- **Copy-to-clipboard** per ad block, and **saved campaigns** in `localStorage`
- **Optional AI polish** — paste an OpenAI API key in Settings and the app will try one AI pass; on *any* failure it falls back to the local engine and says so honestly. The key is never required.

## How to run

Just open the file:

```bash
open index.html            # macOS
# or serve it locally:
python3 -m http.server 8000
# then visit http://localhost:8000
```

No build step, no dependencies.

## How generation works

The engine is a deterministic template + heuristic system (`js/logic.js`, pure functions, zero DOM):

1. **Keyword extraction** — `extractKeywords(text)` tokenizes your description, drops stopwords and pure numbers, and ranks content words by frequency (ties broken by first appearance). The top keyword fills the `{keyword}` slot.
2. **Slot filling** — each tone owns a bank of short templates (`js/copybank.js`) with slots `{keyword}`, `{business}`, `{benefit}`, `{cta}`, `{number}`. Templates whose slots can't be filled (e.g. `{number}` with no number in your description, `{business}` with no name given) are skipped rather than rendered half-empty — the engine never invents facts.
3. **Limit fitting** — `fitTo(text, limit)` trims at clean word boundaries (dropping trailing clauses first) so Google's 30/90 limits always hold.
4. **CTA guarantee** — if no generated line contains your chosen CTA, it's appended to a description within the limit.
5. **Validation** — `validateCopy()` scores the final copy against all 8 checklist items and returns `{id, label, pass, detail}` per item; the UI re-runs it on every keystroke.

## Tests

```bash
bash test/smoke.sh   # structural checks: files exist, node --check, bank size, basic generation
bash test/e2e.sh      # real logic flows: tone distinctness, limit/ALL-CAPS detection, CTA insertion, keyword extraction, empty-input safety, regeneration variance
```

## Pricing idea

- **Free** — unlimited ad generation, everything above. Free forever.
- **Pro ($9/mo)** — a possible future tier: multi-campaign workspaces, brand voice memory, one-click export to Google/Facebook Ads formats. The core generator stays free.

## License

MIT — do whatever you want with it.
