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

## Adapting it

- To change AHP weights or add/remove criteria, edit `MODELS` and add the new layer to
  `criterionLayers()` (and to `ZONE_RELATIVE_CRITERIA` if it should be standardised
  within the ecozone rather than catchment-wide).
- To point at a different country/region, swap `GAUL1`/`GAUL2` filters and the aridity/
  elevation breakpoints (`classifyAridityZone`/`classifyElevationZone`) if the region's
  ecology doesn't match Nigeria's.
- `buildCriteria()`/`buildPriority()`/`CRITERIA` (section 1/2) are an older, simpler
  slider-driven weighted-overlay example kept for reference - not wired to any UI and
  not updated with the Sentinel-2/ecozone/resolution changes above.
