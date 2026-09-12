/**********************************************************************************************
 *  ACReSAL WITHIN-CATCHMENT PRIORITY DSS (SCMP)  -  Google Earth Engine
 *  ------------------------------------------------------------------------------------------
 *  V2 - adds agro-ecological / aridity-zone awareness and fixed 1-5 output classes.
 *  V3 - adds a climate gate so flood/wetland priority can't be driven by terrain alone in
 *       zones too dry to ever generate the runoff those terrain metrics assume.
 *  V4 - fixes 'projects/sat-io/open-datasets/GRIP4/density', which is not a real EE asset
 *       (GEE: "Image asset ... not found"). roadAccess is now built from the actual GRIP4
 *       vector road network (see criterionLayers()).
 *  V5 - fixes "Too many concurrent aggregations": the V2 zonal-standardisation fix called
 *       reduceRegion() once per criterion PER ZONE, and Earth Engine re-runs every
 *       reduceRegion() baked into a displayed image once per map tile (tiles render in
 *       parallel) - a model with several zone-relative criteria (e.g. Agricultural
 *       Productivity) could fire ~19 aggregation calls in a burst. buildModel() and the
 *       reforestation theme's zone threshold now fetch all their stats via ONE combined
 *       reduceRegion (global criteria) and ONE combined grouped-by-zone reduceRegion (zone-
 *       relative criteria), regardless of how many criteria are involved.
 *  V6 - fixes "Dictionary does not contain key: 'NDVI_p40'" in the reforestation cluster
 *       theme: a reducer given a SINGLE percentile value does not suffix its output key
 *       (e.g. '_p40') the way a multi-value percentile call does - the actual key was just
 *       'NDVI'. Reducer.setOutputs() now pins the key explicitly instead of guessing the
 *       naming convention, and .contains() checks existence without throwing.
 *
 *  V7 - HIGH-RESOLUTION OUTPUT + MONTANE/ELEVATION-ZONE AWARENESS
 *       (this pass; see below for the four changes and why each was needed)
 *
 *   D) USER-SELECTABLE HIGH-RESOLUTION OUTPUT (50 / 60 / 100 m)
 *      Problem: SCALE defaulted to 300-500 m - chosen purely to keep the old MODIS-NDVI-driven
 *      pipeline fast, not because the source data or the intervention-siting use case needed
 *      it that coarse. At 300-500 m a single pixel can straddle a farm plot, a gully and a
 *      floodplain fringe, which is too coarse to site an actual intervention.
 *      Fix: SCALE now defaults to 60 m and is user-selectable (50 / 60 / 100 m) via a new
 *      dropdown (resSelect) in the control panel - see section 3. Selecting a catchment/
 *      State/LGA now shows a non-blocking area-based suggestion (updateAreaHint) and
 *      auto-fills a sensible default (50 m for small catchments, up to 100 m for very large
 *      states), but the user can override it before running. pickScale()'s old behaviour -
 *      blocking every run on an extra reduceRegion just to set SCALE - is gone; SCALE is now
 *      read synchronously from the dropdown (currentScale()) at the start of every run.
 *      Interactive reduceRegion/getDownloadURL calls stay bounded by EE's per-request compute
 *      budget (not by maxPixels, which even 50 m over Nigeria's largest states only reaches
 *      tens-to-low-hundreds of millions of pixels for - well under the 1e10 ceiling already
 *      set) - so for a large State at 50-60 m the Drive-export buttons (already in the UI)
 *      remain the safer choice; the area hint now says so explicitly.
 *
 *   E) SENTINEL-2-BASED VEGETATION/WATER INDICES (replacing MODIS NDVI, 250 m)
 *      Problem: every vegetation- and water-condition criterion (ndvi, ndviDeficit, ndviCond,
 *      ndwi, and the reforestation/erosion "sparse vegetation" tests) was built from MODIS
 *      MOD13Q1 NDVI at 250 m native resolution - 2.5x to 5x coarser than the new 50-100 m
 *      output grid, and far too coarse to resolve vegetation heterogeneity across a montane
 *      catchment (e.g. Mambilla/Jos/Obudu plateau forest-farm mosaics, or gully-scale
 *      degradation patches). Fix: s2Collection()/s2NdviMedian()/s2NdwiMedian()/s2NdviTrend()
 *      build these from cloud-masked (per-pixel SCL masking, not just a scene-level cloud %
 *      filter) Sentinel-2 SR, at its native 10-20 m, which is finer than every output
 *      resolution offered. The multi-year greening/browning trend is now computed from annual
 *      Sentinel-2 median composites (2018 -> present) rather than the 16-day MODIS composites,
 *      using the same linearFit() pattern as before. MODIS is no longer used anywhere in the
 *      live six-model AHP path.
 *
 *   F) MONTANE / ELEVATION-ZONE AWARENESS (combined into one ecoZone with the aridity zone)
 *      Problem: fix (A) below made vegetation-cover criteria zone-relative against the
 *      ARIDITY zone only. But several ACReSAL catchments also cross real elevation bands
 *      (Jos Plateau, Mambilla Plateau, Obudu Plateau, isolated highlands like Biu/Mandara) -
 *      montane pockets that are cooler and wetter than their surrounding lowland aridity zone
 *      would suggest (orographic effect), so "what counts as sparse vegetation" or "what
 *      counts as a high/low criterion value" is still wrong if judged only against a
 *      catchment-wide aridity class that lumps a humid highland in with the arid lowland
 *      around it. Fix: classifyElevationZone() adds a fixed 3-class relief split (Lowland
 *      <300 m / Upland 300-900 m / Montane >900 m, matching how Nigeria's plateaus and
 *      highlands are conventionally distinguished from its lowland plains and river troughs).
 *      buildEcoZone() combines it with the 5-class aridity zone into one 1-15 ecoZone id, and
 *      every place that used to standardise/threshold "within the aridity zone" (buildModel()'s
 *      zone-relative criteria, the reforestation theme's NDVI-sparse threshold) now does so
 *      within the combined ecoZone instead - so a Sahel-Montane pocket is no longer judged
 *      against Sahel-Lowland norms. The climate gate (C) is deliberately left keyed on aridity
 *      alone (it is about whether enough rain arrives to generate runoff, which orographic
 *      rainfall already feeds back into via the rainfall/aridity criteria themselves).
 *
 *   G) SCALE-AWARE DISTANCE-TRANSFORM RADII + COARSE-LAYER RESAMPLING
 *      Problem: drainageProx/roadAccess used fastDistanceTransform(500, 'pixels'). At the old
 *      300-500 m default that is a 150-250 km search radius; at the new 50-100 m default the
 *      same "500 pixels" is only a 25-50 km radius - too short in a catchment's remote arid
 *      reaches, and the radius silently changing with the chosen output resolution is a trap
 *      for anyone who later changes SCALE again. Fix: searchRadiusPixels(km) converts a fixed
 *      real-world search distance into pixels at whatever SCALE is active. Separately, CHIRPS
 *      rainfall (~5.5 km), TerraClimate PET/aridity (~4 km) and the OpenLandMap soil grids
 *      (250 m) are all coarser than the 50-100 m output grid; each is now sampled with
 *      .resample('bilinear') where it feeds a continuous criterion, which smooths the
 *      resampling artefacts of drawing a fine output grid over a coarser source raster - it
 *      cannot manufacture detail the source data doesn't have (montane rainfall gradients in
 *      particular are still only as good as CHIRPS/TerraClimate resolve them), but avoids the
 *      blocky nearest-neighbour look which otherwise gets mistaken for real information at a
 *      fine analysis scale. Deliberately NOT applied to the MERIT Hydro flow-routed layers
 *      (hand/upa/twi/streams) - interpolating routed hydrology values between pixels can
 *      manufacture false intermediate stream cells, so those keep their native handling.
 *
 *  V8 - fixes "Image.reduceRegion: Too many pixels in the region. Found 12657628, but
 *       maxPixels allows only 10000000" at the new finer default resolution (V7). Every
 *       reduceRegion() (and ui.Chart.image.histogram()) in this script already set
 *       bestEffort:true and maxPixels:1e10, but several use a GROUPED reducer
 *       (Reducer.group(), for the per-zone percentile stats and the area-by-class/cluster
 *       tables) - and bestEffort's automatic scale-coarsening is not reliably honoured for
 *       those, so once a catchment/State at the new 50-100 m default reached ~10M+ pixels the
 *       hard cap still fired. Every reduceRegion()/histogram call here only ever produces a
 *       SCALAR summary (a percentile bound, a classification threshold, an area total) -
 *       never the output raster itself, which is always computed by direct band math at the
 *       full SCALE regardless of what scale its inputs were summarised at - so statsScale()
 *       now pins these summary calls to max(SCALE, 250 m) instead of relying on bestEffort,
 *       independent of the fine SCALE used for the priority surface, its classification, and
 *       every export (GeoTIFF/Shapefile), which are untouched by this fix.
 *
 *  V9 - adds sensitivity analysis, a shared exclusion mask, a minimum-mapping-unit filter, a
 *       pairwise-AHP weight editor, a new criterion, candidate site points, two-period change
 *       detection, and an exploratory future-climate signal. In order:
 *
 *   H) SHARED EXCLUSION MASK - exclusionMask(). No model should ever recommend built-up land or
 *      open permanent water; Agricultural Productivity/Irrigation additionally exclude WDPA
 *      protected areas. Applied inside weightedComposite() for all six models (replaces the old
 *      Wetland-Restoration-only exclusion). EXISTING_INTERVENTIONS_ASSET is a documented, empty-
 *      by-default hook for a user's own "already treated" FeatureCollection, if they have one.
 *
 *   I) buildModel() SPLIT INTO buildNormalizedCriteria() + weightedComposite() - the expensive
 *      stretch-bound reduceRegion calls now happen once and produce a reusable multiband 0-1
 *      image; the actual weighted sum is cheap band math that can be re-run against many
 *      different weight sets (Monte Carlo draws, live AHP edits) without repeating the
 *      reduceRegion calls. buildModel() is now a thin wrapper of the two for callers that don't
 *      need to reuse the normalized bands.
 *
 *   M) MINIMUM MAPPING UNIT / SIEVE FILTER - applyMinMappingUnit(), applied inside
 *      classifyPriority5() and buildClusters(). A pixel-by-pixel classification at 50-100 m
 *      produces salt-and-pepper noise; patches smaller than MIN_PATCH_HA are merged into their
 *      neighbourhood's majority (focal-mode) class before the raster is shown, vectorized, or
 *      exported - the same idea as GDAL's sieve filter.
 *
 *   E) PAIRWISE AHP WEIGHT EDITOR + CONSISTENCY RATIO - the "Adjust AHP weights" panel (section
 *      3) lets a user re-derive a model's weights from Saaty 1-9 pairwise judgments instead of
 *      the asserted defaults, and reports the Consistency Ratio (CR) - CR < 0.10 is the standard
 *      AHP acceptability threshold. Uses the standard closed-form eigenvector approximation
 *      (normalise columns, average rows), appropriate for these small (n<=9) matrices.
 *      "Reset to default weights" restores the built-in values (DEFAULT_MODEL_WEIGHTS).
 *
 *   NEW CRITERION - burnFreq (MODIS MCD64A1 burned-area frequency, months burned during the
 *      analysis window) added to Erosion Control and Reforestation, whose other weights were
 *      rescaled to still sum to 1.00. Repeated burning is both an erosion driver (strips cover
 *      ahead of the rains) and a direct signal of land needing reforestation.
 *
 *   N) MONTE CARLO WEIGHT-SENSITIVITY ANALYSIS - runSensitivityAnalysis(), a button shown after
 *      running a model. Perturbs each criterion weight +/-20% across 24 draws (reusing the SAME
 *      normalized criteria bands - no repeated reduceRegion calls) and shows (a) per-pixel score
 *      std-dev and (b) the fraction of draws where a pixel stayed "class 5" - low class-5
 *      stability flags borderline calls that are sensitive to the exact AHP weights used, which
 *      is the standard MCDA robustness check this script previously had no way to show.
 *
 *   J) CANDIDATE SITE POINTS - candidateSitePoints(), exported alongside the raster/polygon
 *      outputs. Centroids of class-5 patches at least SITE_MIN_AREA_HA in size - more directly
 *      actionable for a field team than a raw priority-class mask.
 *
 *   K) TWO-PERIOD COMPARISON / CHANGE DETECTION - "Compare periods" (section 3/4). Re-runs a
 *      model over two different date windows (buildForPeriod(), which safely swaps START/END
 *      only for the duration of building that period's expression graph) and diffs the
 *      classified rasters (-4..+4) to show where priority is trending up vs down over time -
 *      the M&E use case this script previously had no way to answer.
 *
 *   L) EXPLORATORY CMIP6 FUTURE-RAINFALL SIGNAL - cmip6RainfallChange(), an optional, off-by-
 *      default map layer comparing NEX-GDDP-CMIP6 SSP2-4.5 projected rainfall (2030-2050, a
 *      4-model ensemble mean) against the CMIP6 historical baseline (1995-2014). Deliberately
 *      NOT wired into any model's weights - it is a coarse, exploratory "wetter or drier"
 *      signal (no PET data in this collection, so it is not a true future aridity index), shown
 *      only so a user can sanity-check whether a catchment's siting decisions might need
 *      revisiting under a warmer/wetter-or-drier future, not to silently change today's scores.
 *
 *   SKIPPED (no verifiable public Earth Engine asset, to avoid repeating the V4 bad-asset
 *   mistake): livestock/grazing-pressure density and land-tenure/conflict-risk layers. Both are
 *   real, relevant degradation/siting-risk drivers for this region - wire them in the same way
 *   as burnFreq above if/when a specific, verified asset ID is available (e.g. a licensed
 *   livestock density raster or a project-specific conflict-risk layer).
 *
 *  V9.1 - fixes two errors surfaced by an actual Drive-export run of V9:
 *
 *   1) "Expected a homogeneous image collection... Mismatched type for band 'time': Expected
 *      type: Float<0.0,0.0>. Actual type: Float<1.0,1.0>." - s2NdviTrend() built its 'time' band
 *      directly from `y.subtract(y0)`, a value derived purely from ee.List.sequence()'s known
 *      bounds, which Earth Engine can (and does) evaluate to an EXACT constant at graph-
 *      construction time - so each per-year image got a distinct, narrow inferred type
 *      (Float<0,0>, Float<1,1>, ...) instead of a generic float, and ee.ImageCollection()
 *      rejects that as non-homogeneous. Fixed by tagging each annual composite with
 *      'system:time_start' and deriving 'time' from img.date().difference(...) in a separate
 *      .map() pass - a RUNTIME per-image metadata lookup EE can't collapse to an exact
 *      constant, exactly the pattern the legacy MODIS-based trend already used (and never hit
 *      this bug for that reason).
 *
 *   2) "Reducer.group: Reducer.group groupField out of range." - the zone-relative percentile
 *      reducer (ee.Reducer.percentile([2,98]), natural arity 1) auto-repeats across however
 *      many data bands it's given when used WITHOUT .group() (that's how the plain globalPct
 *      call works on a multi-band image), but that auto-repeat is ambiguous once .group() is
 *      layered on top with MORE THAN ONE data band - which only happens for Agricultural
 *      Productivity (the only model with two zone-relative criteria, 'ndvi' and 'ndviCond';
 *      every other model has at most one). Fixed by calling .repeat(zoneCr.length) before
 *      .group() (and the matching .repeat(1) on the single-criterion reforestation-theme
 *      version in buildThemes()) so the reducer's input arity - and therefore .group()'s
 *      groupField index - is explicit instead of inferred.
 *
 *  (Carried over from the earlier timeout fix: batch Export.image.toDrive tasks for large
 *  catchments, simplified WDPA polygons, and tileScale on heavy reduceRegion calls.)
 **********************************************************************************************/

