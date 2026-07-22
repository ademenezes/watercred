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

## 2026-07-22 — Search, indicator filter, Excel export, dataset indicator coverage

### New ranking controls (`philippines.html` / `philippines.js` / `styles.css`)
- **Search**: free-text input in the filter bar matching utility name, utility id, province name or region (case-insensitive), with a `<datalist>` autocomplete of all utility names. Feeds the same filter chain as size/region, so the map follows it too.
- **Indicator multi-select** (`#indicatorFilter`): a custom checkbox dropdown over the nine evidence-eligible factors. Semantics: a utility is shown only if it has evidence for **every** ticked factor (no scoring change — it narrows the list exactly like the other filters; national ranks unchanged). Summary label shows "All indicators / <name> / N indicators selected"; closes on outside click; reset clears it.
- **Reset** now also clears search + indicator selections.

### Export to Excel (`#exportBtn`)
- Dependency-free `.xlsx` writer added to `philippines.js`: OOXML workbook with inline strings inside a **stored (uncompressed) ZIP** built by hand (CRC-32 table, local + central directory records). No library, in keeping with the no-build-step constraint.
- Exports the **currently filtered, ranked** rows in three sheets: **Ranking** (rank, ids, geography, LWUA size, median connections, score, demo rating band, coverage, data years), **Factor detail** (one row per utility × evidenced factor: raw value, display value, 0–4 points, band, weight, weighted points, years, source), and **Export notes** (export date, every active filter, utility count, and the methodology disclaimers — renormalized indication / not a credit rating / approximate province mapping).
- Raw factor values are now kept on each factor detail (`value`) so the export can ship numbers, not just formatted strings.
- Verified outside the browser: a Node harness extracts the writer section verbatim from `philippines.js`, generates a workbook, `unzip -t` passes, CRC-32 check value (0xCBF43926) confirmed, and **openpyxl opens it** with correct sheet names, numeric cells and escaped special characters.

### Dataset indicator coverage (`#coverage`)
- New collapsible "Which indicators appear in the source reports?" section under the existing per-factor coverage: all raw CSV indicators (68), most common first, with utilities having ≥1 observation (n / 519 + share bar), observation counts and year span. Indicators that feed the nine ranked factors (directly or as derived-ratio components) are flagged **ranking input** via a fixed `RANKING_INPUT_IDS` set. Counts are whole-dataset (all years) and say so — deliberately independent of the ranking's ≤5-year rule, which the adjacent per-factor table already applies.
- Top of the list: FIN_NET_INCOME and FIN_REVENUE (519/519), FIN_CURRENT_ASSETS (518/519).
- Nav gained a **Data coverage** link; a small hash handler opens the `<details>` when navigated to (nav anchors into collapsed details would otherwise show nothing).

### Verification (browser, local server)
- No console errors on load; 165 ranked at 2023 unchanged. Search "cebu" → 3 ranked (Metro Cebu WD first); +NRW+EBITDA indicator filter → 2; reset restores 165 and clears controls; export produced `watercred_philippines_2023.xlsx` (18.5 KB blob, correct MIME); #coverage nav opens the details with 68 rows.

### Default year → 2025 (same day)
- `DEFAULT_YEAR` in `philippines.js` changed 2023 → 2025 so the page opens on the latest data year. **102 utilities rank at 2025** (vs 165 at 2023) — expected, as the ≤5-year evidence window shifts to 2020–2025 and 2024–25 filings are thinner. Verified in-browser: year filter loads showing 2025, 102 ranked, no console errors. README/CLAUDE.md updated (CLAUDE.md now also documents the new controls, element ids, and the library-free `.xlsx` writer constraint).

### Export gains an "Indicator data" sheet (same day)
- The Excel export now includes a fourth sheet, **Indicator data**, between Factor detail and Export notes: every validated observation up to the selected year for each exported utility — rank, utility, indicator id + name, category, year, value, unit, source institution (shortened), verification level. Sorted by rank, then indicator, then year (newest first). Values are the load-normalized ones (PHP million → PHP, million m³ → m³), disclosed in the Export notes sheet; non-finite values export as blank cells.
- Verified: at the 2025 default (102 ranked utilities) the sheet holds 15,684 observation rows and the workbook is ~10.3 MB (stored zip, built in ~0.9 s in-browser); spot-checked first row (Manila Water FIN_CAPEX 2024 = 23,600,000,000 PHP — normalization correct). A 16k-row stress workbook from the same writer opens in openpyxl with correct values.

## 2026-07-22 — Evidence age limit removed (all available data counts)

