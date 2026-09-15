# ACReSAL Within-Catchment Priority DSS

A Google Earth Engine (GEE) Code Editor app for siting interventions inside Nigerian
catchments across six themes: **Agricultural Productivity, Erosion Control, Flood
Mitigation, Reforestation, Wetland Restoration, and Irrigation**. Each theme is an
AHP (weighted-overlay) suitability model, standardised, gated by climate/ecozone where
relevant, and reclassified into 5 fixed priority classes (1 = lowest ... 5 = highest).

## How to run it

1. Open the [GEE Code Editor](https://code.earthengine.google.com/).
2. Paste the contents of `ACReSAL_Catchment_Priority_DSS.js` into a new script.
3. Update `SCMP` at the top to point at your own catchment-boundary FeatureCollection asset
   (it must have a `NAME` field, or change `NAME_FIELD`).
4. Click **Run**. Pick a catchment (or a State/LGA), an intervention model, and an output
   resolution, then click **Map priority areas**.
5. Exports (GeoTIFF/Shapefile) only work from the Code Editor, not from a published App -
   run it there before starting a Drive task.

## Output resolution

Analysis/export resolution is user-selectable: **50 m, 60 m, or 100 m** (default 60 m).
Selecting a catchment/State/LGA shows a non-blocking area-based suggestion (finer for
small catchments, coarser for very large states) which you can override. For large
States at 50-60 m, prefer the "queue as Drive export" buttons over the interactive
download links - interactive calls share a much smaller Earth Engine compute-time
budget than a queued batch task.

## Data sources (native resolution)

| Layer | Source | Native resolution |
|---|---|---|
| Terrain (elevation, slope) | SRTM (`USGS/SRTMGL1_003`) | 30 m |
| Vegetation & water indices (NDVI, NDWI, greening/browning trend) | Sentinel-2 SR (`COPERNICUS/S2_SR_HARMONIZED`), cloud-masked via SCL | 10-20 m |
| Land cover | ESA WorldCover v200 | 10 m |
| Hydrology (HAND, upstream area, TWI, streams) | MERIT Hydro `v1_0_1` | ~90 m |
| Rainfall | CHIRPS daily | ~5.5 km |
| PET / aridity index | TerraClimate | ~4 km |
| Soils (SOC, pH, sand, clay) | OpenLandMap `v02` | 250 m |
| Population | Meta/CIESIN HRSL (`sat-io/open-datasets/hrsl/hrslpop`) | ~30 m |
| Roads (accessibility proxy) | GRIP4 Africa vectors (`sat-io/open-datasets/GRIP4/Africa`) | vector |
| Protected areas | WDPA current polygons | vector |
| Permanent surface water | JRC Global Surface Water `v1_4` | 30 m |
| Geology (lithology) | User-supplied national geology map (`projects/ee-samuelaojih/assets/geology`) | vector |

Layers coarser than the chosen output resolution (rainfall, PET/aridity, soils) are
bilinearly resampled onto the output grid to avoid blocky nearest-neighbour artefacts -
this smooths but cannot add real spatial detail the source data doesn't resolve
(montane rainfall gradients in particular are only as good as CHIRPS/TerraClimate
capture them). Flow-routed hydrology (HAND/upstream-area/TWI/streams) is deliberately
**not** resampled this way, since interpolating routed values between pixels can
manufacture false intermediate stream cells.

## Rectangular "Not Suitable" blocks (missing-data tiles)

If a classified output shows a perfectly rectangular block of one class cutting across
otherwise-continuous terrain, that's a missing-data tile in a source raster, not a real
field result - real suitability doesn't follow straight lines. This was reported for
Erosion Control and Reforestation, which share exactly four criteria: `rainfall`,
`slope`, `ecoPressure`, and `burnFreq`. Tiled products like MODIS MCD64A1 (`burnFreq`)
and Sentinel-2 can have genuine no-data footprints aligned to the sensor's own tile
grid - and previously, `buildNormalizedCriteria()` never unmasked a standardized
criterion band, so a single masked criterion propagated (`ee.Image.add()` masks its
whole running sum once any one operand is masked) into a fully masked composite,
discarding every other criterion's valid data at that pixel too.

Fixed: every standardized criterion band is now unmasked to a neutral midpoint
(`NEUTRAL_CRITERION_VALUE = 0.5` - contributing neither for nor against) instead of
staying masked or defaulting to 0 (which would silently read as "worst possible").
WorldCover loading is also hardened with `unmask(0)` (0 is not a valid WorldCover
class), so a coverage gap there can't propagate into `ecoPressure`, `wetlandSignal`,
`natvegDeficit`, or silently exclude viable land via the exclusion mask.

## Agro-ecological zone awareness

Many ACReSAL catchments straddle several ecozones - hyper-arid/arid Sahel in the
north, semi-arid and dry sub-humid Sudan/Guinea savannah transition zones, and
montane pockets (Jos, Mambilla, Obudu plateaus, isolated highlands like Biu/Mandara).
Two fixed, globally-defined zone classifications (not derived from a catchment's own
min/max, so a catchment automatically shows its real ecozone split) are combined into
one **ecozone** used to standardise/threshold vegetation-cover criteria and the
reforestation "sparse vegetation" test - so a naturally sparse arid-zone pixel is
judged against arid-zone norms, and a wetter montane pocket against its own:

- **Aridity zone** (AI = rainfall / PET; 5 classes, UNESCO/FAO breakpoints): hyper-arid,
  arid, semi-arid, dry sub-humid, humid.
- **Elevation zone** (3 classes): lowland (<300 m), upland (300-900 m), montane (>=900 m).

Flood Mitigation and Wetland Restoration are additionally **climate-gated**: their
composite score is scaled down in hyper-arid/arid zones, since those models are ~70%
static terrain metrics that can look "flood-prone" on slope/HAND alone even where
there is essentially no rainfall to ever generate that runoff. Erosion Control is
deliberately not gated this way - semi-arid zones are classically the most
erosion-prone (sparse cover + intense convective storms).

## Geology

The script now uses a real, locally-sourced national lithology map (a FeatureCollection
with a `short_name` lithology code and `era` attribute) - the first non-global-proxy
dataset in this script, and a genuinely different kind of evidence: the parent material
everything else sits on. Three classifications are derived from `short_name` via
`loadGeologyLayers()` and added as new criteria:

- **`hydrogeology`** (Irrigation) - Basement Complex (crystalline: granite/gneiss/
  migmatite, low primary porosity, fracture-flow groundwater only) vs sedimentary-basin
  (Cretaceous-Quaternary, e.g. the Chad/Sokoto/Niger Delta/Benue Trough basins,
  generally far better aquifers) - the standard hydrogeological distinction in Nigeria,
  directly relevant to groundwater-fed irrigation feasibility.
- **`geoErodibility`** (Erosion Control) - Nigeria's most severe documented erosion (the
  Anambra/Imo gully systems) is specifically associated with poorly-consolidated
  Cenozoic sedimentary formations, not the crystalline basement - a lithology-aware
  signal complementing the existing sand-fraction-based K-factor.