var SCMP = ee.FeatureCollection('projects/ee-samuelcoolsdk/assets/SCMP_SHAPEFILES');

/* ============================ 0. CONFIG ================================================== */

var NAME_FIELD = 'NAME';
var START = '2018-01-01';
var END   = '2026-01-01';
var SCALE = 60;                                     // metres for the priority surface & stats - user-selectable, see resSelect (section 3) and currentScale()
var PRIORITY_PALETTE = ['#1a9850','#91cf60','#fee08b','#fc8d59','#d73027']; // 5 classes: 1 (low) -> 5 (high)
var PRIORITY_CLASS_LABELS = ['1 - Very Low', '2 - Low', '3 - Moderate', '4 - High', '5 - Very High'];
var TS = 10;                                        // tileScale for heavy reduceRegion calls (bumped from 8 for the finer default SCALE)
var RESOLUTION_OPTIONS_M = [50, 60, 100];           // user-selectable output resolutions (fix D)
var STATS_SCALE_FLOOR = 250;                        // metres - floor for scalar-summary reduceRegion calls (see statsScale())

// Every reduceRegion()/histogram call in this script computes a SCALAR summary only
// (percentile stretch bounds, classification thresholds, per-zone thresholds, area totals) -
// never the output raster itself, which is always produced by direct band math at the full,
// user-selected SCALE. So these summary calls sample at max(SCALE, 250 m) instead of the full
// output resolution: Earth Engine's bestEffort auto-coarsening is not reliably honoured for
// every reducer (grouped reducers - Reducer.group(), used for the per-zone stats and the area-
// by-class/cluster tables - have been observed to still throw "Too many pixels in the region"
// even with bestEffort:true and an explicit large maxPixels once the region+scale pixel count
// passes ~10 million), so the scale is pinned directly here instead of relying on that. A
// 250 m sample is already far more than enough to estimate a percentile/threshold/area total
// accurately - even Nigeria's largest State (Niger, ~76,000 km2) is only ~1.2M pixels at
// 250 m, comfortably under any maxPixels default.
function statsScale() { return Math.max(SCALE, STATS_SCALE_FLOOR); }

/* ---------------------------- SCALE-AWARE HELPERS (fix G) ------------------------------- */
// Converts a fixed real-world search distance (km) into a pixel radius at the CURRENTLY
// ACTIVE SCALE, so fastDistanceTransform() calls keep the same real-world reach no matter
// which output resolution the user picks. Clamped to [50, 3000] px to keep compute bounded.
function searchRadiusPixels(km) {
  return Math.min(3000, Math.max(50, Math.round(km * 1000 / SCALE)));
}

/* ---------------------------- A) AGRO-ECOLOGICAL / ARIDITY ZONE ------------------------ */
/*  UNESCO/FAO aridity index classes, AI = mean annual rainfall / mean annual PET. These
 *  breakpoints are FIXED (not derived from the catchment's own min/max), which is exactly
 *  what lets a catchment that straddles ecozones show its real split:
 *    AI < 0.05          -> 1  Hyper-arid
 *    0.05 <= AI < 0.20   -> 2  Arid            (Sahel core)
 *    0.20 <= AI < 0.50   -> 3  Semi-arid       (Sahel/Sudan transition)
 *    0.50 <= AI < 0.65   -> 4  Dry sub-humid   (e.g. Hadejia/Komadugu-Yobe floodplain fringe)
 *    AI >= 0.65          -> 5  Humid
 */
var ARIDITY_ZONE_LABELS  = ['1 - Hyper-arid', '2 - Arid (Sahel)', '3 - Semi-arid',
                             '4 - Dry sub-humid (transition)', '5 - Humid'];
var ARIDITY_ZONE_PALETTE = ['#8c2d04', '#d94801', '#fe9929', '#78c679', '#238443'];

function classifyAridityZone(aridityIdx) {
  return ee.Image(1)
    .where(aridityIdx.gte(0.05), 2)
    .where(aridityIdx.gte(0.20), 3)
    .where(aridityIdx.gte(0.50), 4)
    .where(aridityIdx.gte(0.65), 5)
    .updateMask(aridityIdx.mask())
    .rename('aridityZone').toInt();
}

/* ---------------------------- F) MONTANE / ELEVATION ZONE (V7) -------------------------- */
/*  Fixed, globally-defined relief classes (not catchment-relative), matching how Nigeria's
 *  plateaus/highlands (Jos, Mambilla, Obudu, Biu, Mandara foothills) are conventionally split
 *  from its lowland plains and river troughs (Niger-Benue, Sokoto-Rima, Chad basin, Hadejia-
 *  Komadugu-Yobe floodplain):
 *    elevation < 300 m          -> 1  Lowland
 *    300 m <= elevation < 900 m -> 2  Upland
 *    elevation >= 900 m         -> 3  Montane
 */
var ELEVATION_ZONE_LABELS  = ['1 - Lowland (<300 m)', '2 - Upland (300-900 m)', '3 - Montane (>=900 m)'];
var ELEVATION_ZONE_PALETTE = ['#f7fcb9', '#addd8e', '#31a354'];

function classifyElevationZone(dem) {
  return ee.Image(1)
    .where(dem.gte(300), 2)
    .where(dem.gte(900), 3)
    .rename('elevationZone').toInt();
}

// Combines the 5-class aridity zone and 3-class elevation zone into one 1-15 ecozone id, so
// e.g. a Sahel-Montane pocket (cooler/wetter than the Sahel-Lowland around it) is standardised
// and thresholded separately from Sahel-Lowland (fix F). Values: (aridityZone-1)*3 + elevationZone.
function buildEcoZone(aridityZone, elevationZone) {
  return aridityZone.subtract(1).multiply(3).add(elevationZone).rename('ecoZone').toInt();
}

/* ---------------------------- E) SENTINEL-2 VEGETATION / WATER HELPERS (V7) ------------- */
/*  Replaces MODIS MOD13Q1 (250 m) with Sentinel-2 SR (10-20 m native) for every vegetation-
 *  and water-condition criterion, so they match (and are finer than) the 50-100 m output grid
 *  and can actually resolve montane forest-farm mosaics / gully-scale degradation. Cloud
 *  masking is per-pixel via the Scene Classification (SCL) band, not just a scene-level
 *  cloud-percentage filter - important for the wetter southern/montane parts of a catchment
 *  where a strict scene-level filter would otherwise starve the composite of usable scenes. */
function maskS2clouds(img) {
  var scl = img.select('SCL');
  // 3 cloud shadow, 8/9 cloud medium/high probability, 10 thin cirrus, 11 snow/ice
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return img.updateMask(mask);
}

function s2Collection(region) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(START, END).filterBounds(region)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 70))   // scene-level pre-filter only; per-pixel SCL masking does the real work
    .map(maskS2clouds)
    .map(function(img) {
      return img
        .addBands(img.normalizedDifference(['B8', 'B4']).rename('NDVI'))
        .addBands(img.normalizedDifference(['B3', 'B8']).rename('NDWI'));
    });
}

function s2NdviMedian(region) { return s2Collection(region).select('NDVI').median().rename('ndvi'); }
function s2NdwiMedian(region) { return s2Collection(region).select('NDWI').median().rename('ndwi'); }

// Multi-year NDVI trend from annual Sentinel-2 median composites (2018 -> END), replacing the
// old per-16-day MODIS linear fit. Same linearFit() pattern; 'scale' band = slope per year.
//
// V9.1 fix: building the 'time' band directly from `y.subtract(y0)` - a value EE can compute
// exactly at graph-construction time from the known ee.List.sequence() bounds - gave every
// per-year image's 'time' band a distinct, narrow inferred type (Float<0,0>, Float<1,1>, ...),
// which ee.ImageCollection() then rejects as non-homogeneous ("Mismatched type for band
// 'time'... Image ID: 1"). The legacy MODIS-based trend never had a distinct 'time' band for
// this reason: it derived time from img.date().difference(...) - a RUNTIME per-image metadata
// lookup EE can't collapse to an exact compile-time constant - so every image's 'time' band
// stays a generic (homogeneous) Float. Same fix here: tag each composite with
// 'system:time_start' during construction, then derive 'time' from .date() in a separate .map()
// over the resulting (otherwise plain) ImageCollection.
function s2NdviTrend(region) {
  var col = s2Collection(region).select('NDVI');
  var y0 = ee.Number(ee.Date(START).get('year'));
  var y1 = ee.Number(ee.Date(END).get('year'));
  var years = ee.List.sequence(y0, y1.subtract(1));
  var annual = ee.ImageCollection(years.map(function(y) {
    y = ee.Number(y);
    var yStart = ee.Date.fromYMD(y, 1, 1);
    var yEnd = yStart.advance(1, 'year');
    return col.filterDate(yStart, yEnd).median().set('system:time_start', yStart.millis());
  }));
  var withTime = annual.map(function(img) {
    var t = img.date().difference(ee.Date(START), 'year');
    return ee.Image.constant(t).float().rename('time').addBands(img.select('NDVI'));
  });
  return withTime.select(['time', 'NDVI']).reduce(ee.Reducer.linearFit()).select('scale');
}

/* ============================ 1. CRITERIA IMAGERY (legacy slider path) ================= */
/*  buildCriteria()/buildPriority()/CRITERIA/getWeightFractions() below are the ORIGINAL
 *  weighted-overlay path. No slider UI is wired to them in section 3 - the live app runs on
 *  the six-model AHP path in section 1c/2 instead. Left in place only as the basis for the
 *  code-editor example at the bottom of this file; kept on MODIS/300-500 m as originally
 *  written and NOT touched by the V7 resolution/Sentinel-2/ecozone upgrades below - if you
 *  adapt this path for real use, apply the same fixes described in the V7 header first. */

var CRITERIA = [
  {key: 'ndviTrend', label: 'NDVI decline (vegetation loss)',   dir: 'cost',    def: 15},
  {key: 'ndviMean',  label: 'Low mean NDVI (sparse cover)',     dir: 'cost',    def: 10},
  {key: 'bare',      label: 'Bare-soil fraction',               dir: 'benefit', def: 10},
  {key: 'slope',     label: 'Slope steepness',                  dir: 'benefit', def: 10},
  {key: 'erosion',   label: 'Erosion risk (RUSLE-style index)', dir: 'benefit', def: 15},
  {key: 'soc',       label: 'Low soil organic carbon',          dir: 'cost',    def: 8 },
  {key: 'sand',      label: 'Soil erodibility (sand fraction)', dir: 'benefit', def: 5 },
  {key: 'precip',    label: 'Rainfall erosivity (annual rain)', dir: 'benefit', def: 8 },
  {key: 'aridity',   label: 'Aridity (P/PET)',                  dir: 'cost',    def: 9 },
  {key: 'pop',       label: 'Population density (WorldPop)',     dir: 'benefit', def: 10}
];

function buildCriteria(region) {
  var dem   = ee.Image('USGS/SRTMGL1_003');
  var slope = ee.Terrain.slope(dem).rename('slope');

  var modis = ee.ImageCollection('MODIS/061/MOD13Q1').select('NDVI')
                .filterDate(START, END).filterBounds(region);
  var ndviMean = modis.mean().multiply(0.0001).rename('ndviMean');
  var withTime = modis.map(function(img) {
    var t = img.date().difference(ee.Date(START), 'year');
    return ee.Image.constant(t).float().rename('time')
             .addBands(img.multiply(0.0001).rename('NDVI'));
  });
  var ndviTrend = withTime.select(['time', 'NDVI']).reduce(ee.Reducer.linearFit())
                    .select('scale').rename('ndviTrend');

  var nYears = ee.Number(ee.Date(END).difference(ee.Date(START), 'year'));
  var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                 .filterDate(START, END).filterBounds(region).select('precipitation');
  var precip = chirps.sum().divide(nYears).rename('precip');

  var soc  = ee.Image('OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02').select('b0').rename('soc');
  var sand = ee.Image('OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02').select('b0').rename('sand');

  var wc   = ee.ImageCollection('ESA/WorldCover/v200').filterBounds(region).mosaic();
  var bare = wc.eq(60).focalMean(500, 'circle', 'meters').rename('bare');   // continuous bare fraction

  var pet = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE').filterDate(START, END)
              .select('pet').mean().multiply(0.1).multiply(12);
  var aridity = precip.divide(pet.max(1)).rename('aridity');

  var pop = ee.ImageCollection('WorldPop/GP/100m/pop').filter(ee.Filter.eq('year', 2020))
              .filterBounds(region).mosaic().add(1).log().rename('pop');   // log-scaled density

  var R  = precip.multiply(0.363).add(79);
  var LS = slope.divide(9).add(1).pow(1.4);
  var K  = sand.unitScale(0, 100);
  var C  = ndviMean.multiply(-1).add(1).clamp(0, 1);
  var erosion = R.multiply(LS).multiply(K).multiply(C).rename('erosion');

  return ee.Image.cat([ndviTrend, ndviMean, bare, slope, erosion, soc, sand, precip, aridity, pop]);
}

/* ===================== 1c. INTERVENTION-SPECIFIC AHP MODELS ============================ */
/*  Six intervention models from the Zungur-Gongola methodology. Each is a weighted overlay
 *  of standardised criteria with the AHP weights supplied by NASRDA/SSAD.
 *  Direction: '+' = higher value -> higher priority; '-' = higher value -> lower priority. */

