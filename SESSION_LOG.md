# Session log

## 2026-07-15 — Georgia Utility Creditworthiness Simulator

### Objective

Analyze the source creditworthiness workbook and validated Georgia utility dataset, then create an interactive simulator that exposes the model, evidence, assumptions, and sensitivity to user-controlled inputs.

### Source audit

- Reverse-engineered the four workbook sheets and selected **Basis for index score** as the canonical implementation: 23 factors, scores from 0 to 4, weights totaling 100, and a 400-point maximum.
- Confirmed that the displayed factor values produce 196/400, or 49.0, while a separate static workbook cell reports 48.5.
- Audited `georgia_validated_data.csv`: 345 observations, 12 utility IDs, nine indicators, and coverage from 2014 through 2024.
- Sourced Georgia's 2025 absolute poverty rate of 7.1% from Geostat. Poverty is the only directly evidenced factor in the strict 23-factor baseline; the other 22 initial values remain workbook assumptions.

### Product decisions

- Named the interface **Utility Creditworthiness Simulator**.
- Used the headline “Explore the drivers of water utility creditworthiness.”
- Added plain-language definitions to all 23 factors.
- Kept operational CSV evidence separate from financial factor inputs to avoid invalid proxy substitutions.
- Adopted provisional score bands: 75–100 indicatively creditworthy, 60–74 potentially creditworthy, 40–59 below threshold, and 0–39 high concern.
- Added a reliability condition of 17/23 evidenced inputs before presenting a score as a dependable creditworthiness indication.
- Removed the workbook-comparison delta card because it added confusion without decision value.

### National utility ranking

- Added a highest-to-lowest operational evidence ranking using continuity (30%), water quality (25%), metering (20%), complaints per 1,000 connections (15%), and regulatory compensation per connection (10%).
- Renormalized available weights, required at least three current measures, excluded observations more than five years old, and displayed coverage and source-year ranges.
- Labeled the ranking as operational rather than financial creditworthiness because comparable utility financial ratios are absent.

### Implementation

- Built a dependency-free application in `index.html`, `styles.css`, and `app.js`.
- Added presets, live factor scoring, sensitivity analysis, utility/year filters, CSV aggregation, data-coverage disclosures, and responsive layouts.
- Documented workbook conflicts, threshold rules, data gaps, and recommended due-diligence inputs in `MODEL_ANALYSIS.md` and `README.md`.

### Verification

- Confirmed all 23 factor cards and definitions render.
- Confirmed baseline score 49.8, upside preset 100.0, stress preset 3.0, and reset returns to 49.8.
- Confirmed all 345 CSV observations load, with 12 utilities and nine context metrics represented.
- Confirmed national ranking renders all utilities, leaving insufficient-evidence utilities unranked.
- Tested desktop and mobile layouts in Chromium.
- Completed browser interaction tests with no JavaScript page errors.

### Outstanding limitations

- Twenty-two baseline credit factors still require utility-specific audited or operational evidence.
- Workbook definition conflicts and boundary ambiguities need stakeholder resolution.
- Provisional score bands and operational-ranking weights are not empirically calibrated to defaults or external agency ratings.
- The transitional utility IDs in the CSV remain separate because no authoritative entity-resolution rule was supplied.

## 2026-07-16 — Philippines page, creditworthiness ranking, WaterCRED rename

- Renamed the platform back to **WaterCRED** (titles, brand, meta, footers, README).
- Split `app.js` into `core.js` (shared engine) + `georgia.js` / `philippines.js` country configs; each page calls `initApp(config)`. Georgia behavior verified unchanged (49.8 default, 49.0 workbook preset).
- Fixed the broken Georgia CSV fetch (`georgia_validated_data.csv` had moved to `data/`).
- Added `philippines.html`: full simulator seeded with PSA's 2023 poverty incidence (15.5%) and five COA/LWUA portfolio medians (default score 53.0 = 212/400), evidence explorer over `data/philippines_validated.csv` (1,610 observations · 57 water districts · 2009–2024, PHP-million rows normalized at load), and an evidence-based **creditworthiness ranking**: renormalized 23-factor model, up to 9 evidenced factors per utility, ≥5 required to rank, ≤5-year recency, same-year derived ratios, current-ratio liquidity bands, negative equity scored 0 on leverage.
- Added a Georgia/Philippines country switcher to the top bar of both pages.
- Verified: Manaoag Water District hand-recomputation matches the UI (74.3, 9/23 factors); negative-equity districts render finite scores; no console errors.

## 2026-07-16 (later) — Ranking threshold lowered, district map added

- Lowered the Philippines ranking minimum from 5 to 4 evidenced factors (user decision): 29 of 57 districts now rank at year 2023 (previously 12). Disclosure texts updated in page, method notes, and README.
- Added a "District map by rating" block to the Philippines evidence section: inline SVG, Natural Earth 50m country outline (public domain), markers at approximate municipal centroids colored by rating band, unranked districts in gray, click/keyboard selects the utility in the evidence explorer. New `phl-map.js` holds the outline and 57 district coordinates. Ambiguous district names resolved via LWUA/COA records: Taytay = Palawan, Plaridel & Santa Maria = Bulacan, Buenavista = Agusan del Norte.
- Georgia page regression re-verified (49.8 default score, ranking unchanged, no console errors).