- **`geoAlluvium`** (Flood Mitigation, Wetland Restoration) - mapped Quaternary alluvium
  is the geological, long-term-record definition of an active floodplain, independent
  confirmation alongside `floodSeasonality`'s short satellite record.

The hydrogeology/erodibility rankings are a reasoned simplification from general
geological principles (see the exact code-to-class mappings at the `GEOLOGY`
declaration), not a validated formation-by-formation geotechnical study - treat them as
directionally correct, not precise. The alluvium flag rests on a more directly-grounded
geological definition. Any lithology code in the full asset not covered by this
mapping falls back to a documented neutral/conservative default. All four affected
models' other weights were rescaled to still sum to 1.00.

## Flood Mitigation, and a units bug that affected four models

MERIT Hydro's `upa` (upstream drainage area) band is in **km²**, not m². The stream
network used to be built as `upa.gt(1e6)`, commented as ">1 km² contributing area" -
that comment is only true if `upa` were in m². The real effect was a threshold of
1,000,000 km², which almost no pixel in any Nigerian catchment ever clears (even the
Benue's entire basin is ~319,000 km²). With the stream network effectively empty,
`drainageProx` and `drainageDensity` came out flat across the whole catchment, and the
script's own flat-band guard then silently contributed nothing from them - **18% of
Flood Mitigation's weight, 20% of Wetland Restoration's, 9% of Irrigation's, and 13% of
Erosion Control's** were doing nothing. Fixed to the actually-intended `upa.gt(1)`.

On top of that fix, **Flood Mitigation is redesigned for big-river/floodplain flooding**
(Benue-Mada-scale catchments), not just small-stream/flash-flood terrain proxies:

- `majorRiverProx` (replaces `drainageProx` for this model only) - distance to a river
  with ≥ `MAJOR_RIVER_UPA_KM2` (500 km²) upstream area, not the fine >1 km² network. A
  major river's floodplain extends far past "nearest small tributary."
- `floodSeasonality` (new) - JRC Global Surface Water's `seasonality` band: the number
  of months per year a pixel is actually *observed* as water - real historical flood
  evidence, not a terrain proxy. It's complementary to (not redundant with) the
  permanent-water exclusion in `exclusionMask()`, which is keyed on a much higher,
  non-seasonal `occurrence` threshold and so doesn't exclude seasonally-flooded land.
- `heavyRainDays` (replaces plain mean-annual rainfall for this model only) - CHIRPS
  days/year with ≥ `HEAVY_RAIN_MM_DAY` (20 mm), a standard ETCCDI-style "very heavy
  rain day" extreme-precipitation index - a more direct flood-triggering signal than
  an annual total, which can hide a handful of catastrophic downpours behind an
  otherwise-moderate year.

Other models' criteria are unchanged apart from the units bug fix above.

## Wetland Restoration area was overstated

Two compounding causes made Wetland Restoration's "very high priority" (class 5) area
come out far larger than real wetland/floodplain extent in most catchments:

1. `classifyPriority5()` ranks pixels by **quantile** (20/40/60/80th percentile), so
   class 5 is always the top 20% of *whatever pool of pixels it's given* - a relative
   rank, not an absolute "this is genuinely wetland-suitable" threshold. Wetlands are
   inherently rare on the landscape, so ranking the entire catchment and taking the top
   20% systematically overstates area for a rare-suitability theme like this one.
2. The units bug fix above made `drainageProx` (distance to the nearest >1 km² channel)
   finally work as intended everywhere it's used - but for Wetland Restoration that's
   the *wrong* proximity signal: a steep highland headwater also clears 1 km², so
   "close to some stream" ends up true across most of a catchment.

Fix, addressing both: `wetlandProx` replaces `drainageProx` for this model - distance
to actual wetland *evidence* (JRC permanent water, WorldCover wetland/mangrove, or any
JRC-observed seasonal flooding) rather than to any qualifying stream. A hard
eligibility gate then masks out anything beyond `WETLAND_ELIGIBLE_KM` (10 km) of that
same evidence *before* classification, so the top-20% cut is taken from a
realistically-sized candidate pool instead of the whole catchment. Other models are
unaffected.

## Analysis add-ons

- **Shared exclusion mask.** No model recommends siting on built-up land or open
  permanent water; Agricultural Productivity and Irrigation additionally exclude WDPA
  protected areas (the restoration-oriented models deliberately don't - intervening in
  or around a protected area is often the point). `EXISTING_INTERVENTIONS_ASSET` is an
  empty-by-default hook for your own "already funded/treated" FeatureCollection, if you
  have one.
- **Minimum mapping unit.** Classified rasters (priority classes and intervention
  clusters) are sieved with a 1 ha minimum patch size (`MIN_PATCH_HA`) before being
  shown, vectorized, or exported, so outputs aren't salt-and-pepper noise at 50-100 m.
- **Pairwise AHP weight editor.** "⚖ Adjust AHP weights" lets you re-derive a model's
  weights from Saaty 1-9 pairwise judgments instead of the built-in defaults, and
  reports the Consistency Ratio (CR) - the standard AHP check; CR < 0.10 is considered
  acceptable. "Reset to default weights" restores the originals.
- **Monte Carlo weight-sensitivity analysis.** After running a model, "Run
  weight-sensitivity analysis" perturbs its weights ±20% across 24 draws and shows
  per-pixel score variability and "class-5 stability" (how often a pixel stayed "very
  high priority" across draws) - low-stability areas are borderline calls sensitive to
  the exact weights used.
- **Candidate site points.** Centroids of class-5 patches ≥ 5 ha (`SITE_MIN_AREA_HA`),
  exportable as a point Shapefile - more directly actionable for a field team than a
  raw priority-class mask.
- **Two-period change detection.** "Compare periods" re-runs a model over two date
  windows and diffs the classified rasters (-4..+4) to show where priority is trending
  up (growing need) vs down (improving / already addressed).
- **Exploratory CMIP6 signal.** An optional, off-by-default map layer comparing
  projected SSP2-4.5 rainfall (2030-2050, a 4-model ensemble) against the CMIP6
  historical baseline (1995-2014). Deliberately not wired into any model's weights - a
  coarse "wetter or drier" flag, not a validated criterion (NEX-GDDP-CMIP6 has no PET
  band, so it isn't a true future aridity index).
- **Burned-area frequency.** MODIS MCD64A1 burned-area frequency is now a criterion in
  Erosion Control and Reforestation (repeated burning strips cover and signals land
  needing reforestation).
- **Not implemented (no verifiable public GEE asset)**: livestock/grazing-pressure
  density and land-tenure/conflict-risk layers. Both are real, relevant drivers for
  this region - wire them in the same way as burned-area frequency if/when you have a
  specific, verified asset ID (e.g. a licensed livestock-density raster, or a
  project-specific conflict-risk layer).

## Adapting it

- To change AHP weights or add/remove criteria, edit `MODELS` and add the new layer to
  `criterionLayers()` (and to `ZONE_RELATIVE_CRITERIA` if it should be standardised
  within the ecozone rather than catchment-wide).
- To point at a different country/region, swap `GAUL1`/`GAUL2` filters and the aridity/
  elevation breakpoints (`classifyAridityZone`/`classifyElevationZone`) if the region's
  ecology doesn't match Nigeria's.
- `buildModel()` is a thin wrapper over `buildNormalizedCriteria()` (the expensive,
  reduceRegion-based standardisation step) and `weightedComposite()` (cheap band math);
  anything that needs to re-score a model with different weights without repeating the
  standardisation step (as the sensitivity analysis does) should call those two
  directly rather than `buildModel()`.
- `buildCriteria()`/`buildPriority()`/`CRITERIA` (section 1/2) are an older, simpler
  slider-driven weighted-overlay example kept for reference - not wired to any UI and
  not updated with the Sentinel-2/ecozone/resolution changes above.