// ---- Shared criterion layers (built once per region, reused across models) ----
function criterionLayers(region) {
  var dem   = ee.Image('USGS/SRTMGL1_003');
  var slope = ee.Terrain.slope(dem);
  var nYears = ee.Number(ee.Date(END).difference(ee.Date(START), 'year'));

  // Hydrology from the DEM. NOTE (fix G): hand/upa/twi/streams are flow-routed quantities -
  // deliberately NOT bilinearly resampled (interpolating routed hydrology between pixels can
  // manufacture false intermediate stream cells), so these keep MERIT Hydro's native handling.
  var flowAcc = ee.Image('MERIT/Hydro/v1_0_1');       // has 'upa' (upstream area), 'hnd' (HAND)
  var hand    = flowAcc.select('hnd').unmask(0);
  var upa     = flowAcc.select('upa').unmask(0);
  var slopeRad = slope.multiply(Math.PI / 180).max(0.001);
  var twi = upa.add(1).log().subtract(slopeRad.tan().log()).rename('twi');
  var streams = upa.gt(1e6);                            // >1 km2 contributing area = channel
  // fix G: fixed real-world search radius regardless of the chosen output SCALE.
  var drainageProx = streams.fastDistanceTransform(searchRadiusPixels(20), 'pixels').sqrt()
                       .multiply(ee.Image.pixelArea().sqrt()).rename('drainageProx');
  var drainageDensity = streams.unmask(0).focalMean(2000, 'circle', 'meters').rename('drainageDensity');

  // Rainfall (CHIRPS, ~5.5 km native). fix G: bilinear resample - it is a smooth continuous
  // field, so interpolating it onto the finer 50-100 m output grid avoids blocky nearest-
  // neighbour artefacts (it cannot add real spatial detail CHIRPS itself doesn't resolve).
  var precip = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(START, END)
                 .filterBounds(region).select('precipitation').sum().divide(nYears)
                 .resample('bilinear').rename('rainfall');

  // FIX (A.1): real aridity index (AI = rainfall / PET) and its fixed-threshold ecozone class.
  // Computed once here and exposed to both the AHP models and the map as its own layer.
  // PET (TerraClimate, ~4 km native) also gets bilinear resampling for the same reason as CHIRPS.
  var pet = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE').filterDate(START, END)
              .filterBounds(region).select('pet').mean().multiply(0.1).multiply(12)
              .resample('bilinear');
  var aridityIdx  = precip.divide(pet.max(1)).rename('aridityIdx');
  var aridityZone = classifyAridityZone(aridityIdx);

  // F) Montane/elevation zone (V7) + combined ecozone used for zone-relative standardisation.
  var elevationZone = classifyElevationZone(dem);
  var ecoZone = buildEcoZone(aridityZone, elevationZone);

  // E) Vegetation & water indices - Sentinel-2 (10-20 m native), replacing MODIS (250 m).
  var ndvi        = s2NdviMedian(region);
  var ndviTrend   = s2NdviTrend(region);
  var ndviDeficit = ndvi.multiply(-1).add(1).clamp(0, 1).rename('ndviDeficit');       // 1 - NDVI
  var ndviDegrade = ndviTrend.multiply(-1).clamp(0, 1).rename('ndviDegrade');         // greening loss
  var ndviCond    = ndvi.rename('ndviCond');
  var ndwi        = s2NdwiMedian(region);

  var jrc  = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0);
  var permWater = jrc.gte(50).rename('permWater');

  // Soil (FAO HWSD not in GEE -> OpenLandMap equivalents, 250 m native). fix G: bilinear
  // resample - smooth continuous soil-property surfaces are appropriate to interpolate onto
  // the finer output grid.
  var soc = ee.Image('OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02').select('b0')
              .resample('bilinear').rename('soc');
  var ph  = ee.Image('OpenLandMap/SOL/SOL_PH-H2O_USDA-4C1A2A_M/v02').select('b0')
              .resample('bilinear').rename('ph');
  var sand = ee.Image('OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02').select('b0').resample('bilinear');
  var clay = ee.Image('OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02').select('b0').resample('bilinear');
  var awc  = clay.unitScale(0, 60).rename('awc');
  var kfactor = sand.unitScale(0, 100).rename('kfactor');

  // Land cover (ESA WorldCover v200, 10 m - already finer than every output resolution offered,
  // so no resample needed; categorical, must stay nearest-neighbour in any case).
  var wc = ee.ImageCollection('ESA/WorldCover/v200').filterBounds(region).mosaic();
  var built    = wc.eq(50).rename('built');
  var cropland = wc.eq(40).rename('cropland');
  var natveg   = wc.eq(10).or(wc.eq(20)).or(wc.eq(30));
  var natvegDeficit = natveg.not().rename('natvegDeficit');
  var wetlandSignal = wc.eq(90).or(wc.eq(95)).rename('wetlandSignal');

  // Population (Meta/CIESIN High Resolution Settlement Layer, ~30 m - finer than every output
  // resolution offered).
  var pop = ee.ImageCollection('projects/sat-io/open-datasets/hrsl/hrslpop')
              .filterBounds(region).mosaic().unmask(0).add(1).log().rename('pop');

  // Road access (OSM not native -> GRIP4 roads as accessibility proxy). GRIP4 in sat-io is a
  // VECTOR road network split by continent (FeatureCollection); Nigeria falls under the
  // 'Africa' region asset. Distance to nearest road, inverted so "higher roadAccess = closer
  // to a road" (matches the '+' direction used for roadAccess in the AHP models below).
  // fix G: search radius now scale-aware (searchRadiusPixels) instead of a flat 500 px, which
  // used to mean very different real-world distances depending on SCALE.
  var roadsFC = ee.FeatureCollection('projects/sat-io/open-datasets/GRIP4/Africa').filterBounds(region);
  var roadPixels = ee.Image().byte().paint(roadsFC, 1).unmask(0);
  var roadDist = roadPixels.not().fastDistanceTransform(searchRadiusPixels(50), 'pixels').sqrt()
                   .multiply(ee.Image.pixelArea().sqrt());
  var roadAccess = roadDist.multiply(-1).rename('roadAccess');   // closer to a road -> higher value

  // Derived pressure / condition layers
  var ecoPressure  = built.focalMean(1000, 'circle', 'meters')
                       .add(ndviDeficit).unitScale(0, 2).rename('ecoPressure');
  var ecoRestore   = ndviDeficit.add(natvegDeficit).unitScale(0, 2).rename('ecoRestore');
  var ecoCondition = ndvi.rename('ecoCondition');
  var builtPressure = built.focalMean(1000, 'circle', 'meters').rename('builtPressure');

  // Burned-area frequency (MODIS MCD64A1, monthly, 500 m native) - a fire regime is a real
  // degradation driver in the savannah/Sahel-transition belt (repeated burning strips cover
  // and accelerates erosion, and is itself a signal of land needing reforestation). Counts the
  // number of months with a mapped burn during the analysis window; bilinearly resampled since
  // it is coarser than the output grid and, once aggregated into a count, behaves as a smooth
  // density-like field rather than the per-pixel categorical burn date it started as.
  var burnFreq = ee.ImageCollection('MODIS/061/MCD64A1').filterDate(START, END).filterBounds(region)
                   .select('BurnDate').map(function(img) { return img.gt(0); }).sum()
                   .resample('bilinear').rename('burnFreq');

  return {
    hand: hand, drainageProx: drainageProx, upa: upa, twi: twi, rainfall: precip,
    pop: pop, built: built, slope: slope, kfactor: kfactor, drainageDensity: drainageDensity,
    ndviDegrade: ndviDegrade, ecoPressure: ecoPressure, builtPressure: builtPressure,
    ndviDeficit: ndviDeficit, natvegDeficit: natvegDeficit, ecoRestore: ecoRestore,
    soc: soc, roadAccess: roadAccess, awc: awc, ndvi: ndvi, ndviCond: ndviCond,
    ph: ph, cropland: cropland, ndwi: ndwi, permWater: permWater,
    ecoCondition: ecoCondition, wetlandSignal: wetlandSignal, burnFreq: burnFreq,
    aridityIdx: aridityIdx, aridityZone: aridityZone,
    elevationZone: elevationZone, ecoZone: ecoZone
  };
}

// Each model: list of {c: criterion key, w: AHP weight, d: direction '+'/'-'}.
var MODELS = {
  'Flood Mitigation': { palette: ['#f7fbff','#9ecae1','#4292c6','#08519c','#08306b'], criteria: [
    {c: 'hand', w: 0.22, d: '-'}, {c: 'drainageProx', w: 0.18, d: '-'}, {c: 'upa', w: 0.16, d: '+'},
    {c: 'twi', w: 0.14, d: '+'}, {c: 'rainfall', w: 0.12, d: '+'}, {c: 'pop', w: 0.10, d: '+'},
    {c: 'built', w: 0.08, d: '+'}
  ]},
  // V9: burnFreq (MODIS MCD64A1 burned-area frequency) added as a degradation-driver criterion;
  // other weights rescaled so the model still sums to 1.00.
  'Erosion Control': { palette: ['#ffffcc','#fed976','#fd8d3c','#e31a1c','#800026'], criteria: [
    {c: 'slope', w: 0.23, d: '+'}, {c: 'kfactor', w: 0.18, d: '+'}, {c: 'rainfall', w: 0.16, d: '+'},
    {c: 'drainageDensity', w: 0.13, d: '+'}, {c: 'ndviDegrade', w: 0.10, d: '+'}, {c: 'burnFreq', w: 0.10, d: '+'},
    {c: 'ecoPressure', w: 0.06, d: '+'}, {c: 'builtPressure', w: 0.04, d: '+'}
  ]},
  'Reforestation': { palette: ['#ffffe5','#d9f0a3','#78c679','#238443','#004529'], criteria: [
    {c: 'ndviDeficit', w: 0.18, d: '+'}, {c: 'natvegDeficit', w: 0.16, d: '+'},
    {c: 'ecoRestore', w: 0.15, d: '+'}, {c: 'soc', w: 0.13, d: '+'}, {c: 'rainfall', w: 0.11, d: '+'},
    {c: 'slope', w: 0.09, d: '+'}, {c: 'roadAccess', w: 0.05, d: '+'}, {c: 'ecoPressure', w: 0.05, d: '+'},
    {c: 'burnFreq', w: 0.08, d: '+'}
  ]},
  'Irrigation': { palette: ['#f7fcfd','#bfd3e6','#8c96c6','#88419d','#4d004b'], criteria: [
    {c: 'awc', w: 0.22, d: '+'}, {c: 'slope', w: 0.18, d: '-'}, {c: 'roadAccess', w: 0.15, d: '+'},
    {c: 'rainfall', w: 0.14, d: '-'}, {c: 'ndvi', w: 0.12, d: '+'}, {c: 'pop', w: 0.10, d: '+'},
    {c: 'drainageProx', w: 0.09, d: '-'}
  ]},
  'Agricultural Productivity': { palette: ['#ffffe5','#f7fcb9','#addd8e','#41ab5d','#005a32'], criteria: [
    {c: 'ndvi', w: 0.18, d: '+'}, {c: 'ndviCond', w: 0.16, d: '+'}, {c: 'rainfall', w: 0.16, d: '+'},
    {c: 'ph', w: 0.14, d: '+'}, {c: 'soc', w: 0.14, d: '+'}, {c: 'awc', w: 0.12, d: '+'},
    {c: 'cropland', w: 0.06, d: '+'}, {c: 'roadAccess', w: 0.04, d: '+'}
  ]},
  'Wetland Restoration': { palette: ['#f7fcf0','#ccebc5','#7bccc4','#2b8cbe','#084081'], criteria: [
    {c: 'drainageProx', w: 0.20, d: '-'}, {c: 'twi', w: 0.18, d: '+'}, {c: 'permWater', w: 0.16, d: '+'},
    {c: 'ndwi', w: 0.14, d: '+'}, {c: 'hand', w: 0.12, d: '-'}, {c: 'rainfall', w: 0.10, d: '+'},
    {c: 'ecoCondition', w: 0.06, d: '+'}, {c: 'wetlandSignal', w: 0.04, d: '+'}
  ]}
};
var MODEL_NAMES = ['Flood Mitigation', 'Erosion Control', 'Reforestation', 'Irrigation',
                   'Agricultural Productivity', 'Wetland Restoration'];

// Criteria whose natural baseline shifts strongly with climate/relief, so they are standardised
// WITHIN each ecozone (aridity x elevation, fix F) rather than across the whole catchment.
var ZONE_RELATIVE_CRITERIA = {ndvi: 1, ndviDeficit: 1, ndviDegrade: 1, ndviCond: 1};

// FIX (A.4): CLIMATE GATE - Flood Mitigation and Wetland Restoration are dominated by static
// terrain metrics (hand, twi, drainageProx, upa combine for 70% of the Flood Mitigation
// weight). Those are proxies for "would this pixel be wet IF water showed up" - they say
// nothing about whether enough rain ever arrives to generate that water. A flat desert
// pediment next to a wadi can score as flood-prone on terrain alone (low HAND, spiking TWI
// as slope -> 0) even though the wadi is dry most of the year. Rainfall is already one of the
// weighted criteria, but at 10-14% of the AHP weight it can't override that. So after the
// weighted overlay, multiply the whole composite by a zone-dependent factor - near zero in
// hyper-arid/arid zones, full weight once rainfall is reliably sufficient to generate runoff -
// instead of only nudging the linear weights. Deliberately keyed on ARIDITY zone only, not the
// combined ecoZone: this is specifically about whether enough rain arrives, and a montane
// pocket's orographic rainfall already raises its local aridity index (and thus its aridity
// zone) on its own. This is deliberately NOT applied to Erosion Control: semi-arid zones are
// classically the MOST erosion-prone (sparse cover + intense convective storms), so gating
// erosion priority by aridity would be scientifically backwards.
var CLIMATE_GATE = {
  //                     zone1  zone2  zone3  zone4  zone5
  //              hyper-arid   arid  semi-arid  dry-subhumid  humid
  'Flood Mitigation':    [0.05, 0.20, 0.55, 1.00, 1.00],
  'Wetland Restoration': [0.05, 0.20, 0.55, 1.00, 1.00]
};

function climateGateFactor(modelName, aridityZone) {
  var gate = CLIMATE_GATE[modelName];
  if (!gate) { return null; }
  var factor = ee.Image(1).toFloat();
  [1, 2, 3, 4, 5].forEach(function(z, i) { factor = factor.where(aridityZone.eq(z), gate[i]); });
  return factor;
}

// FIX (concurrent-aggregations): applies a 0-1 min-max stretch given ALREADY-COMPUTED lo/hi
// bounds. This is deliberately split from "how lo/hi get computed" (see buildModel() below) -
// the earlier version called reduceRegion() once PER CRITERION, and once per criterion PER
// ZONE for zone-relative criteria. Earth Engine re-runs every reduceRegion() baked into a
// displayed image once for EACH map tile it renders, and tiles render in parallel, so a model
// with several zone-relative criteria (e.g. Agricultural Productivity: both 'ndvi' and
// 'ndviCond') could fire ~19 aggregation calls in a burst and hit the account's concurrent-
// aggregation quota ("Too many concurrent aggregations"). buildModel() now fetches lo/hi for
// ALL of a model's criteria in at most 2 reduceRegion calls total (one combined multi-band
// call for the ordinary criteria, one combined grouped-by-zone call for the zone-relative
// ones) and this helper just applies the stretch each criterion's band already has.
function applyStretch(band, dir, lo, hi) {
  var flat = hi.subtract(lo).abs().lt(1e-9);
  var hiSafe = ee.Number(ee.Algorithms.If(flat, lo.add(1), hi));   // keep unitScale valid
  var s = band.unitScale(lo, hiSafe).clamp(0, 1);
  s = (dir === '-') ? s.multiply(-1).add(1) : s;
  return ee.Image(ee.Algorithms.If(flat, ee.Image(0), s)).toFloat();   // flat -> 0 contribution
}

/* ===================== H) SHARED EXCLUSION MASK (all six models, V9) ==================== */
/*  No intervention should ever be recommended on top of built-up land or open permanent water -
 *  applied to ALL SIX models (this replaces the old Wetland-Restoration-only built-up/water
 *  exclusion, using the same JRC occurrence-based permanent-water definition the model's own
 *  'permWater'/'hand' criteria already use, which is more temporally robust than a single-date
 *  WorldCover water class). Agricultural Productivity and Irrigation additionally exclude WDPA
 *  protected areas - siting NEW cropland/irrigation inside a protected area would be
 *  inappropriate. Restoration-oriented models (Reforestation, Erosion Control, Flood
 *  Mitigation, Wetland Restoration) deliberately do NOT exclude WDPA: intervening in/around a
 *  protected area is often exactly the point, and buildThemes() already treats WDPA as a
 *  positive biodiversity signal for the cluster typology, not an exclusion. */
var EXCLUDE_WDPA_FOR = {'Agricultural Productivity': 1, 'Irrigation': 1};

// Optional hook: point this at your own FeatureCollection asset of already-treated/committed
// intervention footprints (e.g. a tracker of ACReSAL sites already funded) to exclude them from
// new siting. Left empty by default - no such public dataset exists to wire in automatically.
var EXISTING_INTERVENTIONS_ASSET = '';

function exclusionMask(modelName, region) {
  var wc = ee.ImageCollection('ESA/WorldCover/v200').filterBounds(region).mosaic();
  var builtUp = wc.eq(50);
  var permWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).gte(50);
  var exclude = builtUp.or(permWater);
  if (EXCLUDE_WDPA_FOR[modelName]) {
    var wdpaFC = ee.FeatureCollection('WCMC/WDPA/current/polygons').filterBounds(region)
                   .map(function(f) { return f.simplify({maxError: 500}); });
    exclude = exclude.or(ee.Image().byte().paint(wdpaFC, 1).gt(0).unmask(0));
  }
  if (EXISTING_INTERVENTIONS_ASSET) {
    var existing = ee.FeatureCollection(EXISTING_INTERVENTIONS_ASSET).filterBounds(region);
    exclude = exclude.or(ee.Image().byte().paint(existing, 1).gt(0).unmask(0));
  }
  return exclude.not();   // true = eligible for this model
}