## 2026-07-16 (later) — District map reworked to boundary polygons

- Replaced the map's centroid markers with actual municipal boundary polygons (GADM 4.1 level-2, Douglas-Peucker simplified to ~250 m, stored locally in phl-map.js), colored by rating band; Manila Water approximated by its seven NCR east-zone cities. All 57 districts matched and province-verified.
- Visibility pass: lighter land fill against the dark evidence section, larger map (620px flex basis), sticky legend, thicker strokes so small municipalities stay visible, hover/focus highlight in white.

## 2026-07-16 (later) — Ranking factor transparency (meeting feedback)

- Feedback addressed (WaterCRED review meeting): show the indicators behind each utility's rank, the absolute values behind each position, which indicators are commonly available (financial vs technical), COA vs LWUA sourcing, sample sizes behind medians, and first-time-user intuitiveness. Pure surfacing change — no scoring rule touched.
- Each Philippines ranking row is now an expandable `<details>` with a factor-breakdown table: value, 0–4 band points, weight, weighted points, data year, source institution (COA / LWUA / Manila Water) + verification level + derived-ratio note; missing factors listed explicitly. Unranked rows show what evidence exists and how many more factors are needed. Open state survives year changes.
- Selecting a utility in the evidence explorer renders the same breakdown in a new `#utilityDetail` panel (dropdown, ranking-name click, and map click all route there).
- Added an "Indicator coverage behind the ranking" table computed at runtime by re-running the scorer's own compute closures over all districts, so counts match ranking semantics exactly (≤5-year recency, same-year derived ratios). At 2023: O&M coverage 34/57, debt/equity 33, employee cost share 26, EBITDA 25 (mostly derived), NRW 21, electricity 14, staff/1,000 10, collection efficiency 7, liquidity 6.
- Simulator median source labels now carry documented sample sizes (n=36/21/26/17/7).
- core.js changes are guarded (`row.factors` presence, `#utilityDetail` existence, additive 4th `onRanking` arg) so Georgia renders unchanged. Mobile fix: the `.ranking-row > :last-child { display:none }` rule would have hidden the new chevron — replaced with class-based selectors valid on both pages.
- Disclosures updated in the same commit: ranking note + "How is the ranking computed?" details (philippines.html), README ranking-method section, this entry.

## 2026-07-17 — Philippines rebuilt: ranking + filters + province map + methodology; Georgia hidden

### Scope (user request)
Keep only the ranking and the map on the Philippines page; add a methodology + per-indicator explanation; add filters beside the ranking for utility **size** (official PHL/LWUA definition) and **admin geography**; hide Georgia for now. Map delivered as an **admin-2 (province) choropleth** per user follow-up (not admin-1).

### Dataset
- `data/philippines_validated.csv` was updated upstream: now **52,471 observations · 519 water utilities · 2012–2025** (was 1,610 · 57), almost entirely COA Annual Audit/Financial Reports plus LWUA and Manila Water. Columns `utility_id, utility_name, year, indicator_id, value, unit, source_institution, verification_level` still drive everything.

### Page restructure
- Removed the scenario simulator, sensitivity chart, and evidence explorer from the Philippines page. Kept the ranking and map, added a methodology section.
- **`philippines.js` is now a standalone app** (loads `core.js` only for the shared `factors` / `factorDefinitions` / `parseCSV` / `compact` / `clamp`, and `phl-geo.js` for geodata). It no longer calls `core.js` `initApp`. **`core.js` and `georgia.js` were left untouched**, so the hidden Georgia simulator is unchanged (workbook preset re-verified at exactly **49.0**).
- Performance: observations are indexed per utility at load (`obsByUtil`) and per-year ranking results are cached, so scoring 519 utilities against 52k rows and re-filtering are both instant.

### Filters (beside the ranking)
- **Size (LWUA):** official Local Water District categories from the DBM/LWUA *Revised Manual on Categorization* (2011) by active service connections — A ≥30,000 (Very large), B ≥10,000 (Large), C ≥3,000 (Medium), D <3,000 (Small). Each utility is classified from the **median** of its reported `OPS_CONNECTIONS_TOTAL` (dampens single-year spikes, e.g. Bayugan/Metro Lipa where population appears mislabeled as connections). Only ~170 of 519 report connections; the rest are "size unknown" (user chose "official only + unknown").
- **Region (admin 1)** and **Province (admin 2)** dropdowns (province cascades from region); year cut-off dropdown. Rank shown is the national position; filters narrow the list without re-ranking.

