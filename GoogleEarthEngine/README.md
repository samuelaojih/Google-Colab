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

Layers coarser than the chosen output resolution (rainfall, PET/aridity, soils) are
bilinearly resampled onto the output grid to avoid blocky nearest-neighbour artefacts -
this smooths but cannot add real spatial detail the source data doesn't resolve
(montane rainfall gradients in particular are only as good as CHIRPS/TerraClimate
capture them). Flow-routed hydrology (HAND/upstream-area/TWI/streams) is deliberately
**not** resampled this way, since interpolating routed values between pixels can
manufacture false intermediate stream cells.

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