/* ===================== I) NORMALIZED CRITERIA / WEIGHTED COMPOSITE (V9 refactor) ======== */
/*  buildModel() used to do the expensive stretch-bound reduceRegion calls AND the weighted sum
 *  in one shot, so re-scoring with different weights (Monte Carlo sensitivity draws, or a
 *  user-edited pairwise-AHP weight set) meant repeating the reduceRegion calls every time. Split
 *  into two steps: buildNormalizedCriteria() does the expensive part once, producing one 0-1,
 *  direction-corrected band per criterion (band name = criterion key); weightedComposite() is
 *  pure, cheap band math that can be called many times against the SAME normalized image with
 *  different weight sets (see runSensitivityAnalysis() and the AHP weight editor in section 3). */
function buildNormalizedCriteria(modelName, region, layers) {
  var m = MODELS[modelName];
  var bands = {};

  var globalCr = m.criteria.filter(function(cr) { return !ZONE_RELATIVE_CRITERIA[cr.c]; });
  var zoneCr   = m.criteria.filter(function(cr) { return  ZONE_RELATIVE_CRITERIA[cr.c]; });

  // Ordinary criteria: ONE combined reduceRegion (2nd/98th percentile per band) for all of
  // them at once, same pattern the legacy buildPriority() already used further up this file.
  if (globalCr.length > 0) {
    var globalImg = ee.Image.cat(globalCr.map(function(cr) { return layers[cr.c].rename(cr.c).toFloat(); }));
    var globalPct = globalImg.reduceRegion({reducer: ee.Reducer.percentile([2, 98]), geometry: region,
      scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS});
    globalCr.forEach(function(cr) {
      var band = layers[cr.c].rename(cr.c).toFloat();
      var lo = ee.Number(ee.Algorithms.If(globalPct.contains(cr.c + '_p2'), globalPct.get(cr.c + '_p2'), 0));
      var hi = ee.Number(ee.Algorithms.If(globalPct.contains(cr.c + '_p98'), globalPct.get(cr.c + '_p98'), 0));
      bands[cr.c] = applyStretch(band, cr.d, lo, hi).rename(cr.c);
    });
  }

  // Zone-relative criteria (fix A.2/F: standardised WITHIN each ecozone - aridity x elevation -
  // not catchment-wide): ONE combined, grouped-by-ecozone reduceRegion for all of them at once,
  // instead of one call per criterion per zone. ee.Reducer.percentile([2,98]).group() returns
  // per-zone stats for every band in a single pass (same 'groups' pattern already used for
  // area-by-cluster and area-by-class elsewhere in this script), then a server-side .iterate()
  // recombines the per-zone stretch into one image without any extra reduceRegion calls.
  //
  // V9.1 fix ("Reducer.group: groupField out of range"): ee.Reducer.percentile([2,98]) has a
  // natural arity of 1 and auto-repeats across however many bands it's given when used
  // un-grouped (that's how the globalPct call above works on a multi-band image with no extra
  // setup) - but that auto-repeat is ambiguous once .group() is layered on top with MORE THAN
  // ONE data band (only Agricultural Productivity hits this: 'ndvi' + 'ndviCond' are both
  // zone-relative, so zoneCr.length is 2 there, 1 everywhere else zoneCr is non-empty). Calling
  // .repeat(zoneCr.length) first makes the arity explicit, so .group()'s groupField index (the
  // band placed right after those zoneCr.length repeated inputs) is unambiguous regardless of
  // how many zone-relative criteria a model has.
  if (zoneCr.length > 0) {
    var zoneImgMulti = ee.Image.cat(zoneCr.map(function(cr) { return layers[cr.c].rename(cr.c).toFloat(); }))
                          .addBands(layers.ecoZone.rename('zone'));
    var zoneGroups = ee.List(zoneImgMulti.reduceRegion({
      reducer: ee.Reducer.percentile([2, 98]).repeat(zoneCr.length).group({groupField: zoneCr.length, groupName: 'zone'}),
      geometry: region, scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS
    }).get('groups'));

    zoneCr.forEach(function(cr) {
      var band = layers[cr.c].rename(cr.c).toFloat();
      var stretched = ee.Image(zoneGroups.iterate(function(g, prevImg) {
        g = ee.Dictionary(g);
        var z = ee.Number(g.get('zone'));
        var lo = ee.Number(ee.Algorithms.If(g.contains(cr.c + '_p2'), g.get(cr.c + '_p2'), 0));
        var hi = ee.Number(ee.Algorithms.If(g.contains(cr.c + '_p98'), g.get(cr.c + '_p98'), 0));
        var s = applyStretch(band, cr.d, lo, hi);
        var mask = layers.ecoZone.eq(z);
        return ee.Image(prevImg).where(mask, s.unmask(ee.Image(prevImg)));
      }, ee.Image(0).toFloat()));
      bands[cr.c] = ee.Image(stretched).updateMask(band.mask()).rename(cr.c);
    });
  }

  return ee.Image.cat(m.criteria.map(function(cr) { return bands[cr.c]; }));
}

// Cheap weighted linear combination of already-normalized (0-1) criterion bands - no
// reduceRegion here, so it can be called many times (Monte Carlo draws, live AHP weight edits)
// without repeating buildNormalizedCriteria()'s expensive stretch-bound computation.
// weightOverrides is an optional {criterionKey: weight} map (renormalized to sum to 1
// internally, so callers don't have to); omit/null to use the model's own default AHP weights.
function weightedComposite(modelName, region, layers, normImg, weightOverrides) {
  var m = MODELS[modelName];
  var weights = weightOverrides || {};
  var sumW = 0;
  m.criteria.forEach(function(cr) { sumW += (weights[cr.c] !== undefined ? weights[cr.c] : cr.w); });
  var acc = ee.Image(0);
  m.criteria.forEach(function(cr) {
    var w = (weights[cr.c] !== undefined ? weights[cr.c] : cr.w) / sumW;
    acc = acc.add(normImg.select(cr.c).multiply(w));
  });

  var surface = acc.multiply(100).rename('priority').clip(region);
  var gate = climateGateFactor(modelName, layers.aridityZone);
  if (gate) { surface = surface.multiply(gate).rename('priority'); }
  surface = surface.updateMask(exclusionMask(modelName, region));
  return surface;
}

// Build one intervention's 0-100 suitability surface using its default AHP weights. Thin
// wrapper over buildNormalizedCriteria()+weightedComposite(), kept for every call site that
// doesn't need to reuse the normalized bands across multiple weight sets (exports, "download
// all six", change detection, etc.) - see those two functions for anything that does.
function buildModel(modelName, region, layers, weightOverrides) {
  var normImg = buildNormalizedCriteria(modelName, region, layers);
  return weightedComposite(modelName, region, layers, normImg, weightOverrides);
}

/* ===================== M) MINIMUM MAPPING UNIT / SIEVE FILTER (V9) ====================== */
/*  Classifying a continuous suitability surface pixel-by-pixel at 50-100 m produces "salt-and-
 *  pepper" noise - isolated single pixels of one class scattered inside a larger patch of
 *  another, which is not actionable for a field team siting a real intervention. This sieves
 *  out any patch smaller than MIN_PATCH_HA hectares by replacing it with the majority (focal
 *  mode) class of its neighbourhood - the same idea as GDAL's sieve filter - applied to every
 *  classified raster (priority classes and intervention clusters alike) before it is shown on
 *  the map, vectorized, or exported. */
var MIN_PATCH_HA = 1;   // hectares - patches smaller than this are merged into their neighbourhood

function applyMinMappingUnit(classified, region) {
  var minPixels = Math.max(1, Math.round((MIN_PATCH_HA * 10000) / (SCALE * SCALE)));
  var connected = classified.connectedPixelCount(minPixels + 1, true);
  var smoothed = classified.focalMode({radius: 1.5, kernelType: 'square', units: 'pixels'});
  var bandName = ee.String(classified.bandNames().get(0));
  return classified.where(connected.lte(minPixels), smoothed)
    .updateMask(classified.mask()).rename(bandName).clip(region);
}

/* ===================== B) FIXED 1-5 PRIORITY CLASSES (map + every export) ============== */
/*  Reclassifies a continuous 0-100 suitability/priority surface into 5 discrete classes
 *  (1 = lowest priority ... 5 = highest priority) using quintile breaks (20/40/60/80th
 *  percentile) computed once within the region - the same reduceRegion pattern (bestEffort,
 *  tileScale TS) used everywhere else in this script. This is what every export now writes.
 *  V9: the raw classification is now sieved with applyMinMappingUnit() before it's returned. */
function classifyPriority5(img, region) {
  var bandName = ee.String(img.bandNames().get(0));
  var q = img.reduceRegion({
    reducer: ee.Reducer.percentile([20, 40, 60, 80]), geometry: region,
    scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS
  });
  var b1 = ee.Number(q.get(bandName.cat('_p20')));
  var b2 = ee.Number(q.get(bandName.cat('_p40')));
  var b3 = ee.Number(q.get(bandName.cat('_p60')));
  var b4 = ee.Number(q.get(bandName.cat('_p80')));
  var cls = ee.Image(1)
    .where(img.gt(b1), 2)
    .where(img.gt(b2), 3)
    .where(img.gt(b3), 4)
    .where(img.gt(b4), 5)
    .updateMask(img.mask())
    .rename('priority_class').toInt().clip(region);
  return applyMinMappingUnit(cls, region).toInt();
}

/* ===================== 1b. PROPOSED INTERVENTION CLUSTERS ============================= */
/*  Each theme is a boolean presence layer; clusters are overlaps of themes (see CLUSTERS).
 *  This raster is already a fixed 1-5 categorical scheme, but it is a THEME TYPOLOGY by
 *  precedence (Agro > Hydro > Eco > Watershed > Biodiversity), not a ranked priority score -
 *  left as-is; the reforestation theme's vegetation test now uses the same Sentinel-2 NDVI
 *  and combined ecozone grouping as the live AHP path (V7), for consistency. */

var CLUSTERS = [
  {v: 1, label: 'Agro-Resilience Zone',          color: '#d95f0e',
   func: 'Agriculture + Erosion + Flood - protect farmland, reduce erosion, mitigate flood while sustaining productivity'},
  {v: 2, label: 'Hydro-Buffer Zone',             color: '#2c7fb8',
   func: 'Wetland + Irrigation + Flood - enhance water regulation, support irrigation, buffer floods'},
  {v: 3, label: 'Eco-Restoration Zone',          color: '#238b45',
   func: 'Reforestation + Biodiversity + Erosion (and standalone reforestation) - restore vegetation, conserve biodiversity, control erosion'},
  {v: 4, label: 'Watershed Protection Priority', color: '#756bb1',
   func: 'Erosion + Flood - stabilise soils, reduce sedimentation, safeguard watershed integrity'},
  {v: 5, label: 'Biodiversity Core Priority',    color: '#c51b8a',
   func: 'Biodiversity only - protect ecologically critical habitats and species'}
];
var CLUSTER_PALETTE = CLUSTERS.map(function(c) { return c.color; });

// Boolean theme masks within a region.
function buildThemes(region) {
  var wc = ee.ImageCollection('ESA/WorldCover/v200').filterBounds(region).mosaic();
  // V7: Sentinel-2 NDVI (10-20 m) replaces MODIS (250 m), matching the live AHP path (fix E).
  var ndviMean = s2NdviMedian(region).rename('NDVI');

  // Erosion (RUSLE-style, as in buildCriteria) -> high-erosion mask (top third within region)
  var dem = ee.Image('USGS/SRTMGL1_003');
  var slope = ee.Terrain.slope(dem);
  var nYears = ee.Number(ee.Date(END).difference(ee.Date(START), 'year'));
  var precip = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(START, END)
                 .filterBounds(region).select('precipitation').sum().divide(nYears).resample('bilinear');
  var sand = ee.Image('OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02').select('b0').resample('bilinear');
  var R = precip.multiply(0.363).add(79);
  var LS = slope.divide(9).add(1).pow(1.4);
  var K = sand.unitScale(0, 100);
  var C = ndviMean.multiply(-1).add(1).clamp(0, 1);
  var erosionIdx = R.multiply(LS).multiply(K).multiply(C);
  var erThr = ee.Number(erosionIdx.reduceRegion({reducer: ee.Reducer.percentile([66]),
    geometry: region, scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS}).values().get(0));
  var erosion = erosionIdx.gte(erThr).unmask(0);

  // Flood-prone: low height above nearest drainage (MERIT Hydro), < 5 m
  var flood = ee.Image('MERIT/Hydro/v1_0_1').select('hnd').lt(5).unmask(0);

  // Permanent water (JRC) and "near water" for irrigation potential
  var permWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).gte(50);
  var nearWater = permWater.focalMax(1000, 'circle', 'meters');

  var agri       = wc.eq(40);                                   // cropland
  var wetland    = wc.eq(90).or(wc.eq(80)).or(wc.eq(95));       // herbaceous wetland / water / mangrove
  var irrigation = agri.and(nearWater);                         // cropland within 1 km of permanent water

  // FIX (A.3/F): "sparse vegetation" for the reforestation theme is no longer a flat NDVI < 0.5
  // cutoff (which over-flags a naturally sparse Sahel/Arid zone and can miss real degradation
  // in a wetter/montane sub-zone). Instead use the 40th NDVI percentile computed SEPARATELY
  // within each combined ecozone (aridity x elevation, V7), so the threshold adapts to what
  // "sparse" means in that specific ecozone - a Sahel-Montane pocket is no longer judged
  // against Sahel-Lowland norms.
  // FIX (concurrent-aggregations): this used to call reduceRegion() twice per zone (10 calls
  // total) in a JS loop - one combined, grouped-by-zone reduceRegion (see buildModel() for why
  // that matters: every reduceRegion() baked into a displayed image re-runs per map tile).
  var pet = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE').filterDate(START, END)
              .filterBounds(region).select('pet').mean().multiply(0.1).multiply(12).resample('bilinear');
  var aridityZone = classifyAridityZone(precip.divide(pet.max(1)));
  var elevationZone = classifyElevationZone(dem);
  var ecoZone = buildEcoZone(aridityZone, elevationZone);
  // FIX (missing-key): a reducer given a SINGLE percentile value does not suffix its output
  // key with '_p40' the way a multi-value percentile.group() call does elsewhere in this
  // script (that suffix only appears to disambiguate multiple outputs) - the key here was
  // actually just 'NDVI', so a hardcoded '_p40' guess threw "Dictionary does not contain key".
  // .setOutputs() pins the key explicitly instead of relying on that naming convention, and
  // .contains() checks existence without throwing (unlike calling .get() on a missing key).
  // V9.1: .repeat(1) makes the reducer's arity explicit before .group() is layered on - see the
  // matching fix (and full explanation) on the zone-relative reduceRegion in
  // buildNormalizedCriteria() above ("Reducer.group: groupField out of range").
  var ndviZoneGroups = ee.List(ndviMean.addBands(ecoZone.rename('zone')).reduceRegion({
    reducer: ee.Reducer.percentile([40]).repeat(1).setOutputs(['ndviP40']).group({groupField: 1, groupName: 'zone'}),
    geometry: region, scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS
  }).get('groups'));
  var ndviSparse = ee.Image(ndviZoneGroups.iterate(function(g, prevImg) {
    g = ee.Dictionary(g);
    var z = ee.Number(g.get('zone'));
    var thr = ee.Number(ee.Algorithms.If(g.contains('ndviP40'), g.get('ndviP40'), 0.5));
    var mask = ecoZone.eq(z);
    return ee.Image(prevImg).where(mask, ndviMean.lt(thr));
  }, ee.Image(0).toByte()));
  var reforest = wc.eq(20).or(wc.eq(30)).or(wc.eq(60)).and(ndviSparse);

  var wdpaFC = ee.FeatureCollection('WCMC/WDPA/current/polygons')
                 .filterBounds(region)
                 .map(function(f) { return f.simplify({maxError: 500}); });
  var wdpa = ee.Image().byte().paint(wdpaFC, 1).gt(0).unmask(0);
  var biodiv = wdpa.or(wc.eq(10));                              // protected areas or tree cover

  return {agri: agri, erosion: erosion, flood: flood, wetland: wetland,
          irrigation: irrigation, reforest: reforest, biodiv: biodiv,
          aridityZone: aridityZone, elevationZone: elevationZone, ecoZone: ecoZone};
}