### Geography / map
- Province boundaries from **geoBoundaries gbOpen PHL ADM2 (CC-BY 4.0)**, simplified (Douglas–Peucker ~1 km, 3-decimal quantization, outer rings) into `phl-geo.js` (all 87 provinces, ~6.5k vertices, 133 KB). Replaced `phl-map.js` (the 56 municipal district polygons), which was deleted.
- **`utility → province → region` mapping (all 519)** is compiled/approximate: built from utility names + IDs matched against the PSGC 2019 gazetteer, with rule-based handling of "METRO/METROPOLITAN/NHA" prefixes, city spellings, "GEN/PRES/STA/STO" abbreviations, and province hints in IDs, plus a hand-checked override table for ~45 genuinely ambiguous same-name districts (disclosed as not an official field). "DAVAO" in PSGC bridges to the geoBoundaries "Davao del Norte" polygon.
- **Choropleth:** each province shaded by the **median creditworthiness of its ranked utilities**, honoring the active size/region filters; provinces with no ranked utility are grey. Clicking a province filters the ranking to it and syncs the dropdowns.

### Methodology section
- Index formula + score bands + LWUA size scale + provisional rule.
- **23-indicator reference table** rendered from `core.js` `factors` + `factorDefinitions` + workbook formulas/sources (from the xlsx): definition, group, formula, weight, 0–4 score bands (reconstructed from each factor's own scoring function), and typical source. The nine ranking-eligible factors are flagged.
- Kept `debt_equity` as the derived `FIN_TOTAL_LIABILITIES ÷ FIN_EQUITY × 100` (the CSV's `FIN_DEBT_TO_EQUITY` is a bare ratio, e.g. 0.45, which the workbook's percentage bands would misread — so the direct column is intentionally not used).

### Georgia hidden
- `git mv index.html georgia.html` (preserved, unlinked; its country-switch self-link repointed to `georgia.html`). New `index.html` redirects to `philippines.html` (meta-refresh + `location.replace`). Country switcher removed from the Philippines page.

### Verification (browser, local server)
- 52,471 obs · 519 utilities load; **165 rank at 2023** (354 unranked); scores span 0–100; no console errors.
- Size filter (Very large → 19 ranked), region filter (Central Luzon), province cascade, map province-click (Pampanga → 5 ranked, province highlighted), reset, and row expansion (9-factor breakdown) all verified.
- Map renders all 87 provinces (75 interactive); legend side-by-side at desktop width, stacked on narrow. Indicator table renders 23 rows with correct bands. Georgia regression: workbook preset 49.0, 23 cards, 12 ranking rows, no errors. `/` redirects to the Philippines page.

### Attributions added
geoBoundaries (CC-BY 4.0) and PSGC 2019 in the page footer, map note, README, and CLAUDE.md.

### Follow-up refinements (same day)
- **Ranking now lists ranked utilities only** (unranked rows removed); region/province filter options and map interactivity are restricted to provinces/regions with ranked utilities. Count reads "N ranked utilities".
- **Map made smaller** (SVG flex-basis 620→430 px) with a **hover/focus readout** card beside it (`#mapReadout`, `aria-live`): shows province name · region · median · band · ranked count; resets on mouse-leave. Native `<title>` retained. Only provinces with a ranked utility under the current filters are colour-filled and clickable.
- **Removed** the intro "Decision-support prototype — not a credit rating" note and the "Known workbook ambiguities" methodology `<details>` (per user request; the disclaimer remains in the ranking note and README).
- Verified: 165 ranked rows only, no unranked; map readout returns correct values on hover (Abra/Batangas/Cebu/Iloilo/Palawan); no console errors.

## 2026-07-18 — Published to GitHub Pages behind a cosmetic access gate

- Added `gate.js` + an overlay (`#wc-gate`) to `philippines.html` and `georgia.html`: prompts for a shared access password (provided to the team separately — deliberately NOT stored in the repo), checked client-side against a SHA-256 hash and remembered per browser session (`sessionStorage`). A short `<head>` script pre-applies `html.wc-unlocked` so already-unlocked sessions never flash the gate. Gate styles in `styles.css`.
- **Explicitly a cosmetic gate, not security** (user acknowledged): a public GitHub Pages site serves its source, scripts and `data/*.csv` to anyone, so the gate only deters casual visitors and is bypassable by reading the source or fetching files directly. Real protection would need server-side auth (different host).
- Added `.nojekyll` so Pages serves every file verbatim.
- Published: created public repo **ademenezes/watercred**, pushed `main` (needed `http.postBuffer` raised for the 21 MB CSV), enabled GitHub Pages from `main`/`/`. Live at **https://ademenezes.github.io/watercred/** (root redirects to `philippines.html`). Verified all assets return 200 and the gate ships; gate unlock/relock and content render verified on localhost (same secure-context/`crypto.subtle` behavior as Pages HTTPS).
- Note: the site (incl. the 21 MB CSV and the methodology `.xlsx` workbook) is now public; the methodology is already disclosed on-page, but the workbook can be untracked later if that filename shouldn't be public.
