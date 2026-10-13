# AdCopy AI — Redesign Audit (2026-10-13)

## Competitors researched (3–5)
1. **Google Ads RSA editor** (screenshot: staging.loganix.com RSA editor, 2025) — Left asset rail (Final URL, Display path, Headlines 0/15 cards with per-field char counters and collapse), right sticky **live preview** panel with mobile/desktop toggle + "Highlight ad" switch, top **Ad strength** ring ("Incomplete") + suggestion list ("Add more headlines · View ideas", "Include popular keywords · View ideas").
2. **Meta Ads Manager** (facebook.com/business/help, 2026) — Guided creation flow; ad preview always on the right of the ad during creation; delivery/status columns; Creative (primary text, headline, description, CTA, destination); multiple text options rotated.
3. **AdCreative.ai** (reviews, 2026) — Every creative gets a **0–100 conversion-probability score**; brand kit (brand, category, logos, custom fonts); hundreds of scored variations; CTR-optimized hierarchy (benefit-first headline, dominant CTA).
4. **Copy.ai / Jasper** (richads.com comparison, 2026) — Platform-specific format enforcement, tone controls, brand voice; Copy.ai's guided campaign brief flow.
5. **OpenAdKit** (open-source Meta/Jasper alternative) — Creative-score optimizer: 5-lever score + named fixes + predicted CTR band; brand brain auto-extracted from URL.

## Visual gaps vs competitors
- Current layout is a generic two-column "brief left / outputs right" card stack — reads as a form page, not an ad platform console. Google/Meta always show the ad preview as a first-class pane; here previews are buried in a long scroll of panels.
- No "ad strength" style scoring surface (we have a QA score but it sits inside a small collapsible panel, not the hero metric). AdCreative.ai/Google put the score ring front and center.
- Typography: Inter-only body; Google Ads uses a tighter info-dense system type scale with tabular numerals. Counters are small muted text; Google puts "0/15" counters bold inside each asset card.
- Buttons are uniform `ghost` pills; no clear primary action hierarchy (Generate vs Export all look similar).
- No campaign list/navigation — Meta Ads Manager is a campaign table with status; our "Saved campaigns" is a bottom afterthought.
- Rounded edges exist in places → violates Alex's no-rounded rule; must be squared.

## Functional gaps (prioritized: what makes it feel like real software)
1. **No ad-strength surface** — have `qualityScore`, but no ring + per-factor "View ideas" suggestion list (Google's top pattern). HIGH.
2. **No campaign table** — saved campaigns lack status/dates/sort; Meta shows campaign rows with status chips. MEDIUM-HIGH (we have save/search/duplicate — elevate into a table with status + dates).
3. **No asset-level editing like Google Ads** — RSA pool is a flat list; Google shows Headlines 0/15 with per-asset counters and the pinned core concept. MEDIUM (make RSA pool two-column with live counters + pin/duplicate).
4. **No desktop/mobile preview toggle** — Google's preview panel has device toggles + "Highlight ad". MEDIUM.
5. **Tone variants buried** — regenerate is button-based; Google/Meta show all text options simultaneously for rotation. LOW (keep; export covers A/B).
6. **No per-asset CTR/prediction hints** — AdCreative.ai scores creatives; our checklist is per-ad. LOW (surface per-asset weakness hints in the RSA panel instead of inventing a score model — honest, computed from existing validation rules).

## Concept (1 paragraph)
**"The campaign console."** A Google-Ads-editor-style dense console: dark slate command bar with campaign picker + live-offline badge; left asset rail styled like Google's setup cards (Brief, Display path, Tone & CTA) with bold 0/15-style counters inside each card; center column is the **asset pool** — editable headline/description asset cards with per-asset char counters; right sticky **preview stack** with device toggle (desktop SERP / mobile feed) and a "Highlight ad" switch; top strip carries the **Ad Strength ring** with Google-style improvement suggestions ("Add more headlines · View ideas" → scrolls to the pool). Solid Google-Ads blue (#1a73e8-family) as the single accent on light gray console chrome (#f1f3f4); squared corners everywhere; tabular figures for counters; tabular serif-free UI type (Inter deliberately, like Google).

## Bug fixes found during audit
- None in logic (tests green). Visual: counters/CTA grid spacing on mobile; check after rebuild.

## What to preserve (test contract)
All existing IDs: rsa-card, rsa-headlines, rsa-descs, g-paths, export-ab, copy-rsa, ban-input, ban-add, ban-words, fit-limits, export-json, import-json, import-json-file, saved-notice, business, description, website, keywords, kw-chips, cta-picker, tone-bar, generate, regenerate, export-csv, hist-prev, hist-next, hist-label, google-card, g-url, g-headlines, g-descriptions, fb-card, fb-avatar, fb-page, fb-domain, f-primary, f-rest, fb-cta-btn, fb-creative-line, check-card, qa-score, qa-count, checklist, rsa-count, campaign-name, save-campaign, saved-search, saved-list, openai-key, ai-notice, polish; app.js fns renderBannedChips, addBannedWord, fitToLimits, exportJSON, importJSONFile, savedNotice, generateRSAAssets, adsToCSVAll, renderRsa, exportAB, copyRsa.