// Classify each pixel into ONE cluster by precedence (Agro > Hydro > Eco > Watershed > Biodiversity).
// V9: sieved with the same MMU filter as the priority classes (see applyMinMappingUnit) before
// masking out the "no cluster" (0) background, so the exported typology isn't salt-and-pepper.
function buildClusters(region) {
  var t = buildThemes(region);
  var agro      = t.agri.and(t.erosion).and(t.flood);
  var hydro     = t.wetland.and(t.irrigation).and(t.flood);
  var eco       = t.reforest.and(t.biodiv).and(t.erosion).or(t.reforest);
  var watershed = t.erosion.and(t.flood);
  var biodiv    = t.biodiv;
  var raw = ee.Image(0)
    .where(biodiv, 5).where(watershed, 4).where(eco, 3).where(hydro, 2).where(agro, 1)
    .rename('cluster');
  return applyMinMappingUnit(raw, region).clip(region).selfMask();
}

/* ============================ 2. WEIGHTED OVERLAY (legacy slider path) ================= */

function getWeightFractions() {
  var raw = {}, sum = 0;
  CRITERIA.forEach(function(c) { raw[c.key] = c.slider.getValue(); sum += raw[c.key]; });
  var fracs = {};
  CRITERIA.forEach(function(c) { fracs[c.key] = (sum > 0) ? raw[c.key] / sum : 0; });
  return {fracs: fracs, sum: sum};
}

// Returns {priority: 0-100 image, norm: multiband normalised image} for a region.
function buildPriority(region) {
  var crit = buildCriteria(region);

  var pct = crit.reduceRegion({
    reducer: ee.Reducer.percentile([2, 98]),
    geometry: region, scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS
  });

  var w = getWeightFractions().fracs;
  var priority = ee.Image(0);
  var normBands = [];

  CRITERIA.forEach(function(c) {
    var band = crit.select(c.key);
    var lo = ee.Number(pct.get(c.key + '_p2'));
    var hi = ee.Number(pct.get(c.key + '_p98'));
    var norm = band.subtract(lo).divide(hi.subtract(lo).max(1e-9)).clamp(0, 1);
    if (c.dir === 'cost') { norm = ee.Image(1).subtract(norm); }
    norm = norm.rename('n_' + c.key);
    normBands.push(norm);
    priority = priority.add(norm.multiply(w[c.key]));
  });

  priority = priority.multiply(100).rename('priority').clip(region);
  return {priority: priority, norm: ee.Image.cat(normBands).clip(region)};
}

/* ============================ 3. UI CONTROLS ========================================== */

var title = ui.Label('ACReSAL Within-Catchment Priority DSS', {
  fontWeight: 'bold', fontSize: '17px', margin: '4px 8px', color: '#0b6623'});
var subtitle = ui.Label('Best intervention areas INSIDE a chosen catchment', {
  fontSize: '12px', margin: '0 8px 8px 8px', color: '#555'});
var status = ui.Label('', {fontSize: '12px', color: '#b00', margin: '4px 8px'});

var catchSelect = ui.Select({placeholder: 'Loading catchments...', style: {stretch: 'horizontal'}});
var CATCH_NAMES = {};   // id -> catchment name (for synchronous labelling)

var GAUL1 = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM0_NAME', 'Nigeria'));
var GAUL2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.eq('ADM0_NAME', 'Nigeria'));
var NONE_STATE = '— none (use catchment) —';
var ALL_LGA    = 'All LGAs in state';
var stateSelect = ui.Select({placeholder: 'Loading states...', style: {stretch: 'horizontal'}});
var lgaSelect   = ui.Select({items: [ALL_LGA], value: ALL_LGA, style: {stretch: 'horizontal'}, disabled: true});

var STATE_OUTLINE = ee.Image().byte().paint(GAUL1, 1, 2);
var LGA_OUTLINE   = ee.Image().byte().paint(GAUL2, 1, 1);
function addAdminOverlays() {
  map.addLayer(LGA_OUTLINE,   {palette: ['#cccccc']}, 'LGA boundaries', false);
  map.addLayer(STATE_OUTLINE, {palette: ['#ffcc00']}, 'State boundaries', true);
}

/* ---- D) Output resolution control (V7) ------------------------------------------------ */
// User-selectable output/analysis resolution. Auto-suggested from the selected area (see
// updateAreaHint below) but always overridable before clicking a run button - SCALE is read
// synchronously from this at the start of every run via currentScale().
var resSelect = ui.Select({
  items: RESOLUTION_OPTIONS_M.map(function(r) { return r + ' m'; }),
  value: '60 m', style: {stretch: 'horizontal'}
});
var areaHintLabel = ui.Label('', {fontSize: '10.5px', margin: '2px 8px 6px 8px', color: '#777'});

function currentScale() { return parseInt(resSelect.getValue(), 10); }

function updateAreaHint(region) {
  areaHintLabel.setValue('Estimating area for resolution guidance...');
  ee.Number(region.area(1e3)).divide(1e6).evaluate(function(areaKm2, err) {
    if (err || areaKm2 === null || areaKm2 === undefined) { areaHintLabel.setValue(''); return; }
    var suggestion = (areaKm2 > 50000) ? 100 : ((areaKm2 > 15000) ? 60 : 50);
    resSelect.setValue(suggestion + ' m', false);
    areaHintLabel.setValue('Area ≈ ' + Math.round(areaKm2).toLocaleString() + ' km². Suggested: ' +
      suggestion + ' m (editable above). Fine resolutions (50-60 m) over a large State are more ' +
      'likely to need the "Drive export" buttons below instead of the interactive links, since ' +
      'interactive calls share a much smaller compute-time budget than a queued Drive task.');
  });
}

// Intervention model selector + read-only display of that model's AHP criteria.
var modelSelect = ui.Select({items: MODEL_NAMES, value: MODEL_NAMES[0], style: {stretch: 'horizontal'}});
var modelInfo   = ui.Panel({style: {margin: '2px 8px'}});
function showModelCriteria() {
  modelInfo.clear();
  var m = MODELS[modelSelect.getValue()];
  modelInfo.add(ui.Label('AHP criteria & weights', {fontWeight: 'bold', fontSize: '11px', margin: '6px 4px 2px 4px'}));
  m.criteria.forEach(function(cr) {
    var dir = (cr.d === '+') ? 'high→priority' : 'low→priority';
    var zoneTag = ZONE_RELATIVE_CRITERIA[cr.c] ? ', ecozone-relative' : '';
    modelInfo.add(ui.Label('• ' + cr.c + '  —  ' + cr.w.toFixed(2) + '  (' + dir + zoneTag + ')',
      {fontSize: '10.5px', margin: '1px 4px', color: '#444'}));
  });
  if (CLIMATE_GATE[modelSelect.getValue()]) {
    modelInfo.add(ui.Label('⚠ climate-gated: composite score is scaled down in hyper-arid/arid zones ' +
      '(terrain alone can’t flag flood/wetland priority where there isn’t enough rain to generate it)',
      {fontSize: '10px', margin: '4px 4px 2px 4px', color: '#a15c00', fontStyle: 'italic'}));
  }
}
modelSelect.onChange(function() {
  showModelCriteria();
  if (ahpPanel.style().get('shown')) { buildAHPMatrixUI(); }
});
showModelCriteria();
var weightsPanel = ui.Panel([
  ui.Label('Intervention model', {fontWeight: 'bold', fontSize: '12px', margin: '10px 8px 2px 8px'}),
  modelSelect, modelInfo]);

/* ---- E) Pairwise AHP weight editor + Consistency Ratio (V9) ---------------------------- */
/*  The six models' weights were asserted, not derived from a pairwise comparison, so there was
 *  no way to check they were internally consistent (a core AHP credibility check). This lets a
 *  user re-derive a model's weights from Saaty-scale pairwise judgments (row criterion vs
 *  column criterion) and reports the Consistency Ratio (CR) - the standard AHP sanity check;
 *  CR < 0.10 is conventionally "acceptably consistent". Uses the standard closed-form
 *  approximation to the principal eigenvector (normalise each column to sum to 1, then average
 *  each row) rather than a full eigen-decomposition - the accepted simplified method for the
 *  small matrices here (n <= 9) and what most spreadsheet/manual AHP workflows use. */
// Compact labels - the matrix has to fit an up-to-9x9 grid inside a 380px sidebar panel, so the
// full Saaty verbal scale (see the instruction label above the matrix) is spelled out once
// instead of per-cell. If a panel is still too narrow for a wide model, the split-panel divider
// between the sidebar and the map can usually be dragged wider.
var SAATY_SCALE = [
  {label: '1/9', v: 1 / 9}, {label: '1/7', v: 1 / 7}, {label: '1/5', v: 1 / 5}, {label: '1/3', v: 1 / 3},
  {label: '1', v: 1}, {label: '3', v: 3}, {label: '5', v: 5}, {label: '7', v: 7}, {label: '9', v: 9}
];
var SAATY_RI = {1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49};

// Deep copy of the built-in AHP weights, kept so "Reset to default weights" can restore them.
var DEFAULT_MODEL_WEIGHTS = {};
MODEL_NAMES.forEach(function(mn) {
  DEFAULT_MODEL_WEIGHTS[mn] = MODELS[mn].criteria.map(function(cr) { return cr.w; });
});
function resetModelWeights(modelName) {
  MODELS[modelName].criteria.forEach(function(cr, i) { cr.w = DEFAULT_MODEL_WEIGHTS[modelName][i]; });
}

function computeAHPWeights(matrix) {
  var n = matrix.length, i, j;
  var colSums = [];
  for (j = 0; j < n; j++) {
    var s = 0;
    for (i = 0; i < n; i++) { s += matrix[i][j]; }
    colSums.push(s);
  }
  var weights = [];
  for (i = 0; i < n; i++) {
    var rowSum = 0;
    for (j = 0; j < n; j++) { rowSum += matrix[i][j] / colSums[j]; }
    weights.push(rowSum / n);
  }
  var lambdaMax = 0;
  for (i = 0; i < n; i++) {
    var Aw = 0;
    for (j = 0; j < n; j++) { Aw += matrix[i][j] * weights[j]; }
    lambdaMax += Aw / weights[i];
  }
  lambdaMax = lambdaMax / n;
  var ci = (n > 2) ? (lambdaMax - n) / (n - 1) : 0;
  var ri = SAATY_RI[n] !== undefined ? SAATY_RI[n] : 1.49;
  var cr = (ri > 0) ? ci / ri : 0;
  return {weights: weights, lambdaMax: lambdaMax, ci: ci, cr: cr};
}

var ahpToggleBtn = ui.Button({label: '⚖ Adjust AHP weights (pairwise comparison)',
  style: {stretch: 'horizontal', margin: '4px 8px 0 8px'}});
var ahpPanel = ui.Panel({style: {margin: '2px 8px 8px 8px', shown: false}});
var ahpMatrixPanel = ui.Panel();
var ahpResultLabel = ui.Label('', {fontSize: '10px', margin: '4px 4px', color: '#444', whiteSpace: 'pre-wrap'});
var ahpMatrixSelects = [];   // ahpMatrixSelects[i][j] = ui.Select for j>i, else null

function buildAHPMatrixUI() {
  ahpMatrixPanel.clear();
  ahpMatrixSelects = [];
  var m = MODELS[modelSelect.getValue()];
  var n = m.criteria.length;
  ahpMatrixPanel.add(ui.Label(
    'How much more important is the ROW criterion than the COLUMN one? Scale: 1=equal, ' +
    '3=moderate, 5=strong, 7=very strong, 9=extreme; 1/x = the COLUMN criterion is more ' +
    'important instead. Only cells above the diagonal are editable (n=' + n + ' criteria - ' +
    'widen the side panel by dragging its right edge if the row runs off-screen).',
    {fontSize: '9.5px', color: '#555', margin: '2px 4px 6px 4px'}));
  for (var i = 0; i < n; i++) {
    ahpMatrixSelects.push([]);
    var row = [ui.Label(m.criteria[i].c, {fontSize: '8.5px', margin: '2px', width: '58px'})];
    for (var j = 0; j < n; j++) {
      if (j === i) {
        row.push(ui.Label('1', {fontSize: '8.5px', margin: '1px', width: '26px', textAlign: 'center'}));
        ahpMatrixSelects[i].push(null);
      } else if (j > i) {
        var sel = ui.Select({items: SAATY_SCALE.map(function(s) { return s.label; }),
          value: '1', style: {width: '38px', fontSize: '8px', margin: '1px'}});
        row.push(sel);
        ahpMatrixSelects[i].push(sel);
      } else {
        row.push(ui.Label('·', {fontSize: '8.5px', margin: '1px', width: '26px', color: '#bbb', textAlign: 'center'}));
        ahpMatrixSelects[i].push(null);
      }
    }
    ahpMatrixPanel.add(ui.Panel(row, ui.Panel.Layout.flow('horizontal'), {margin: '0'}));
  }
  ahpResultLabel.setValue('');
}

function readAHPMatrix() {
  var m = MODELS[modelSelect.getValue()];
  var n = m.criteria.length;
  var matrix = [];
  for (var i = 0; i < n; i++) { matrix.push([]); for (var j = 0; j < n; j++) { matrix[i].push(1); } }
  for (var i2 = 0; i2 < n; i2++) {
    for (var j2 = i2 + 1; j2 < n; j2++) {
      var label = ahpMatrixSelects[i2][j2].getValue();
      var entry = SAATY_SCALE.filter(function(s) { return s.label === label; })[0];
      var v = entry ? entry.v : 1;
      matrix[i2][j2] = v;
      matrix[j2][i2] = 1 / v;
    }
  }
  return matrix;
}