- **The five-year freshness window is gone** (per user request): each factor now uses the latest validated observation up to the selected "through year", however old. `MAX_AGE` removed from `philippines.js`; `latestObservation` no longer takes an age cap and `latestConsistentSet` walks the utility's own observation years downward with no floor. Derived ratios still combine same-year statements only, and the ≥4-factor minimum to rank is unchanged.
- Trade-off made explicit instead: the ranking note now says **no age limit** and points readers to the per-factor data years in each row breakdown; the coverage caption, missing-factor rows ("no validated observation through <year>"), Excel Export notes, README and CLAUDE.md all updated in this commit.
- Effect at the 2025 default: **252 ranked utilities** (was 102 under the 5-year rule; 251 at 2023) — utilities whose audited filings stop in 2018–2020 remain ranked on that older evidence, with the age visible per row (e.g. "Data years 2014–2020").
- Verified in-browser: 252 ranked at 2025 / 251 at 2023, old data years shown in breakdowns, updated captions render, no console errors.
- This commit also carries the parallel-session expansion to **13 evidence-eligible factors** (debt/CADS, DSCR, cash reserves, debtor days) and the staffing/connection **plausibility screen**, already documented in README ("Creditworthiness ranking method").

## 2026-07-22 — Ranking expanded to 13 evidence-eligible factors + staffing plausibility screen

### Four new factors (all direct CSV indicators, no derivation)
- `phlFactorInputs` grew from 9 to 13; `core.js` untouched (all four factors, bands and definitions already exist there). Mapping, verified against the CSV before wiring:
  - **Debt / cash available for debt service** (weight 9 — the model's highest) ← `FIN_DEBT_TO_CADS`, a bare ratio ("outstanding loans payable ÷ CADS"), matching the workbook's × bands.
  - **Debt service coverage ratio** (weight 7) ← `FIN_DSCR`, bare ratio.
  - **Cash reserves** (weight 4) ← `FIN_CASH_SUFFICIENCY` (cash ÷ OPEX × 100), scored with the workbook's % bands — disclosed as a demo convention via a `unitNote`, same pattern as liquidity.
  - **Debtor days** (weight 5) ← `FIN_ACCOUNTS_RECEIVABLE`, which is already denominated in days ("AR ÷ average daily billing") despite the monetary-sounding id (the PHP stock is the separate `FIN_RECEIVABLES`).
- Deferred (thin coverage): maintenance cost share (~14 utilities), bad-debt provision (~12, needs derivation), grant dependency (~4).
- Bookkeeping in the same change: the four ids added to `RANKING_INPUT_IDS`; coverage-confidence thresholds rescaled (High ≥10, Medium ≥7, Low ≥4 of 13); all hard-coded "9"/"nine" strings in `philippines.js` replaced with `phlFactorInputs.length`; prose counts and factor enumerations updated in `philippines.html` and README.

### Staffing/connection plausibility screen (motivating bug: Tiaong)
- User-reported: Tiaong WD showed **~787,758 staff per 1,000 connections**. Root cause is source data, not code: `INST_PERMANENT_EMPLOYEES` 2021 = 8,747,272 "people" — a peso amount misfiled as a headcount (Tiaong has no `FIN_STAFF_COSTS` row; the value has cost magnitude). Same error class found elsewhere: Digos City 2018–20 (24.7–28.2M "employees", with centavo decimals), Metro Roxas/Penablanca/Reina Mercedes 2023–24 (the report **year** copied into the value), Bayugan 2019 (connections 319,878.42 — fractional and ~50× its other years — plus conn-per-staff 1,518, ~4× the national max), Calabanga 2012 (180,000). All carry `3_verified`, so verification level does not guarantee field plausibility.
- Screen applied at scoring/size-classification time only (the raw dataset table still shows rows as published), never inventing substitutes — a screened-out observation just leaves the factor unevidenced: employee counts must be positive integers ≤ 5,000 (largest real count nationally: Manila Water ~2,663) and ≠ the report year; `INST_PRODUCTIVITY_CONN_PER_STAFF` ≤ 800; `OPS_CONNECTIONS_TOTAL` integer. Disclosed in `philippines.html` methodology and README.

### Verification (browser, local server; through-year 2025)
- 13 indicator-filter checkboxes, 13 rows in the per-factor coverage table, 13 "ranked" flags in the 23-factor reference table; no console errors.
- New-factor coverage at 2025 (no-age-limit rules): debt/CADS **105**/519 utilities, DSCR **36**, cash reserves **68**, debtor days **59**.
- Hand-checked Digos City against the CSV: debt/CADS 1.086 → "1.09×", band 0.9–1.7× = 3/4; cash sufficiency 89.29 → 4/4 (>25%); AR 27.9 days → 4/4 (<45) — all match `core.js` bands. Digos now scores 11/13 factors (staff correctly unevidenced).
- Tiaong: staff factor now "no validated observation" (absurd value gone), still ranked on 4 factors. Bayugan: bogus 2019 rows rejected; its staff factor now uses the legitimate 2012 pair (16 staff ÷ 5,338 conn = 3.0/1,000), size category unaffected (median of remaining counts stays Cat C). Manila Water's staff factor survives the screen (1.9/1,000 from 2024 filings).
- Ranked count: under the (since-removed) 5-year rule the new factors took 2025 ranking from 102 → **105** utilities; combined with the same-day age-limit removal the page now ranks **252**.
- Excel export ranking header is now dynamic ("Evidenced factors (of 13)"); factor-detail sheet picks up the new factors automatically.
- Georgia regression: `georgia.html` "Original workbook reference" preset scores exactly **49.0** (page default with Geostat poverty 7.1% shows 49.8, as before).
