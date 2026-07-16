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