var ahpApplyBtn = ui.Button({label: 'Compute & apply weights', style: {stretch: 'horizontal', margin: '2px'}});
var ahpResetBtn = ui.Button({label: 'Reset to default weights', style: {stretch: 'horizontal', margin: '2px'}});
ahpApplyBtn.onClick(function() {
  var modelName = modelSelect.getValue();
  var matrix = readAHPMatrix();
  var result = computeAHPWeights(matrix);
  var m = MODELS[modelName];
  var consistent = result.cr < 0.10;
  var lines = m.criteria.map(function(cr, i) { return cr.c + '=' + result.weights[i].toFixed(3); });
  ahpResultLabel.setValue(
    'λmax=' + result.lambdaMax.toFixed(3) + '  CI=' + result.ci.toFixed(3) + '  CR=' + result.cr.toFixed(3) +
    (consistent ? '  ✓ consistent (CR<0.10)' : '  ⚠ INCONSISTENT (CR≥0.10) - applied anyway, but revise your judgments') +
    '\n' + lines.join(', '));
  m.criteria.forEach(function(cr, i) { cr.w = result.weights[i]; });
  showModelCriteria();
  if (current && current.model === modelName) { run(); }
});
ahpResetBtn.onClick(function() {
  var modelName = modelSelect.getValue();
  resetModelWeights(modelName);
  showModelCriteria();
  buildAHPMatrixUI();
  ahpResultLabel.setValue('Reset to default AHP weights.');
  if (current && current.model === modelName) { run(); }
});
ahpToggleBtn.onClick(function() {
  var showing = !ahpPanel.style().get('shown');
  ahpPanel.style().set('shown', showing);
  if (showing) { buildAHPMatrixUI(); }
});
ahpPanel.add(ahpMatrixPanel);
ahpPanel.add(ui.Panel([ahpApplyBtn, ahpResetBtn], ui.Panel.Layout.flow('horizontal'), {margin: '4px 0'}));
ahpPanel.add(ahpResultLabel);

/* ---- Methodology / data-sources info panel (adoptability) ----------------------------- */
var infoToggleBtn = ui.Button({label: 'ℹ Data sources & methodology', style: {stretch: 'horizontal', margin: '4px 8px'}});
var infoPanel = ui.Panel({style: {margin: '0 8px 6px 8px', shown: false}});
infoPanel.add(ui.Label(
  'Terrain: SRTM 30 m. Vegetation/water: Sentinel-2 SR 10-20 m (cloud-masked). Land cover: ' +
  'ESA WorldCover v200, 10 m. Hydrology: MERIT Hydro ~90 m. Rainfall: CHIRPS ~5.5 km. PET/' +
  'aridity: TerraClimate ~4 km. Soils: OpenLandMap 250 m. Population: HRSL ~30 m. Roads: ' +
  'GRIP4 (Africa) vectors. Protected areas: WDPA. Surface water: JRC GSW v1.4. Coarser layers ' +
  '(rainfall, PET, soils) are bilinearly resampled onto the output grid - this smooths but ' +
  'cannot add detail finer than the source data. Zone-relative criteria (vegetation cover) are ' +
  'standardised within a combined ecozone = 5-class aridity zone × 3-class elevation zone, so ' +
  'sparse vegetation in a Sahel-Montane pocket (e.g. an isolated highland) is judged against ' +
  'that pocket\'s own norm, not the surrounding lowland\'s. Output/analysis resolution is user-' +
  'selectable (50/60/100 m); every export writes fixed 1-5 priority classes (quintile breaks), ' +
  'not the raw 0-100 suitability surface.',
  {fontSize: '10px', color: '#555', margin: '2px 4px'}));
infoToggleBtn.onClick(function() { infoPanel.style().set('shown', !infoPanel.style().get('shown')); });

var runButton   = ui.Button({label: 'Map priority areas (classes 1-5)', style: {stretch: 'horizontal', margin: '8px'}});
var clusterButton = ui.Button({label: 'Show proposed intervention clusters',
  style: {stretch: 'horizontal', margin: '0 8px 8px 8px'}});
var currentClusters = null;   // {cls, region, name} - set by runClusters()
var cTifLabel = ui.Label('', {fontSize: '11px', margin: '2px 8px', color: '#1a56cc'});
var cShpLabel = ui.Label('', {fontSize: '11px', margin: '2px 8px 8px 8px', color: '#1a56cc'});
var resetButton = ui.Button({label: 'Download all six models (classes 1-5, queues Drive tasks)',
  style: {stretch: 'horizontal', margin: '0 8px 8px 8px'}});
var allPanel = ui.Panel();   // holds the "all six models" status messages

