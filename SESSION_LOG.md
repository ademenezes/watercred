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
