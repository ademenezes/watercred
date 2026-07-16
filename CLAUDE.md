# WaterCRED

Two-page, dependency-free prototype for water utility creditworthiness analysis. No framework, no build step — plain HTML/CSS/ES6.

## Run

```bash
python3 -m http.server 8000
```

A local server is required: the pages fetch CSVs from `data/`, which browsers block from `file://`. Georgia: `/` · Philippines: `/philippines.html`.

## Architecture

- `core.js` — shared engine. Top level: the canonical 23-factor workbook model (`factors`, band functions, `workbookPreset`/`upsidePreset`/`stressPreset`), `parseCSV`, `clamp`, `compact`. `initApp(config)` runs the simulator, evidence explorer, and ranking for one page.
- `georgia.js` / `philippines.js` — country configs passed to `initApp`: CSV path, presets/seeds, evidence metrics, `scoreUtility` ranking scorer, optional `normalizeRow` and `onRanking` hooks. Each HTML page loads `core.js` then its country file.
- `phl-map.js` — static geodata: Natural Earth 50m country outline (public domain) + GADM 4.1 municipal polygons per district (free for non-commercial use), both `[lon, lat]`, simplified. Regeneration provenance is in SESSION_LOG.md.
- Both pages share `styles.css` and the same element ids (`#factorGrid`, `#rankingBody`, `#phlMap`, …) — core.js queries them directly, so keep ids identical across pages.

## Methodology invariants

- The 23-factor bands and weights in `core.js` are canonical to the source workbook. The workbook reference preset must score exactly **49.0** — treat that as a regression check after touching scoring.
- **Never invent data.** Evidence-seeded inputs cite a source (`config.sources`); everything else is labeled "Workbook example" / assumption. Poverty: Geostat 2025 (7.1%) for Georgia, PSA 2023 (15.5%) for the Philippines.
- Philippines ranking = renormalized subset of the 23 factors: `Σ(points×weight) / Σ(4×weight) × 100` over evidenced factors only, minimum **4** factors to rank, observations ≤ **5 years** old, derived ratios (EBITDA, debt/equity, staff) only combine same-year statements. Negative equity scores 0 on leverage; liquidity uses current-ratio bands (documented demo conventions).
- `normalizeRow` converts "PHP million" → PHP and "million m3" → m³ at load; derived ratios and portfolio sums rely on this.
- When changing any threshold or scoring rule, update every disclosure in the same commit: the ranking note and method `<details>` in `philippines.html`, README, and SESSION_LOG.md.

## Data

- `data/georgia_validated_data.csv` — 345 rows, 12 utilities, 2014–2024, 14 columns (GNERC operational metrics).
- `data/philippines_validated.csv` — 1,610 rows, 57 water districts, 2009–2024, 22 columns incl. `utility_name`, `unit`, `direction`, `verification_level` (COA/LWUA audited financials).
- Column layouts differ; core.js only relies on `utility_id, utility_name, year, indicator_id, value, unit`.

## Logs

Append a dated entry to `SESSION_LOG.md` for every substantive change (decisions + verification). `MODEL_ANALYSIS.md` is the workbook audit — historical, don't rewrite.