// --- Export (works in-app for a catchment; run first) ---
var geotiffBtn   = ui.Button({label: 'Prepare GeoTIFF link (interactive)', style: {stretch: 'horizontal', margin: '4px 8px 0 8px'}, onClick: exportGeoTIFF});
var geotiffLabel = ui.Label('', {fontSize: '11px', margin: '2px 8px', color: '#1a56cc'});
var geotiffDriveBtn = ui.Button({label: 'Or queue as Drive export (large areas)', style: {stretch: 'horizontal', margin: '0 8px 0 8px'}, onClick: queueGeoTIFFToDrive});
var shpBtn       = ui.Button({label: 'Prepare priority-class Shapefile (interactive)', style: {stretch: 'horizontal', margin: '4px 8px 0 8px'}, onClick: exportShapefile});
var shpLabel     = ui.Label('', {fontSize: '11px', margin: '2px 8px 8px 8px', color: '#1a56cc'});
var shpDriveBtn  = ui.Button({label: 'Or queue Shapefile as Drive export', style: {stretch: 'horizontal', margin: '0 8px 8px 8px'}, onClick: queueShapefileToDrive});
var exportPanel  = ui.Panel([
  ui.Label('Export (classes 1-5; run the analysis first)', {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px 2px 8px'}),
  geotiffBtn, geotiffLabel, geotiffDriveBtn,
  shpBtn, shpLabel, shpDriveBtn
]);

function labelled(text, widget) {
  return ui.Panel([ui.Label(text, {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px 2px 8px'}), widget]);
}

/* ---- K) Two-period comparison / change detection (V9) ---------------------------------- */
var PERIOD_PRESETS = [
  {label: '2018-2021 vs 2022-2025 (early vs recent)', a: ['2018-01-01', '2022-01-01'], b: ['2022-01-01', '2026-01-01']},
  {label: 'Full period vs last 3 years', a: ['2018-01-01', '2026-01-01'], b: ['2023-01-01', '2026-01-01']}
];
var periodSelect = ui.Select({items: PERIOD_PRESETS.map(function(p) { return p.label; }),
  value: PERIOD_PRESETS[0].label, style: {stretch: 'horizontal'}});
var changeBtn = ui.Button({label: 'Compare periods (change detection)',
  style: {stretch: 'horizontal', margin: '0 8px 8px 8px'}});

/* ---- L) Exploratory CMIP6 future-rainfall signal (V9, off model weights) --------------- */
var cmip6Btn = ui.Button({label: 'Show exploratory future-rainfall signal (CMIP6)',
  style: {stretch: 'horizontal', margin: '0 8px 8px 8px'}});

var moreToolsPanel = ui.Panel([
  labelled('Change-detection period preset', periodSelect), changeBtn, cmip6Btn
]);

var controlPanel = ui.Panel({style: {width: '380px', padding: '4px'}, widgets: [
  title, subtitle,
  labelled('Strategic catchment', catchSelect),
  labelled('State (overrides catchment)', stateSelect),
  labelled('LGA', lgaSelect),
  labelled('Output resolution', resSelect), areaHintLabel,
  infoToggleBtn, infoPanel,
  weightsPanel, ahpToggleBtn, ahpPanel, runButton, resetButton,
  clusterButton, moreToolsPanel,
  exportPanel, status]});
var resultsPanel   = ui.Panel({style: {width: '380px', padding: '4px'}});
var breakdownPanel = ui.Panel();
var clusterPanel   = ui.Panel({style: {width: '380px', padding: '4px'}});
var changePanel    = ui.Panel({style: {width: '380px', padding: '4px'}});
controlPanel.add(resultsPanel);
controlPanel.add(allPanel);
controlPanel.add(clusterPanel);
controlPanel.add(changePanel);

var map = ui.Map();
addAdminOverlays();

/* populate catchment dropdown */
SCMP.map(function(f) { return f.setGeometry(null); }).select([NAME_FIELD]).evaluate(function(fc, err) {
  if (err) { status.setValue('Layer error: ' + err); return; }
  var items = fc.features.map(function(ft) {
    CATCH_NAMES[ft.id] = String(ft.properties[NAME_FIELD]);
    return {label: String(ft.properties[NAME_FIELD]), value: ft.id};
  });
  items.sort(function(a, b) { return a.label < b.label ? -1 : 1; });
  catchSelect.items().reset(items);
  catchSelect.setValue(items[0].value, false);
  catchSelect.setPlaceholder('Select a catchment');
  var sel0 = getSelectedRegion();
  if (sel0) { updateAreaHint(sel0.region); }
});

/* populate STATE dropdown from GAUL, then cascade to LGA */
GAUL1.aggregate_array('ADM1_NAME').distinct().sort().evaluate(function(names) {
  var items = [NONE_STATE].concat(names || []);
  stateSelect.items().reset(items);
  stateSelect.setValue(NONE_STATE, false);
  stateSelect.setPlaceholder('State');
});
stateSelect.onChange(function(st) {
  if (!st || st === NONE_STATE) {
    lgaSelect.items().reset([ALL_LGA]); lgaSelect.setValue(ALL_LGA, false); lgaSelect.setDisabled(true);
    var selC = getSelectedRegion(); if (selC) { updateAreaHint(selC.region); }
    return;
  }
  lgaSelect.items().reset([]); lgaSelect.setPlaceholder('Loading...'); lgaSelect.setDisabled(true);
  GAUL2.filter(ee.Filter.eq('ADM1_NAME', st)).aggregate_array('ADM2_NAME').distinct().sort()
    .evaluate(function(lgas) {
      lgaSelect.items().reset([ALL_LGA].concat(lgas || []));
      lgaSelect.setValue(ALL_LGA, false);
      lgaSelect.setPlaceholder('LGA'); lgaSelect.setDisabled(false);
      var selS = getSelectedRegion(); if (selS) { updateAreaHint(selS.region); }
    });
});
lgaSelect.onChange(function() {
  var sel = getSelectedRegion();
  if (sel) { updateAreaHint(sel.region); }
});
catchSelect.onChange(function() {
  var sel = getSelectedRegion();
  if (sel) { updateAreaHint(sel.region); }
});

function getSelectedRegion() {
  var st = stateSelect.getValue(), lg = lgaSelect.getValue();
  if (st && st !== NONE_STATE) {
    if (lg && lg !== ALL_LGA) {
      var f2 = ee.Feature(GAUL2.filter(ee.Filter.and(
        ee.Filter.eq('ADM1_NAME', st), ee.Filter.eq('ADM2_NAME', lg))).first());
      return {region: f2.geometry(), boundary: ee.FeatureCollection([f2]),
              name: (lg + '_' + st).replace(/[^A-Za-z0-9]+/g, '_'), label: lg + ' LGA (' + st + ')'};
    }
    var f1 = ee.Feature(GAUL1.filter(ee.Filter.eq('ADM1_NAME', st)).first());
    return {region: f1.geometry(), boundary: ee.FeatureCollection([f1]),
            name: st.replace(/[^A-Za-z0-9]+/g, '_'), label: st + ' State'};
  }
  var idx = catchSelect.getValue();
  if (!idx) { return null; }
  var feat = SCMP.filter(ee.Filter.eq('system:index', idx)).first();
  return {region: feat.geometry(), boundary: ee.FeatureCollection([feat]),
          name: (CATCH_NAMES[idx] || 'catchment').replace(/[^A-Za-z0-9]+/g, '_'),
          label: (CATCH_NAMES[idx] || 'catchment')};
}

/* ============================ 4. RUN & RENDER ======================================== */

// current: {priority (continuous 0-100, for histogram/click breakdown), priorityClass
// (1-5, drives map display AND every export), region, name, model, layers, palette}
var current = null;

function run() {
  var sel = getSelectedRegion();
  if (!sel) { status.setValue('Select a catchment, or a State/LGA.'); return; }
  SCALE = currentScale();
  runWithScale(sel);
}

function classLegend(titleText, labels, palette) {
  var panel = ui.Panel([ui.Label(titleText, {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px 2px 8px'})]);
  labels.forEach(function(lab, i) {
    panel.add(ui.Panel(
      [ui.Label('', {backgroundColor: palette[i], padding: '7px', margin: '3px 4px 3px 8px'}),
       ui.Label(lab, {fontSize: '10.5px', margin: '2px 4px'})],
      ui.Panel.Layout.flow('horizontal'), {margin: '0'}));
  });
  return panel;
}

function runWithScale(sel) {
  var modelName = modelSelect.getValue();
  status.setValue('Computing ' + modelName + ' suitability for ' + sel.label +
    ' at ' + SCALE + ' m...');
  map.layers().reset();
  resultsPanel.clear();

  var region = sel.region;
  var layers = criterionLayers(region);
  // V9: split so the sensitivity analysis (and any future re-weighting) can reuse normImg
  // without repeating buildNormalizedCriteria()'s reduceRegion calls - see weightedComposite().
  var normImg = buildNormalizedCriteria(modelName, region, layers);
  var priority = weightedComposite(modelName, region, layers, normImg, null);
  var priorityClass = classifyPriority5(priority, region);
  var pal = MODELS[modelName].palette;
  current = {priority: priority, priorityClass: priorityClass, region: region, name: sel.name,
             model: modelName, layers: layers, palette: pal, normImg: normImg};

  // Agro-ecological / aridity / elevation zone context layers - off by default, toggle to inspect.
  map.addLayer(layers.aridityZone, {min: 1, max: 5, palette: ARIDITY_ZONE_PALETTE},
    'Aridity zone (1=hyper-arid ... 5=humid)', false);
  map.addLayer(layers.elevationZone, {min: 1, max: 3, palette: ELEVATION_ZONE_PALETTE},
    'Elevation zone (1=lowland, 2=upland, 3=montane)', false);

  map.addLayer(priorityClass, {min: 1, max: 5, palette: pal}, modelName + ' priority class (1-5)');
  map.addLayer(ee.Image().byte().paint(sel.boundary, 1, 2),
               {palette: ['#000000']}, sel.label + ' boundary');

  map.centerObject(region, 9);

  // area (ha) per priority class within the region
  var grouped = ee.Image.pixelArea().divide(1e4).addBands(priorityClass)
    .reduceRegion({reducer: ee.Reducer.sum().group(1, 'priority_class'), geometry: region,
                   scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS}).get('groups');
  var areaLabel = ui.Label('Computing class areas...', {fontSize: '12px', margin: '8px'});
  ee.List(grouped).evaluate(function(list) {
    if (!list) { areaLabel.setValue('No class areas returned.'); return; }
    var by = {};
    list.forEach(function(g) { by[g.priority_class] = g.sum; });
    var lines = [1, 2, 3, 4, 5].map(function(v) {
      return 'Class ' + v + ': ' + (by[v] ? Math.round(by[v]).toLocaleString() : '0') + ' ha';
    });
    areaLabel.setValue(modelName + ' - area by priority class\n' + lines.join('\n'));
  });

  var hist = ui.Chart.image.histogram({image: priority, region: region, scale: statsScale(),
      maxBuckets: 30, maxPixels: 1e10})
    .setOptions({title: modelName + ' suitability distribution (pre-classification)',
                 hAxis: {title: 'Suitability (0-100)'},
                 vAxis: {title: 'Pixels'}, legend: {position: 'none'}, colors: [pal[3]]});

  resultsPanel.add(ui.Label('Results — ' + modelName + '  (' + SCALE + ' m)', {fontWeight: 'bold', margin: '8px 8px 2px 8px'}));
  resultsPanel.add(areaLabel);
  resultsPanel.add(hist);
  resultsPanel.add(classLegend(modelName + ' priority class (1 low → 5 high)', PRIORITY_CLASS_LABELS, pal));

  // Per-model download buttons (GeoTIFF + Shapefile, both classified 1-5).
  resultsPanel.add(ui.Label('Download this model (classes 1-5)', {fontWeight: 'bold', fontSize: '12px', margin: '10px 8px 2px 8px'}));
  var tifB = ui.Button({label: 'GeoTIFF (interactive)', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: exportModelGeoTIFF});
  var tifDriveB = ui.Button({label: 'Or queue GeoTIFF as Drive export', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: queueModelGeoTIFFToDrive});
  var shpB = ui.Button({label: 'Shapefile (interactive)', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: exportModelShapefile});
  resultsPanel.add(tifB); resultsPanel.add(mTifLabel);
  resultsPanel.add(tifDriveB);
  resultsPanel.add(shpB); resultsPanel.add(mShpLabel);
  mTifLabel.setValue(''); mShpLabel.setValue('');

  // V9: candidate site points (centroids of large class-5 patches).
  resultsPanel.add(ui.Label('Candidate site points (class-5 patches ≥ ' + SITE_MIN_AREA_HA + ' ha)',
    {fontWeight: 'bold', fontSize: '12px', margin: '10px 8px 2px 8px'}));
  var siteB = ui.Button({label: 'Site points (interactive)', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: exportSitePoints});
  var siteDriveB = ui.Button({label: 'Or queue site points as Drive export', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: queueSitePointsToDrive});
  resultsPanel.add(siteB); resultsPanel.add(siteLabel); resultsPanel.add(siteDriveB);
  siteLabel.setValue('');

  // V9: Monte Carlo weight-sensitivity analysis.
  resultsPanel.add(sensitivityBtn); resultsPanel.add(sensitivityLabel);
  sensitivityLabel.setValue('');

  breakdownPanel.clear();
  resultsPanel.add(breakdownPanel);

  addAdminOverlays();
  status.setValue('');
}
runButton.onClick(run);

/* ---- Per-model downloads (classified 1-5 raster/vector) ---- */
var mTifLabel = ui.Label('', {fontSize: '11px', margin: '2px 8px', color: '#1a56cc'});
var mShpLabel = ui.Label('', {fontSize: '11px', margin: '2px 8px 8px 8px', color: '#1a56cc'});

/* ===================== J) CANDIDATE SITE POINTS (V9) ===================================== */
/*  Converts the largest class-5 ("very high priority") patches into point candidates - more
 *  directly actionable for a field team than a raw raster mask. Uses the SAME classified,
 *  MMU-sieved raster the map/exports already use, so this is consistent with everything else. */
var SITE_MIN_AREA_HA = 5;   // minimum class-5 patch size (hectares) to generate a candidate point
var siteLabel = ui.Label('', {fontSize: '11px', margin: '2px 8px 8px 8px', color: '#1a56cc'});

function candidateSitePoints(priorityClass, region, modelName) {
  var top = priorityClass.eq(5).selfMask();
  var vec = top.reduceToVectors({
    geometry: region, scale: SCALE, geometryType: 'polygon', eightConnected: true,
    maxPixels: 1e10, bestEffort: true, tileScale: TS
  });
  vec = vec.map(function(f) { return f.set('area_ha', f.geometry().area(1).divide(10000)); })
           .filter(ee.Filter.gte('area_ha', SITE_MIN_AREA_HA));
  return vec.map(function(f) {
    return ee.Feature(f.geometry().centroid(1), {model: modelName, area_ha: f.get('area_ha'), priority_class: 5});
  });
}

function exportSitePoints() {
  if (!current || !current.priorityClass) { status.setValue('Run a model first.'); return; }
  siteLabel.setValue('Building candidate site points...'); siteLabel.setUrl('');
  var pts = candidateSitePoints(current.priorityClass, current.region, current.model);
  pts.getDownloadURL('SHP', ['model', 'area_ha', 'priority_class'],
    ('ACReSAL_' + current.model + '_sites_' + current.name).replace(/[^A-Za-z0-9]+/g, '_'),
    function(url, err) {
      if (err) { siteLabel.setValue('Site-points error - try Drive export instead: ' + err); return; }
      siteLabel.setValue('⬇ Download candidate site points (Shapefile)'); siteLabel.setUrl(url);
    });
}

function queueSitePointsToDrive() {
  if (!current || !current.priorityClass) { status.setValue('Run a model first.'); return; }
  var pts = candidateSitePoints(current.priorityClass, current.region, current.model);
  Export.table.toDrive({
    collection: pts,
    description: ('ACReSAL_' + current.model + '_sites_' + current.name + '_' + SCALE + 'm').replace(/[^A-Za-z0-9]+/g, '_'),
    fileFormat: 'SHP'
  });
  status.setValue('Queued candidate site points - open the Tasks tab and click Run.');
}

/* ===================== N) MONTE CARLO WEIGHT-SENSITIVITY ANALYSIS (V9) =================== */
/*  Perturbs each criterion's weight by +/-WEIGHT_PERTURBATION (renormalized to sum to 1) across
 *  N_MC_DRAWS draws and re-scores the SAME normalized criteria (current.normImg - no repeated
 *  reduceRegion calls, see weightedComposite()), showing where the result is sensitive to the
 *  exact AHP weights used vs. robust to them. class5_frequency near 0 or 1 = a stable call;
 *  near 0.5 = a borderline pixel whose class flips depending on which draw you look at. */
var N_MC_DRAWS = 24;
var WEIGHT_PERTURBATION = 0.2;   // +/-20% multiplicative perturbation per criterion weight
var sensitivityBtn = ui.Button({label: 'Run weight-sensitivity analysis (Monte Carlo, N=' + N_MC_DRAWS + ')',
  style: {stretch: 'horizontal', margin: '10px 8px 2px 8px'}, onClick: runSensitivityAnalysis});
var sensitivityLabel = ui.Label('', {fontSize: '10px', margin: '2px 8px 8px 8px', color: '#555'});

function runSensitivityAnalysis() {
  if (!current || !current.normImg) { status.setValue('Run a model first.'); return; }
  var modelName = current.model, region = current.region, layers = current.layers, normImg = current.normImg;
  status.setValue('Running ' + N_MC_DRAWS + '-draw weight-sensitivity analysis for ' + modelName + '...');

  var q = current.priority.reduceRegion({reducer: ee.Reducer.percentile([80]), geometry: region,
    scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS});
  var b4 = ee.Number(q.get('priority_p80'));

  var m = MODELS[modelName];
  var draws = [];
  for (var i = 0; i < N_MC_DRAWS; i++) {
    var perturbed = {};
    m.criteria.forEach(function(cr) { perturbed[cr.c] = cr.w * (1 + (Math.random() * 2 - 1) * WEIGHT_PERTURBATION); });
    draws.push(weightedComposite(modelName, region, layers, normImg, perturbed));
  }
  var drawCol = ee.ImageCollection(draws);
  var scoreStdDev = drawCol.reduce(ee.Reducer.stdDev()).rename('scoreStdDev');
  var class5Freq = ee.ImageCollection(draws.map(function(img) { return img.gt(b4).rename('c5'); }))
                     .reduce(ee.Reducer.mean()).rename('class5_frequency');

  map.addLayer(scoreStdDev, {min: 0, max: 15, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8']},
    modelName + ' - weight sensitivity (score std-dev)', false);
  map.addLayer(class5Freq, {min: 0, max: 1, palette: ['#ffffff', '#fee08b', '#d73027']},
    modelName + ' - class-5 stability (frac. of draws)', true);

  ee.Image.cat([scoreStdDev, class5Freq]).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: region, scale: statsScale(), maxPixels: 1e10,
    bestEffort: true, tileScale: TS
  }).evaluate(function(v) {
    if (!v) { sensitivityLabel.setValue('Sensitivity analysis: no result returned.'); return; }
    var sd = v.scoreStdDev_mean || 0, c5 = v.class5_frequency_mean || 0;
    sensitivityLabel.setValue(N_MC_DRAWS + ' draws, weights perturbed +/-' + Math.round(WEIGHT_PERTURBATION * 100) +
      '%. Mean score std-dev: ' + sd.toFixed(1) + ' pts (of 100). Mean class-5 stability: ' +
      Math.round(c5 * 100) + '%. Low-stability areas (class-5-stability layer near 0.5) are ' +
      'borderline calls sensitive to the exact weights used - see the two new map layers.');
  });
  status.setValue('');
}

function modelFileName(modelName) {
  return ('ACReSAL_' + modelName + '_class1to5_' + (current ? current.name : 'area') + '_' + SCALE + 'm')
    .replace(/[^A-Za-z0-9]+/g, '_');
}

function exportModelGeoTIFF() {
  if (!current || !current.priorityClass) { status.setValue('Run a model first.'); return; }
  mTifLabel.setValue('Preparing GeoTIFF...'); mTifLabel.setUrl('');
  current.priorityClass.toInt().getDownloadURL({
    name: modelFileName(current.model), scale: SCALE, region: current.region, crs: 'EPSG:4326',
    filePerBand: false, format: 'GEO_TIFF'
  }, function(url, err) {
    if (err) { mTifLabel.setValue('GeoTIFF error - try "queue as Drive export" instead: ' + err); return; }
    mTifLabel.setValue('⬇ Download ' + current.model + ' priority-class GeoTIFF'); mTifLabel.setUrl(url);
  });
}

function queueModelGeoTIFFToDrive() {
  if (!current || !current.priorityClass) { status.setValue('Run a model first.'); return; }
  Export.image.toDrive({
    image: current.priorityClass.toInt(),
    description: modelFileName(current.model),
    scale: SCALE, region: current.region, crs: 'EPSG:4326', maxPixels: 1e10
  });
  status.setValue('Queued "' + modelFileName(current.model) + '" - open the Tasks tab and click Run.');
}

function exportModelShapefile() {
  if (!current || !current.priorityClass) { status.setValue('Run a model first.'); return; }
  mShpLabel.setValue('Vectorising priority classes...'); mShpLabel.setUrl('');
  var vec = current.priorityClass.toInt().reduceToVectors({
    geometry: current.region, scale: SCALE, geometryType: 'polygon', eightConnected: true,
    labelProperty: 'priority_class', maxPixels: 1e10, bestEffort: true, tileScale: TS
  }).map(function(f) { return f.set('model', current.model); });
  vec.getDownloadURL('SHP', ['priority_class', 'model'], modelFileName(current.model), function(url, err) {
    if (err) { mShpLabel.setValue('Shapefile error - try "queue as Drive export" instead: ' + err); return; }
    mShpLabel.setValue('⬇ Download ' + current.model + ' priority-class Shapefile'); mShpLabel.setUrl(url);
  });
}

/* ---- Download all six models: queued as Drive export TASKS, each classified 1-5 ---- */
function downloadAllModels() {
  var sel = getSelectedRegion();
  if (!sel) { status.setValue('Select a catchment, or a State/LGA.'); return; }
  SCALE = currentScale();
  queueAllModels(sel);
}

function queueAllModels(sel) {
  status.setValue('Queuing six Drive export tasks (classes 1-5) at ' + SCALE + ' m...');
  allPanel.clear();
  allPanel.add(ui.Label('Drive export tasks queued (open the Tasks tab and click Run on each)',
    {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px 2px 8px', color: '#0b6623'}));
  var layers = criterionLayers(sel.region);
  MODEL_NAMES.forEach(function(mn) {
    var surface = buildModel(mn, sel.region, layers);
    var cls = classifyPriority5(surface, sel.region).toInt();
    var desc = ('ACReSAL_' + mn + '_class1to5_' + sel.name + '_' + SCALE + 'm').replace(/[^A-Za-z0-9]+/g, '_');
    Export.image.toDrive({
      image: cls, description: desc,
      scale: SCALE, region: sel.region, crs: 'EPSG:4326', maxPixels: 1e10
    });
    allPanel.add(ui.Label('✓ ' + mn + '  →  task "' + desc + '"',
      {fontSize: '11px', margin: '2px 8px'}));
  });
  status.setValue('All six tasks queued.');
}
resetButton.onClick(downloadAllModels);

/* ---- Proposed intervention clusters ---- */
function runClusters() {
  var sel = getSelectedRegion();
  if (!sel) { status.setValue('Select a catchment, or a State/LGA.'); return; }
  SCALE = currentScale();
  runClustersWithScale(sel);
}

function runClustersWithScale(sel) {
  status.setValue('Building intervention clusters for ' + sel.label + ' at ' + SCALE + ' m...');
  clusterPanel.clear();

  var region = sel.region;
  var cls = buildClusters(region);
  currentClusters = {cls: cls, region: region, name: sel.name};

  map.addLayer(cls, {min: 1, max: 5, palette: CLUSTER_PALETTE}, 'Proposed intervention clusters');
  map.addLayer(ee.Image().byte().paint(sel.boundary, 1, 2),
               {palette: ['#000000']}, sel.label + ' boundary', false);
  map.centerObject(region, 9);

  clusterPanel.add(ui.Label('Proposed intervention clusters (' + SCALE + ' m)', {fontWeight: 'bold', margin: '8px 8px 2px 8px'}));
  CLUSTERS.forEach(function(c) {
    clusterPanel.add(ui.Panel(
      [ui.Label('', {backgroundColor: c.color, padding: '7px', margin: '3px 4px 3px 8px'}),
       ui.Label(c.label, {fontSize: '11px', fontWeight: 'bold', margin: '2px 4px'})],
      ui.Panel.Layout.flow('horizontal'), {margin: '0'}));
    clusterPanel.add(ui.Label(c.func, {fontSize: '10px', color: '#555', margin: '0 8px 4px 22px'}));
  });

  var grouped = ee.Image.pixelArea().divide(1e4).addBands(cls)
    .reduceRegion({reducer: ee.Reducer.sum().group(1, 'cluster'), geometry: region,
                   scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS}).get('groups');
  var areaLab = ui.Label('Computing cluster areas...', {fontSize: '11px', margin: '6px 8px', color: '#0b6623'});
  clusterPanel.add(areaLab);
  ee.List(grouped).evaluate(function(list) {
    if (!list) { areaLab.setValue('No cluster areas returned.'); return; }
    var by = {};
    list.forEach(function(g) { by[g.cluster] = g.sum; });
    var lines = CLUSTERS.map(function(c) {
      return c.label + ': ' + (by[c.v] ? Math.round(by[c.v]).toLocaleString() : '0') + ' ha';
    });
    areaLab.setValue(lines.join('\n'));
  });

  clusterPanel.add(ui.Label('Export clusters', {fontWeight: 'bold', fontSize: '12px', margin: '10px 8px 2px 8px'}));
  var cTifBtn = ui.Button({label: 'Prepare cluster GeoTIFF (interactive)', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: exportClusterGeoTIFF});
  var cTifDriveBtn = ui.Button({label: 'Or queue cluster GeoTIFF as Drive export', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: queueClusterGeoTIFFToDrive});
  var cShpBtn = ui.Button({label: 'Prepare cluster Shapefile (interactive)', style: {stretch: 'horizontal', margin: '2px 8px'},
    onClick: exportClusterShapefile});
  clusterPanel.add(cTifBtn); clusterPanel.add(cTifLabel);
  clusterPanel.add(cTifDriveBtn);
  clusterPanel.add(cShpBtn); clusterPanel.add(cShpLabel);

  status.setValue('');
}
clusterButton.onClick(runClusters);

function exportClusterGeoTIFF() {
  if (!currentClusters) { status.setValue('Show clusters first.'); return; }
  cTifLabel.setValue('Preparing cluster GeoTIFF...'); cTifLabel.setUrl('');
  currentClusters.cls.toInt().getDownloadURL({
    name: 'ACReSAL_clusters_' + currentClusters.name + '_' + SCALE + 'm',
    scale: SCALE, region: currentClusters.region, crs: 'EPSG:4326',
    filePerBand: false, format: 'GEO_TIFF'
  }, function(url, err) {
    if (err) { cTifLabel.setValue('GeoTIFF error - try "queue as Drive export" instead: ' + err); return; }
    cTifLabel.setValue('⬇ Download cluster GeoTIFF'); cTifLabel.setUrl(url);
  });
}

function queueClusterGeoTIFFToDrive() {
  if (!currentClusters) { status.setValue('Show clusters first.'); return; }
  Export.image.toDrive({
    image: currentClusters.cls.toInt(),
    description: ('ACReSAL_clusters_' + currentClusters.name + '_' + SCALE + 'm').replace(/[^A-Za-z0-9]+/g, '_'),
    scale: SCALE, region: currentClusters.region, crs: 'EPSG:4326', maxPixels: 1e10
  });
  status.setValue('Queued "ACReSAL_clusters_' + currentClusters.name + '" - open the Tasks tab and click Run.');
}

function exportClusterShapefile() {
  if (!currentClusters) { status.setValue('Show clusters first.'); return; }
  cShpLabel.setValue('Vectorising clusters...'); cShpLabel.setUrl('');
  var vals   = CLUSTERS.map(function(c) { return c.v; });
  var labels = CLUSTERS.map(function(c) { return c.label; });
  var vec = currentClusters.cls.rename('cluster').toInt().reduceToVectors({
    geometry: currentClusters.region, scale: SCALE, geometryType: 'polygon', eightConnected: true,
    labelProperty: 'cluster', maxPixels: 1e10, bestEffort: true, tileScale: TS
  }).map(function(f) {
    var name = ee.List(labels).get(ee.List(vals).indexOf(f.getNumber('cluster')));
    return f.set('clus_name', name);
  });
  vec.getDownloadURL('SHP', ['cluster', 'clus_name'], 'ACReSAL_clusters_' + currentClusters.name, function(url, err) {
    if (err) { cShpLabel.setValue('Shapefile error: ' + err); return; }
    cShpLabel.setValue('⬇ Download cluster Shapefile (zip)'); cShpLabel.setUrl(url);
  });
}

/* ---- Catchment-wide priority export handlers (classified 1-5; run the analysis first) ---- */

function exportGeoTIFF() {
  if (!current || !current.priorityClass) { status.setValue('Run "Map priority areas" first.'); return; }
  geotiffLabel.setValue('Preparing GeoTIFF link...'); geotiffLabel.setUrl('');
  current.priorityClass.toInt().getDownloadURL({
    name: 'ACReSAL_priority_class1to5_' + current.name + '_' + SCALE + 'm',
    scale: SCALE, region: current.region, crs: 'EPSG:4326',
    filePerBand: false, format: 'GEO_TIFF'
  }, function(url, err) {
    if (err) { geotiffLabel.setValue('GeoTIFF error - try "queue as Drive export" instead: ' + err); return; }
    geotiffLabel.setValue('⬇ Download priority-class GeoTIFF'); geotiffLabel.setUrl(url);
  });
}

function queueGeoTIFFToDrive() {
  if (!current || !current.priorityClass) { status.setValue('Run "Map priority areas" first.'); return; }
  Export.image.toDrive({
    image: current.priorityClass.toInt(),
    description: ('ACReSAL_priority_class1to5_' + current.name + '_' + SCALE + 'm').replace(/[^A-Za-z0-9]+/g, '_'),
    scale: SCALE, region: current.region, crs: 'EPSG:4326', maxPixels: 1e10
  });
  status.setValue('Queued "ACReSAL_priority_class1to5_' + current.name + '" - open the Tasks tab and click Run.');
}

function exportShapefile() {
  if (!current || !current.priorityClass) { status.setValue('Run "Map priority areas" first.'); return; }
  shpLabel.setValue('Vectorising priority classes...'); shpLabel.setUrl('');
  var vec = current.priorityClass.toInt().reduceToVectors({
    geometry: current.region, scale: SCALE, geometryType: 'polygon', eightConnected: true,
    labelProperty: 'priority_class', maxPixels: 1e10, bestEffort: true, tileScale: TS
  }).map(function(f) { return f.set('model', current.model); });
  vec.getDownloadURL('SHP', ['priority_class', 'model'], 'ACReSAL_priority_class1to5_' + current.name, function(url, err) {
    if (err) { shpLabel.setValue('Shapefile error - try "queue as Drive export" instead: ' + err); return; }
    shpLabel.setValue('⬇ Download priority-class Shapefile (zip)'); shpLabel.setUrl(url);
  });
}

function queueShapefileToDrive() {
  if (!current || !current.priorityClass) { status.setValue('Run "Map priority areas" first.'); return; }
  var vec = current.priorityClass.toInt().reduceToVectors({
    geometry: current.region, scale: SCALE, geometryType: 'polygon', eightConnected: true,
    labelProperty: 'priority_class', maxPixels: 1e10, bestEffort: true, tileScale: TS
  }).map(function(f) { return f.set('model', current.model); });
  Export.table.toDrive({
    collection: vec, description: ('ACReSAL_priority_class1to5_' + current.name + '_' + SCALE + 'm').replace(/[^A-Za-z0-9]+/g, '_'),
    fileFormat: 'SHP'
  });
  status.setValue('Queued "ACReSAL_priority_class1to5_' + current.name + '" - open the Tasks tab and click Run.');
}

/* ===================== K) TWO-PERIOD COMPARISON / CHANGE DETECTION (V9) ================= */
/*  Re-runs a model for two different date windows and diffs the classified rasters, to see
 *  where priority is trending up (growing need) vs down (situation improving / addressed).
 *  buildForPeriod() temporarily overrides the global START/END, builds the model, then restores
 *  them - safe because every date-dependent call (ee.Date(START), s2Collection(), CHIRPS/
 *  TerraClimate filters, etc.) reads the JS string value at graph-construction time, not
 *  lazily, the same pattern SCALE already relies on elsewhere in this script. */
var currentChange = null;   // {change, clsA, clsB, region, name, model} - set by runChangeDetection()

function buildForPeriod(modelName, region, startDate, endDate) {
  var savedStart = START, savedEnd = END;
  START = startDate; END = endDate;
  var layers = criterionLayers(region);
  var surface = buildModel(modelName, region, layers);
  var cls = classifyPriority5(surface, region);
  START = savedStart; END = savedEnd;
  return cls;
}

function runChangeDetection() {
  var sel = getSelectedRegion();
  if (!sel) { status.setValue('Select a catchment, or a State/LGA.'); return; }
  SCALE = currentScale();
  var modelName = modelSelect.getValue();
  var preset = PERIOD_PRESETS.filter(function(p) { return p.label === periodSelect.getValue(); })[0];
  status.setValue('Comparing ' + preset.a.join(' to ') + ' vs ' + preset.b.join(' to ') + ' for ' + modelName + '...');
  changePanel.clear();

  var clsA = buildForPeriod(modelName, sel.region, preset.a[0], preset.a[1]);
  var clsB = buildForPeriod(modelName, sel.region, preset.b[0], preset.b[1]);
  var change = clsB.subtract(clsA).rename('class_change');   // -4..+4

  map.addLayer(clsA, {min: 1, max: 5, palette: MODELS[modelName].palette},
    modelName + ' priority class - period A (' + preset.a[0] + ' to ' + preset.a[1] + ')', false);
  map.addLayer(clsB, {min: 1, max: 5, palette: MODELS[modelName].palette},
    modelName + ' priority class - period B (' + preset.b[0] + ' to ' + preset.b[1] + ')', false);
  map.addLayer(change, {min: -4, max: 4, palette: ['#08306b', '#4292c6', '#f7f7f7', '#fc8d59', '#b2182b']},
    modelName + ' priority-class change (B minus A)');

  currentChange = {change: change, clsA: clsA, clsB: clsB, region: sel.region, name: sel.name, model: modelName};

  changePanel.add(ui.Label(modelName + ' change detection: ' + preset.label, {fontWeight: 'bold', margin: '8px 8px 2px 8px'}));
  changePanel.add(ui.Label('Positive (red) = priority class increased from period A to B (need is growing); ' +
    'negative (blue) = priority class decreased (situation improved, or already addressed).',
    {fontSize: '10px', color: '#555', margin: '2px 8px 8px 8px'}));

  var grouped = ee.Image.pixelArea().divide(1e4).addBands(change)
    .reduceRegion({reducer: ee.Reducer.sum().group(1, 'class_change'), geometry: sel.region,
      scale: statsScale(), maxPixels: 1e10, bestEffort: true, tileScale: TS}).get('groups');
  var changeAreaLabel = ui.Label('Computing change areas...', {fontSize: '11px', margin: '6px 8px'});
  changePanel.add(changeAreaLabel);
  ee.List(grouped).evaluate(function(list) {
    if (!list) { changeAreaLabel.setValue('No change areas returned.'); return; }
    var by = {};
    list.forEach(function(g) { by[g.class_change] = g.sum; });
    var lines = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(function(v) {
      return (v > 0 ? '+' + v : String(v)) + ': ' + (by[v] ? Math.round(by[v]).toLocaleString() : '0') + ' ha';
    });
    changeAreaLabel.setValue(lines.join('   '));
  });

  var changeTifBtn = ui.Button({label: 'Queue change-detection GeoTIFF as Drive export',
    style: {stretch: 'horizontal', margin: '4px 8px'}, onClick: queueChangeGeoTIFFToDrive});
  changePanel.add(changeTifBtn);

  status.setValue('');
}
changeBtn.onClick(runChangeDetection);

function queueChangeGeoTIFFToDrive() {
  if (!currentChange) { status.setValue('Run change detection first.'); return; }
  Export.image.toDrive({
    image: currentChange.change.toInt(),
    description: ('ACReSAL_' + currentChange.model + '_change_' + currentChange.name + '_' + SCALE + 'm').replace(/[^A-Za-z0-9]+/g, '_'),
    scale: SCALE, region: currentChange.region, crs: 'EPSG:4326', maxPixels: 1e10
  });
  status.setValue('Queued change-detection GeoTIFF - open the Tasks tab and click Run.');
}

/* ===================== L) EXPLORATORY CMIP6 FUTURE-RAINFALL SIGNAL (V9) ================= */
/*  Advisory only - deliberately NOT wired into any of the six AHP models' weights, so turning
 *  this on never silently changes an existing result. Compares projected SSP2-4.5 rainfall
 *  (2030-2050 mean, averaged across a small multi-model ensemble) against the CMIP6 historical
 *  baseline (1995-2014 mean) for the SAME models, as a simple % change signal - NOT a full
 *  downscaled future aridity index (NEX-GDDP-CMIP6 has no PET band), so treat it as a coarse,
 *  exploratory "is this catchment projected to get wetter or drier" flag, not a validated
 *  criterion. */
var CMIP6_MODELS = ['ACCESS-CM2', 'MPI-ESM1-2-HR', 'MRI-ESM2-0', 'NorESM2-MM'];
var CMIP6_SCENARIO = 'ssp245';

function cmip6RainfallChange(region) {
  var col = ee.ImageCollection('NASA/GDDP-CMIP6').filterBounds(region)
              .filter(ee.Filter.inList('model', CMIP6_MODELS));
  var hist = col.filter(ee.Filter.eq('scenario', 'historical'))
                .filterDate('1995-01-01', '2015-01-01').select('pr').mean()
                .multiply(86400).multiply(365.25).rename('pr_hist');   // kg/m2/s -> mm/yr
  var fut = col.filter(ee.Filter.eq('scenario', CMIP6_SCENARIO))
               .filterDate('2030-01-01', '2050-01-01').select('pr').mean()
               .multiply(86400).multiply(365.25).rename('pr_fut');
  return fut.subtract(hist).divide(hist.max(1)).multiply(100).rename('pr_pct_change');
}

cmip6Btn.onClick(function() {
  var sel = getSelectedRegion();
  if (!sel) { status.setValue('Select a catchment, or a State/LGA.'); return; }
  status.setValue('Computing exploratory CMIP6 rainfall-change signal (not part of any model score)...');
  var change = cmip6RainfallChange(sel.region).clip(sel.region);
  map.addLayer(change, {min: -30, max: 30, palette: ['#a50026', '#fee08b', '#ffffff', '#abd9e9', '#313695']},
    'EXPLORATORY: projected rainfall change % (SSP2-4.5, 2030-2050 vs 1995-2014)');
  status.setValue('');
});

/* ============================ 5. CLICK -> PIXEL BREAKDOWN ============================ */

map.onClick(function(coords) {
  if (!current || !current.layers) { return; }
  var pt = ee.Geometry.Point([coords.lon, coords.lat]);
  var m = MODELS[current.model];
  var img = ee.Image.cat(m.criteria.map(function(cr) {
    return current.layers[cr.c].rename(cr.c).toFloat();
  })).addBands(current.priority).addBands(current.priorityClass);
  img.reduceRegion({reducer: ee.Reducer.first(), geometry: pt, scale: SCALE, bestEffort: true})
     .evaluate(function(vals) {
    if (!vals) { return; }
    var rows = [['Criterion', 'Weight × dir']];
    m.criteria.forEach(function(cr) {
      rows.push([cr.c + ' (' + cr.w.toFixed(2) + (cr.d === '-' ? ', inv' : '') + ')',
                 cr.w]);
    });
    var pv = (vals.priority !== undefined && vals.priority !== null) ? vals.priority.toFixed(0) : '?';
    var pc = (vals.priority_class !== undefined && vals.priority_class !== null) ? vals.priority_class : '?';
    var chart = ui.Chart(rows, 'BarChart', {
      title: current.model + ' — pixel suitability ' + pv + '/100 (class ' + pc + '/5)',
      legend: {position: 'none'}, hAxis: {title: 'AHP weight'},
      colors: [current.palette ? current.palette[3] : '#2c7bb6'], height: 300});
    breakdownPanel.clear();
    breakdownPanel.add(chart);
  });
});

/* ============================ 6. LEGEND & LAYOUT ==================================== */

ui.root.clear();
map.setOptions('HYBRID');
map.setControlVisibility({layerList: true});
map.style().set('cursor', 'crosshair');
map.centerObject(SCMP.geometry(), 6);
map.addLayer(ee.Image().byte().paint(SCMP, 1, 1), {palette: ['#ffff00']}, 'SCMP catchments');
ui.root.add(ui.SplitPanel({firstPanel: controlPanel, secondPanel: ui.Panel(map), orientation: 'horizontal'}));

/* ---------------------------------------------------------------------------------------
 *  OPTIONAL - full-resolution / large-area export (run in the CODE EDITOR, then start the
 *  task from the Tasks tab; Export does NOT run inside a published App). Uses the six-model
 *  AHP path + classifyPriority5() so the file matches what the app itself now exports.
 *  SCALE below can be 50, 60 or 100 (metres) - pick to match resSelect in the running app.
 *
 *  var feat = SCMP.filter(ee.Filter.eq(NAME_FIELD, 'Misau_K_Gana')).first();
 *  var region = feat.geometry();
 *  SCALE = 60;
 *  var layers = criterionLayers(region);
 *  var surface = buildModel('Erosion Control', region, layers);
 *  var cls = classifyPriority5(surface, region).toInt();
 *
 *  Export.image.toDrive({image: cls, description: 'ACReSAL_ErosionControl_class1to5_Misau_K_Gana_60m',
 *                        region: region, scale: SCALE, crs: 'EPSG:4326', maxPixels: 1e10});
 *
 *  var vec = cls.reduceToVectors({geometry: region, scale: SCALE, geometryType: 'polygon',
 *              eightConnected: true, labelProperty: 'priority_class', maxPixels: 1e10, tileScale: 10});
 *  Export.table.toDrive({collection: vec, description: 'ACReSAL_ErosionControl_class1to5_Misau_K_Gana_60m_shp',
 *                        fileFormat: 'SHP'});
 * ------------------------------------------------------------------------------------- */
