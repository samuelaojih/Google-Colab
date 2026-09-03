/**
 * HYDROTHERMAL ALTERATION MAPPING FOR GOLD EXPLORATION
 * Landsat 8/9 OLI (Collection 2, Level-2 SR)
 * ------------------------------------------------------------------------
 * Study area : projects/ee-samuelaojih/assets/study_area
 * Target     : Gold (Au) — the ratio weighting, ASTER refinement, and
 *              structural layer below are tuned as a reconnaissance
 *              vectoring tool for structurally controlled epithermal/
 *              orogenic-style Au mineralization. See section 12 for how
 *              to re-weight for a specific deposit style.
 * Method     : Classic band-ratio technique (Sabins 1997; Segal 1983;
 *              Kaufmann 1988) adapted to Landsat 8/9 OLI band numbering,
 *              a Crosta-technique (selective PCA) alteration index,
 *              a threshold-based mineral-zonation map, cross-sensor
 *              clay/hydroxyl validation against Sentinel-2 (same-epoch,
 *              higher-res) and ASTER SWIR indices (Ninomiya 2003/2005 —
 *              mineral-species-resolving), a gold-specific weighted
 *              alteration vector, a DEM-derived structural lineament
 *              (fault/fracture) density layer, and a combined Gold
 *              Target Priority map.
 *
 * Paste this whole script into code.earthengine.google.com and run.
 *
 * OLI band reference:
 *   SR_B1 Coastal aerosol   SR_B2 Blue    SR_B3 Green
 *   SR_B4 Red                SR_B5 NIR     SR_B6 SWIR1   SR_B7 SWIR2
 * ------------------------------------------------------------------------
 */

// ============================================================
// 1. STUDY AREA
// ============================================================
// If your asset is a table (vector boundary), this works as-is.
// If it's an ee.Image/ee.Geometry asset instead, adjust accordingly
// (e.g. ee.Image('...').geometry() or ee.Geometry(...)).
var studyArea = ee.FeatureCollection('projects/ee-samuelaojih/assets/study_area');
var aoi = studyArea.geometry();

Map.centerObject(aoi, 11);
Map.addLayer(studyArea.style({color: 'ffffff', fillColor: '00000000', width: 2}),
  {}, 'Study Area Boundary');

// ============================================================
// 2. DATE RANGE / FILTER SETTINGS — edit as needed
// ============================================================
var startDate = '2023-01-01';
var endDate   = '2024-12-31';
var maxCloud  = 20; // percent

// ============================================================
// 3. CLOUD MASK + SCALING (Collection 2 Level-2 SR)
// ============================================================
function maskL8sr(image) {
  var qa = image.select('QA_PIXEL');
  // Bits: 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow
  var dilatedCloud = 1 << 1;
  var cirrus       = 1 << 2;
  var cloud        = 1 << 3;
  var cloudShadow  = 1 << 4;
  var mask = qa.bitwiseAnd(dilatedCloud).eq(0)
    .and(qa.bitwiseAnd(cirrus).eq(0))
    .and(qa.bitwiseAnd(cloud).eq(0))
    .and(qa.bitwiseAnd(cloudShadow).eq(0));

  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);

  return image.addBands(opticalBands, null, true)
    .updateMask(mask)
    .clip(aoi);
}

// ============================================================
// 4. BUILD THE LANDSAT 8/9 COMPOSITE
// ============================================================
var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(aoi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUD_COVER', maxCloud))
  .map(maskL8sr);

var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterBounds(aoi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUD_COVER', maxCloud))
  .map(maskL8sr);

var collection = l8.merge(l9);
print('Number of scenes used:', collection.size());

var image = collection.median().clip(aoi);

Map.addLayer(image, {bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.3},
  'True Color (Landsat 8/9)', false);
Map.addLayer(image, {bands: ['SR_B6', 'SR_B5', 'SR_B4'], min: 0, max: 0.4},
  'False Color 6-5-4 (geology)', false);

// ============================================================
// 5. STANDARD HYDROTHERMAL ALTERATION BAND RATIOS
//    (Sabins 1997 / Segal 1983, TM band logic translated to OLI)
// ============================================================

// --- 5.1 Iron Oxide / Ferric Iron ratio: Red / Blue = B4/B2 ---
// Highlights: limonite, hematite, goethite, jarosite (gossan / oxidized
// sulfide caps, argillic-to-advanced-argillic zones near surface).
// High values (bright) = iron-oxide-rich (weathered/oxidized) zones.
var ironOxide = image.select('SR_B4').divide(image.select('SR_B2'))
  .rename('Iron_Oxide_Ratio').clip(aoi);

// --- 5.2 Ferrous Mineral ratio: SWIR1 / NIR = B6/B5 ---
// Highlights: biotite, chlorite, amphibole, pyroxene (mafic/propylitic
// alteration — chlorite-epidote-carbonate assemblages).
// High values = ferrous-silicate-bearing rocks.
var ferrousMinerals = image.select('SR_B6').divide(image.select('SR_B5'))
  .rename('Ferrous_Mineral_Ratio').clip(aoi);

// --- 5.3 Hydroxyl / Clay-Sericite-Alunite ratio: SWIR1 / SWIR2 = B6/B7 ---
// Highlights: kaolinite, illite, muscovite/sericite, alunite, gypsum
// (argillic and phyllic/sericitic alteration — classic hydrothermal
// halo around ore bodies, since these OH-bearing minerals absorb
// strongly in SWIR2 relative to SWIR1).
var hydroxylClay = image.select('SR_B6').divide(image.select('SR_B7'))
  .rename('Hydroxyl_Clay_Ratio').clip(aoi);

// --- 5.4 Gossan ratio: NIR / Red = B5/B4 ---
// Highlights: gossan (iron-capped outcrops above sulfide deposits) —
// low reflectance in red (Fe absorption) but higher NIR reflectance
// relative to iron oxide alone; used to separate true gossan from
// generic ferruginous soils.
var gossan = image.select('SR_B5').divide(image.select('SR_B4'))
  .rename('Gossan_Ratio').clip(aoi);

// --- 5.5 Laterite / ferric-oxide + clay combined ratio: SWIR1/Blue = B6/B2 ---
// Highlights: laterite/duricrust and deeply weathered regolith,
// useful for distinguishing surficial weathering from bedrock alteration.
var laterite = image.select('SR_B6').divide(image.select('SR_B2'))
  .rename('Laterite_Ratio').clip(aoi);

var ratioStack = ironOxide.addBands(ferrousMinerals)
  .addBands(hydroxylClay).addBands(gossan).addBands(laterite)
  .clip(aoi);

var ratioVis = {min: 0.8, max: 1.6, palette: ['000004','3b0f70','8c2981','de4968','fe9f6d','fcfdbf']};
Map.addLayer(ironOxide, ratioVis, 'Iron Oxide Ratio (B4/B2)');
Map.addLayer(ferrousMinerals, ratioVis, 'Ferrous Mineral Ratio (B6/B5)', false);
Map.addLayer(hydroxylClay, ratioVis, 'Hydroxyl/Clay Ratio (B6/B7)', false);
Map.addLayer(gossan, ratioVis, 'Gossan Ratio (B5/B4)', false);
Map.addLayer(laterite, ratioVis, 'Laterite Ratio (B6/B2)', false);

// ============================================================
// 6. FALSE-COLOR ALTERATION RATIO COMPOSITE (Sabins-style RGB)
//    R = Iron Oxide, G = Hydroxyl/Clay, B = Ferrous Minerals
//    -> reddish = iron-oxide-dominant zones
//       greenish/yellow = clay/sericite (argillic) zones
//       bluish = propylitic/mafic zones
// ============================================================
var alterationComposite = ee.Image.cat([ironOxide, hydroxylClay, ferrousMinerals]).clip(aoi);
Map.addLayer(alterationComposite, {min: 0.8, max: 1.6}, 'Alteration Ratio Composite (R-G-B)');

// ============================================================
// 7. CROSTA TECHNIQUE — SELECTIVE PCA ALTERATION INDEX (advanced)
//    Crosta & Moore (1989): PCA on a chosen band subset isolates the
//    spectral variance due to a specific mineral group. The eigenvector
//    loadings tell you which PC is the "alteration PC" and whether it
//    must be inverted (sign of the diagnostic band's loading).
// ============================================================

// 7.1 Iron-oxide PCA: use bands 1,3,4,5,7 (SR_B2,B4,B5,B6,B7 in OLI-speak
//     minus SR_B3) — diagnostic band is Red (B4); look for the PC whose
//     B4 loading has the largest magnitude and opposite sign to the others.
var pcaBandsFe = ['SR_B2', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'];
var pcaBandsOH = ['SR_B2', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7']; // diagnostic band = SR_B7 (SWIR2)

function runPCA(img, bandNames) {
  var bands = img.select(bandNames);
  var meanDict = bands.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
  });
  var means = ee.Image.constant(meanDict.values(bandNames));
  var centered = bands.subtract(means);
  var arrayImg = centered.toArray();

  var covar = arrayImg.reduceRegion({
    reducer: ee.Reducer.centeredCovariance(), geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
  });
  var covarArray = ee.Array(covar.get('array'));
  var eigens = covarArray.eigen();
  var eigenVectors = eigens.slice(1, 1);
  var arrayImage1D = arrayImg;
  var arrayImage2D = arrayImage1D.toArray(1);

  var principalComponents = ee.Image(eigenVectors)
    .matrixMultiply(arrayImage2D)
    .arrayProject([0]).arrayFlatten([bandNames.map(function(b, i) { return 'PC' + (i + 1); })])
    .clip(aoi);

  return {pcImage: principalComponents, eigenVectors: eigenVectors};
}

var pcaFe = runPCA(image, pcaBandsFe);
print('Iron-oxide PCA eigenvector loadings (inspect the B4/SR_B4 row to pick the right PC):',
  pcaFe.eigenVectors);
Map.addLayer(pcaFe.pcImage.select(['PC1','PC2','PC3']), {min: -0.1, max: 0.1},
  'Iron-Oxide PCA components (check loadings, pick correct PC)', false);

var pcaOH = runPCA(image, pcaBandsOH);
print('Hydroxyl PCA eigenvector loadings (inspect the B7/SR_B7 row to pick the right PC):',
  pcaOH.eigenVectors);
Map.addLayer(pcaOH.pcImage.select(['PC1','PC2','PC3']), {min: -0.1, max: 0.1},
  'Hydroxyl PCA components (check loadings, pick correct PC)', false);

// NOTE: After printing the eigenvector loadings, read off which PC has the
// diagnostic band (SR_B4 for iron oxide, SR_B7 for hydroxyl) loading with
// a magnitude clearly larger than the other bands AND opposite sign. That
// PC band (e.g. pcaFe.pcImage.select('PC3')) IS the alteration index —
// multiply by -1 first if the diagnostic band's loading is positive, so
// that bright pixels = more alteration.

// ============================================================
// 8. THRESHOLD-BASED MINERAL / ALTERATION ZONATION MAP
//    Simple, defensible rule set using mean + stdDev of each ratio
//    over the study area (no ground truth required). Refine thresholds
//    with field/lab data or spectral library values (USGS splib07)
//    if available.
// ============================================================
var stats = ratioStack.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.minMax(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.percentile([25, 50, 75, 90]), sharedInputs: true}),
  geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
});

function thresholdImg(ratioImg, name) {
  var mean = ee.Number(stats.get(name + '_mean'));
  var sd   = ee.Number(stats.get(name + '_stdDev'));
  return ratioImg.gt(mean.add(sd)); // "anomalous" = > mean + 1 stdDev
}

var feOxideAnomaly = thresholdImg(ironOxide, 'Iron_Oxide_Ratio');
var clayAnomaly    = thresholdImg(hydroxylClay, 'Hydroxyl_Clay_Ratio');
var propyliticAnomaly = thresholdImg(ferrousMinerals, 'Ferrous_Mineral_Ratio');

// Combine into one classified map:
//   1 = Iron-oxide (gossan/oxidized) alteration only
//   2 = Argillic/phyllic (clay-hydroxyl) alteration only
//   3 = Propylitic (ferrous/mafic) alteration only
//   4 = Overlap of Fe-oxide + Clay  (advanced argillic — common ore-proximal signature)
//   0 = Background / unaltered
var mineralZones = ee.Image(0)
  .where(feOxideAnomaly.and(clayAnomaly.not()).and(propyliticAnomaly.not()), 1)
  .where(clayAnomaly.and(feOxideAnomaly.not()).and(propyliticAnomaly.not()), 2)
  .where(propyliticAnomaly.and(feOxideAnomaly.not()).and(clayAnomaly.not()), 3)
  .where(feOxideAnomaly.and(clayAnomaly), 4)
  .rename('Alteration_Zone')
  .clip(aoi); // keep full extent WITHIN the study area only, 0 = background

var zonePalette = ['d9d9d9', 'e31a1c', 'ffd700', '1a9850', 'ff7f00'];
Map.addLayer(mineralZones, {min: 0, max: 4, palette: zonePalette},
  'Mineral / Alteration Zonation Map');

// ------------------------------------------------------------
// Legend for the zonation map
// ------------------------------------------------------------
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
legend.add(ui.Label('Alteration Zones', {fontWeight: 'bold', fontSize: '14px'}));
var legendItems = [
  ['d9d9d9', 'Background / unaltered'],
  ['e31a1c', 'Iron oxide (gossan) — limonite/hematite/goethite'],
  ['ffd700', 'Argillic/phyllic — kaolinite/illite/sericite/alunite'],
  ['1a9850', 'Propylitic — chlorite/epidote/biotite'],
  ['ff7f00', 'Advanced argillic (Fe-oxide + clay overlap)']
];
legendItems.forEach(function(item) {
  var colorBox = ui.Label('', {backgroundColor: item[0], padding: '8px', margin: '0 6px 4px 0'});
  var desc = ui.Label(item[1], {margin: '0 0 4px 0', fontSize: '11px'});
  legend.add(ui.Panel([colorBox, desc], ui.Panel.Layout.Flow('horizontal')));
});
Map.add(legend);

// ============================================================
// 9. SENTINEL-2 CLAY/HYDROXYL VALIDATION RATIO
//    Sentinel-2 B11 (1610 nm) / B12 (2190 nm) is the same physical
//    SWIR1/SWIR2 logic as Landsat B6/B7, at 20 m instead of 30 m, and
//    with a much larger, more recent, more cloud-free archive — useful
//    as an independent, higher-resolution cross-check on the Landsat
//    hydroxyl/clay ratio (does NOT separate clay species by itself).
// ============================================================
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBit = 1 << 10;
  var cirrusBit = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBit).eq(0).and(qa.bitwiseAnd(cirrusBit).eq(0));
  return image.updateMask(mask).divide(10000).clip(aoi);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloud))
  .map(maskS2clouds);

print('Number of Sentinel-2 scenes used:', s2.size());
var s2Image = s2.median().clip(aoi);

// Sentinel-2 equivalents of the Landsat ratios (B4=Red, B2=Blue,
// B11=SWIR1, B12=SWIR2 — same interpretation as the OLI ratios above)
var s2IronOxide = s2Image.select('B4').divide(s2Image.select('B2'))
  .rename('S2_Iron_Oxide_Ratio').clip(aoi);
var s2HydroxylClay = s2Image.select('B11').divide(s2Image.select('B12'))
  .rename('S2_Hydroxyl_Clay_Ratio').clip(aoi);

Map.addLayer(s2HydroxylClay, ratioVis, 'Sentinel-2 Hydroxyl/Clay Ratio (B11/B12)', false);
Map.addLayer(s2IronOxide, ratioVis, 'Sentinel-2 Iron Oxide Ratio (B4/B2)', false);

// ============================================================
// 10. ASTER SWIR CLAY-MINERAL INDICES (Ninomiya 2003, 2005)
//     ASTER's six narrow SWIR bands (B04-B09, 2.145-2.430 microns)
//     resolve individual OH-bearing clay/mica/sulfate species that
//     Landsat's single broad SWIR2 band (B7) cannot separate — this is
//     the actual mineral-species check on the Landsat/Sentinel-2 clay
//     ratio, not just a resolution upgrade.
//
//     IMPORTANT CAVEAT: the ASTER SWIR subsystem has been degraded/
//     saturated since ~April 2008. Only use SWIR bands from scenes
//     BEFORE that date for quantitative mineral indices. This means
//     ASTER here validates the *lithology/alteration footprint*
//     (assumed static over geologic time), not the current land
//     surface — pair it with the modern Sentinel-2 ratio above for
//     a temporal cross-check.
// ============================================================
var asterStart = '2000-01-01';
var asterEnd   = '2008-04-01'; // SWIR detector reliable window

var aster = ee.ImageCollection('ASTER/AST_L1T_003')
  .filterBounds(aoi)
  .filterDate(asterStart, asterEnd)
  .filter(ee.Filter.lt('CLOUDCOVER', maxCloud))
  .select(['B04', 'B05', 'B06', 'B07', 'B08', 'B09']);

var asterCount = aster.size();
print('Number of ASTER (pre-2008 SWIR) scenes found:', asterCount);
print('If 0: no valid pre-2008 ASTER SWIR scenes exist over this AOI — ' +
  'widen asterStart/asterEnd cautiously and treat indices as qualitative only.');

var asterImage = aster.median().clip(aoi);

// Kaolinite Index: high -> kaolinite
var kaoliniteIndex = asterImage.select('B04').divide(asterImage.select('B05'))
  .multiply(asterImage.select('B08').divide(asterImage.select('B06')))
  .rename('ASTER_Kaolinite_Index').clip(aoi);

// Alunite Index: high -> alunite
var aluniteIndex = asterImage.select('B07').divide(asterImage.select('B05'))
  .multiply(asterImage.select('B04').divide(asterImage.select('B08')))
  .rename('ASTER_Alunite_Index').clip(aoi);

// AlOH / phyllosilicate index (muscovite-illite-sericite-kaolinite group,
// after Ninomiya 2003): high -> generic clay/mica hydroxyl alteration,
// this is the closest ASTER analogue to the Landsat/S2 hydroxyl ratio
var asterOHIndex = asterImage.select('B05').add(asterImage.select('B07'))
  .divide(asterImage.select('B06'))
  .rename('ASTER_AlOH_Index').clip(aoi);

// Calcite/carbonate-chlorite-epidote index: high -> propylitic/carbonate
var calciteIndex = asterImage.select('B06').add(asterImage.select('B09'))
  .divide(asterImage.select('B07').add(asterImage.select('B08')))
  .rename('ASTER_Calcite_Index').clip(aoi);

var asterVis = {min: 0.9, max: 1.3, palette: ['000004','3b0f70','8c2981','de4968','fe9f6d','fcfdbf']};
Map.addLayer(asterOHIndex, asterVis, 'ASTER AlOH/Clay Index (B5+B7)/B6', false);
Map.addLayer(kaoliniteIndex, asterVis, 'ASTER Kaolinite Index', false);
Map.addLayer(aluniteIndex, asterVis, 'ASTER Alunite Index', false);
Map.addLayer(calciteIndex, asterVis, 'ASTER Calcite/Carbonate Index', false);

// ============================================================
// 11. CROSS-SENSOR VALIDATION OF THE CLAY/HYDROXYL SIGNAL
//     Correlates the Landsat 8/9 hydroxyl/clay ratio against the
//     Sentinel-2 equivalent (same-epoch, higher-res check) and the
//     ASTER AlOH clay index (mineral-species-resolving check) at
//     random sample points. A strong positive correlation gives
//     confidence the Landsat-derived argillic/phyllic zones are a real
//     mineralogical signal rather than a Landsat artifact (vegetation,
//     shadow, sensor noise).
// ============================================================
var validationStack = hydroxylClay.rename('Landsat_Hydroxyl_Clay')
  .addBands(s2HydroxylClay.rename('S2_Hydroxyl_Clay'))
  .addBands(asterOHIndex.rename('ASTER_AlOH'));

var samplePts = validationStack.sample({
  region: aoi, scale: 30, numPixels: 500, geometries: true, seed: 42
});

print('Cross-sensor clay/hydroxyl sample points (inspect for missing ASTER values):',
  samplePts.limit(10));

var corrLandsatS2 = samplePts.reduceColumns({
  reducer: ee.Reducer.pearsonsCorrelation(),
  selectors: ['Landsat_Hydroxyl_Clay', 'S2_Hydroxyl_Clay']
});
print('Correlation: Landsat vs Sentinel-2 hydroxyl/clay ratio', corrLandsatS2);

var corrLandsatAster = samplePts.filter(ee.Filter.notNull(['ASTER_AlOH'])).reduceColumns({
  reducer: ee.Reducer.pearsonsCorrelation(),
  selectors: ['Landsat_Hydroxyl_Clay', 'ASTER_AlOH']
});
print('Correlation: Landsat vs ASTER AlOH clay index (n depends on pre-2008 coverage)',
  corrLandsatAster);

print(ui.Chart.feature.byFeature(samplePts, 'Landsat_Hydroxyl_Clay', 'S2_Hydroxyl_Clay')
  .setChartType('ScatterChart')
  .setOptions({title: 'Landsat vs Sentinel-2 Hydroxyl/Clay Ratio',
    hAxis: {title: 'Landsat B6/B7'}, vAxis: {title: 'Sentinel-2 B11/B12'},
    pointSize: 2, trendlines: {0: {}}}));

print(ui.Chart.feature.byFeature(samplePts, 'Landsat_Hydroxyl_Clay', 'ASTER_AlOH')
  .setChartType('ScatterChart')
  .setOptions({title: 'Landsat Hydroxyl/Clay Ratio vs ASTER AlOH Index',
    hAxis: {title: 'Landsat B6/B7'}, vAxis: {title: 'ASTER (B5+B7)/B6'},
    pointSize: 2, trendlines: {0: {}}}));

// ============================================================
// 12. GOLD-SPECIFIC ALTERATION VECTORING
//     Different Au deposit styles favor different parts of the ratio
//     suite above:
//       - High-sulfidation epithermal Au: advanced argillic core
//         (alunite-kaolinite-pyrophyllite) + iron-oxide/gossan center
//         -> weight Iron Oxide + Hydroxyl/Clay + ASTER Alunite highest.
//       - Low-sulfidation epithermal Au (adularia-sericite): illite-
//         sericite argillic halo + silicification, weaker advanced
//         argillic signal, strong structural control.
//       - Orogenic/mesothermal Au: sericite-carbonate-pyrite in shear
//         zones (often subtle on ratios alone) -> structural control
//         (section 13) matters more than the mineralogy here.
//       - Porphyry-related Au: classic potassic-phyllic-argillic-
//         propylitic zoning around a gossan-capped leached zone.
//     This index is a generic reconnaissance vectoring tool, not a
//     deposit-model-specific classifier — re-weight it if you know
//     which style is expected in your terrane.
// ============================================================
function normalize01(img, bandName, geom, scale) {
  var mm = img.select(bandName).reduceRegion({
    reducer: ee.Reducer.minMax(), geometry: geom, scale: scale, maxPixels: 1e9, bestEffort: true
  });
  var min = ee.Number(mm.get(bandName + '_min'));
  var max = ee.Number(mm.get(bandName + '_max'));
  return img.select(bandName).subtract(min).divide(max.subtract(min))
    .rename(bandName + '_norm').clip(geom);
}

var ironOxide_n     = normalize01(ironOxide, 'Iron_Oxide_Ratio', aoi, 30);
var hydroxylClay_n  = normalize01(hydroxylClay, 'Hydroxyl_Clay_Ratio', aoi, 30);
var ferrous_n       = normalize01(ferrousMinerals, 'Ferrous_Mineral_Ratio', aoi, 30);

// Core vector (Landsat/Sentinel-2 only — always available):
// strongest where iron-oxide AND hydroxyl/clay are co-elevated, i.e.
// the "advanced argillic" overlap class (4) from the zonation map —
// the classic epithermal Au footprint.
var goldVectorCore = ironOxide_n.multiply(0.45)
  .add(hydroxylClay_n.multiply(0.45))
  .add(ferrous_n.multiply(0.10))
  .rename('Gold_Vector_Core').clip(aoi);

Map.addLayer(goldVectorCore, {min: 0, max: 1, palette: ['1a1a2e','16213e','0f3460','e94560','ffbe0b']},
  'Gold Vector - Core (Landsat/S2)', false);

// ASTER refinement (only meaningful where pre-2008 SWIR coverage
// exists — check the ASTER scene count printed in section 10 first).
// Alunite is weighted highest since it's the most Au-diagnostic
// mineral in this set (advanced argillic / high-sulfidation core).
var kaolinite_n = normalize01(kaoliniteIndex, 'ASTER_Kaolinite_Index', aoi, 30);
var alunite_n   = normalize01(aluniteIndex, 'ASTER_Alunite_Index', aoi, 30);
var asterOH_n   = normalize01(asterOHIndex, 'ASTER_AlOH_Index', aoi, 30);

var goldVectorASTER = alunite_n.multiply(0.5)
  .add(kaolinite_n.multiply(0.3))
  .add(asterOH_n.multiply(0.2))
  .rename('Gold_Vector_ASTER_Refinement').clip(aoi);

Map.addLayer(goldVectorASTER, {min: 0, max: 1, palette: ['1a1a2e','16213e','0f3460','e94560','ffbe0b']},
  'Gold Vector - ASTER Refinement (pre-2008 only)', false);

// ============================================================
// 13. STRUCTURAL LINEAMENT ANALYSIS (fault/fracture proxy)
//     Gold deposits of every style above are structurally controlled
//     (faults/fractures as fluid pathways), so alteration alone is an
//     incomplete target — this derives a lineament density surface
//     from SRTM topography via Canny edge detection on a hillshade,
//     as a proxy for the fault/fracture network.
// ============================================================
var srtm = ee.Image('USGS/SRTMGL1_003').clip(aoi.buffer(2000));
var hillshade = ee.Terrain.hillshade(srtm, 315, 45);

var edges = ee.Algorithms.CannyEdgeDetector({image: hillshade, threshold: 10, sigma: 1});
var lineaments = edges.updateMask(edges).clip(aoi);
Map.addLayer(lineaments, {palette: ['ffffff']}, 'Structural Lineaments (Canny edges on hillshade)', false);

// --- 13.1 Lineament raster -> vector (one feature per lineament) -------
// Earth Engine has no built-in raster-to-polyline vectorizer:
// reduceToVectors only outputs points, polygons, or bounding boxes.
// Sampling every edge pixel (the earlier approach) gives one POINT per
// PIXEL - technically a "point" export, but far too dense and not a
// line. Fix: group 8-connected edge pixels into distinct lineament
// segments first (connectedComponents), THEN vectorize each segment as
// ONE polygon feature tracing its footprint - this collapses the count
// from thousands of pixel-points down to the actual number of distinct
// lineaments, and each feature is an elongated, line-shaped polygon
// rather than a scattered point. If you need true LineString geometry
// (not polygon) for downstream GIS use, run this polygon layer through
// a centerline tool afterward (e.g. QGIS "Polygon to Centerline"
// plugin, or GRASS v.to.lines) - that step isn't available inside GEE.
var connectedEdges = edges.selfMask().int32().connectedComponents({
  connectedness: ee.Kernel.plus(1),
  maxSize: 1024
});

var lineamentVectors = connectedEdges.select('labels').reduceToVectors({
  geometry: aoi,
  scale: 30,
  geometryType: 'polygon',
  eightConnected: true,
  labelProperty: 'lineament_id',
  maxPixels: 1e9,
  bestEffort: true
});
print('Lineament vector feature count (one per distinct lineament segment):',
  lineamentVectors.size());
Map.addLayer(lineamentVectors.style({color: 'ff0000', fillColor: 'ff000080', width: 1}),
  {}, 'Lineament Vectors (one feature per segment)', false);

// Lineament density: sum of edge pixels in a 500 m-radius disk kernel
// -> higher density = more fractured/faulted ground = better fluid
// pathways for structurally controlled Au mineralization.
var kernel = ee.Kernel.circle({radius: 500, units: 'meters'});
var lineamentDensity = edges.unmask(0).reduceNeighborhood({
  reducer: ee.Reducer.sum(), kernel: kernel
}).rename('Lineament_Density').clip(aoi);

var lineamentDensity_n = normalize01(lineamentDensity, 'Lineament_Density', aoi, 30);
Map.addLayer(lineamentDensity_n, {min: 0, max: 1, palette: ['ffffff','fee08b','d73027']},
  'Lineament Density (structural control proxy)', false);

// ============================================================
// 14. COMBINED GOLD TARGET PRIORITY MAP
//     Weighted sum of the alteration vector and structural density.
//     Default weights (70% alteration / 30% structure) suit
//     epithermal-style targeting; raise the structural weight (e.g.
//     0.5/0.5) for orogenic/shear-zone-hosted settings where
//     mineralogy alone is a weak vector.
// ============================================================
var altWeight = 0.7;
var structWeight = 0.3;

var goldTargetPriority = goldVectorCore.multiply(altWeight)
  .add(lineamentDensity_n.multiply(structWeight))
  .rename('Gold_Target_Priority').clip(aoi);

var priorityStats = goldTargetPriority.reduceRegion({
  reducer: ee.Reducer.percentile([50, 75, 90]),
  geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
});
var p50 = ee.Number(priorityStats.get('Gold_Target_Priority_p50'));
var p75 = ee.Number(priorityStats.get('Gold_Target_Priority_p75'));
var p90 = ee.Number(priorityStats.get('Gold_Target_Priority_p90'));

// 0 = Low, 1 = Moderate, 2 = High, 3 = Very High priority
var goldPriorityClass = ee.Image(0)
  .where(goldTargetPriority.gt(p50), 1)
  .where(goldTargetPriority.gt(p75), 2)
  .where(goldTargetPriority.gt(p90), 3)
  .rename('Gold_Priority_Class')
  .clip(aoi);

var priorityPalette = ['f7fbff', 'c6dbef', 'fd8d3c', 'de2d26'];
Map.addLayer(goldPriorityClass, {min: 0, max: 3, palette: priorityPalette},
  'GOLD TARGET PRIORITY MAP');

var goldLegend = ui.Panel({style: {position: 'bottom-right', padding: '8px 15px'}});
goldLegend.add(ui.Label('Gold Target Priority', {fontWeight: 'bold', fontSize: '14px'}));
var goldLegendItems = [
  ['f7fbff', 'Low (< median)'],
  ['c6dbef', 'Moderate (median-75th pct)'],
  ['fd8d3c', 'High (75th-90th pct)'],
  ['de2d26', 'Very High (> 90th pct)']
];
goldLegendItems.forEach(function(item) {
  var colorBox = ui.Label('', {backgroundColor: item[0], padding: '8px', margin: '0 6px 4px 0'});
  var desc = ui.Label(item[1], {margin: '0 0 4px 0', fontSize: '11px'});
  goldLegend.add(ui.Panel([colorBox, desc], ui.Panel.Layout.Flow('horizontal')));
});
Map.add(goldLegend);

// ============================================================
// 15. AREA & STATISTICS SUMMARY
//     Everything here prints to the Console on run, and is also
//     exported as CSV tables in section 16 so you have the numbers
//     outside the Code Editor too.
// ============================================================

// --- 15.1 Total study area, for reference / percent calculations ---
var totalAreaKm2 = ee.Number(aoi.area({maxError: 30})).divide(1e6);
print('TOTAL STUDY AREA (km^2):', totalAreaKm2);

// --- 15.2 Full descriptive statistics for every band ratio/index ---
// (mean/stdDev/min/max/25th/50th/75th/90th percentile, computed over
// the study area at 30 m). 'stats' already holds the 5 Landsat ratios
// from section 8; this adds the same for the Sentinel-2, ASTER, and
// gold-vector layers so every numeric layer has a printed statistics
// row.
var extraStatsImage = s2IronOxide.addBands(s2HydroxylClay)
  .addBands(asterOHIndex).addBands(kaoliniteIndex).addBands(aluniteIndex).addBands(calciteIndex)
  .addBands(goldVectorCore).addBands(goldVectorASTER).addBands(lineamentDensity)
  .addBands(goldTargetPriority);

var extraStats = extraStatsImage.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.minMax(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.percentile([25, 50, 75, 90]), sharedInputs: true}),
  geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
});

print('STATISTICS — Landsat band ratios (Iron Oxide, Ferrous, Hydroxyl/Clay, Gossan, Laterite):', stats);
print('STATISTICS — Sentinel-2 / ASTER / gold-vector / lineament-density layers:', extraStats);

// Flatten both stats dictionaries into one table (one row per band,
// one column per statistic) for the CSV export in section 16.
function statsToFeatureCollection(statsDict, bandNames) {
  return ee.FeatureCollection(bandNames.map(function(name) {
    var d = ee.Dictionary(statsDict);
    return ee.Feature(null, {
      'Band': name,
      'Mean': d.get(name + '_mean', null),
      'StdDev': d.get(name + '_stdDev', null),
      'Min': d.get(name + '_min', null),
      'Max': d.get(name + '_max', null),
      'P25': d.get(name + '_p25', null),
      'P50_Median': d.get(name + '_p50', null),
      'P75': d.get(name + '_p75', null),
      'P90': d.get(name + '_p90', null)
    });
  }));
}

var statsTable = statsToFeatureCollection(stats,
  ['Iron_Oxide_Ratio', 'Ferrous_Mineral_Ratio', 'Hydroxyl_Clay_Ratio', 'Gossan_Ratio', 'Laterite_Ratio']
).merge(statsToFeatureCollection(extraStats, [
  'S2_Iron_Oxide_Ratio', 'S2_Hydroxyl_Clay_Ratio', 'ASTER_AlOH_Index', 'ASTER_Kaolinite_Index',
  'ASTER_Alunite_Index', 'ASTER_Calcite_Index', 'Gold_Vector_Core', 'Gold_Vector_ASTER_Refinement',
  'Lineament_Density', 'Gold_Target_Priority'
]));
print('Full statistics table (one row per band/index):', statsTable);

// --- 15.3 Area covered by each Alteration Zone class (section 8) ---
var zoneLabels = {
  0: 'Background / unaltered',
  1: 'Iron oxide (gossan) - limonite/hematite/goethite',
  2: 'Argillic/phyllic - kaolinite/illite/sericite/alunite',
  3: 'Propylitic - chlorite/epidote/biotite',
  4: 'Advanced argillic (Fe-oxide + clay overlap)'
};
var zoneLabelDict = ee.Dictionary(zoneLabels);

var pixelAreaKm2 = ee.Image.pixelArea().divide(1e6).rename('area');
var zoneAreaGroups = ee.Dictionary(pixelAreaKm2.addBands(mineralZones).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'zone'}),
  geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
}));

var zoneAreaTable = ee.FeatureCollection(ee.List(zoneAreaGroups.get('groups')).map(function(g) {
  g = ee.Dictionary(g);
  var zone = ee.Number(g.get('zone'));
  var areaKm2 = ee.Number(g.get('sum'));
  return ee.Feature(null, {
    'Zone_ID': zone,
    'Zone_Label': zoneLabelDict.get(zone.format('%d'), 'Unknown'),
    'Area_km2': areaKm2,
    'Area_hectares': areaKm2.multiply(100),
    'Percent_of_Study_Area': areaKm2.divide(totalAreaKm2).multiply(100)
  });
}));
print('AREA PER ALTERATION ZONE CLASS:', zoneAreaTable);

// --- 15.4 Area covered by each Gold Target Priority class (section 14) ---
var priorityLabels = {
  0: 'Low (< median)',
  1: 'Moderate (median-75th pct)',
  2: 'High (75th-90th pct)',
  3: 'Very High (> 90th pct)'
};
var priorityLabelDict = ee.Dictionary(priorityLabels);

var priorityAreaGroups = ee.Dictionary(pixelAreaKm2.addBands(goldPriorityClass).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'priority'}),
  geometry: aoi, scale: 30, maxPixels: 1e9, bestEffort: true
}));

var priorityAreaTable = ee.FeatureCollection(ee.List(priorityAreaGroups.get('groups')).map(function(g) {
  g = ee.Dictionary(g);
  var cls = ee.Number(g.get('priority'));
  var areaKm2 = ee.Number(g.get('sum'));
  return ee.Feature(null, {
    'Priority_Class_ID': cls,
    'Priority_Label': priorityLabelDict.get(cls.format('%d'), 'Unknown'),
    'Area_km2': areaKm2,
    'Area_hectares': areaKm2.multiply(100),
    'Percent_of_Study_Area': areaKm2.divide(totalAreaKm2).multiply(100)
  });
}));
print('AREA PER GOLD TARGET PRIORITY CLASS:', priorityAreaTable);

// ============================================================
// 16. EXPORTS — every layer produced above, all clipped to the study
//     area boundary (region: aoi = the exact study_area polygon, not
//     its bounding box; combined with the .clip(aoi) on each source
//     image, pixels outside the boundary are masked/nodata in the
//     GeoTIFF). Each task below still needs a manual "Run" click in
//     the Tasks tab (Earth Engine does not auto-start exports).
// ============================================================

// 16.1 Landsat 8/9 true-color + false-color 6-5-4 visual reference
Export.image.toDrive({
  image: image.select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7']),
  description: 'Landsat89_Composite_AllBands',
  folder: 'GEE_exports',
  fileNamePrefix: 'landsat89_composite',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.2 Standard hydrothermal alteration band ratios (section 5)
Export.image.toDrive({
  image: ratioStack.toDouble(),
  description: 'Hydrothermal_Alteration_Ratios',
  folder: 'GEE_exports',
  fileNamePrefix: 'alteration_ratios',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.3 Sabins-style RGB alteration ratio composite (section 6)
Export.image.toDrive({
  image: alterationComposite.toDouble(),
  description: 'Alteration_Ratio_Composite_RGB',
  folder: 'GEE_exports',
  fileNamePrefix: 'alteration_ratio_composite',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.4 Crosta-technique PCA components, iron-oxide and hydroxyl subsets
//      (section 7) — inspect the eigenvector print-outs in the console
//      to know which PC band is the real alteration index before use.
Export.image.toDrive({
  image: pcaFe.pcImage.toDouble(),
  description: 'PCA_Iron_Oxide_Components',
  folder: 'GEE_exports',
  fileNamePrefix: 'pca_iron_oxide',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

Export.image.toDrive({
  image: pcaOH.pcImage.toDouble(),
  description: 'PCA_Hydroxyl_Components',
  folder: 'GEE_exports',
  fileNamePrefix: 'pca_hydroxyl',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.5 Threshold-based mineral/alteration zonation map (section 8)
Export.image.toDrive({
  image: mineralZones,
  description: 'Mineral_Alteration_Zonation_Map',
  folder: 'GEE_exports',
  fileNamePrefix: 'alteration_zonation',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.6 Sentinel-2 validation ratios (section 9)
Export.image.toDrive({
  image: s2IronOxide.addBands(s2HydroxylClay).toDouble(),
  description: 'Sentinel2_Validation_Ratios',
  folder: 'GEE_exports',
  fileNamePrefix: 'sentinel2_ratios',
  region: aoi,
  scale: 20,
  maxPixels: 1e9
});

// 16.7 ASTER SWIR clay-mineral indices (section 10)
Export.image.toDrive({
  image: asterOHIndex.addBands(kaoliniteIndex).addBands(aluniteIndex).addBands(calciteIndex).toDouble(),
  description: 'ASTER_Clay_Mineral_Indices',
  folder: 'GEE_exports',
  fileNamePrefix: 'aster_clay_indices',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.8 Cross-sensor clay/hydroxyl validation sample points (section 11)
Export.table.toDrive({
  collection: samplePts,
  description: 'Clay_Hydroxyl_CrossSensor_Validation_Points',
  folder: 'GEE_exports',
  fileNamePrefix: 'clay_validation_points',
  fileFormat: 'CSV'
});

// 16.8b Full statistics table for every band ratio/index (section 15.2)
Export.table.toDrive({
  collection: statsTable,
  description: 'Band_Ratio_Statistics',
  folder: 'GEE_exports',
  fileNamePrefix: 'band_ratio_statistics',
  fileFormat: 'CSV'
});

// 16.8c Area per Alteration Zone class (section 15.3)
Export.table.toDrive({
  collection: zoneAreaTable,
  description: 'Alteration_Zone_Areas',
  folder: 'GEE_exports',
  fileNamePrefix: 'alteration_zone_areas',
  fileFormat: 'CSV'
});

// 16.8d Area per Gold Target Priority class (section 15.4)
Export.table.toDrive({
  collection: priorityAreaTable,
  description: 'Gold_Priority_Class_Areas',
  folder: 'GEE_exports',
  fileNamePrefix: 'gold_priority_class_areas',
  fileFormat: 'CSV'
});

// 16.9 Gold vector layers, core + ASTER refinement (section 12)
Export.image.toDrive({
  image: goldVectorCore.addBands(goldVectorASTER).toDouble(),
  description: 'Gold_Vector_Indices',
  folder: 'GEE_exports',
  fileNamePrefix: 'gold_vector_indices',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.10 Structural lineament density (section 13)
Export.image.toDrive({
  image: lineamentDensity.addBands(lineamentDensity_n).toDouble(),
  description: 'Structural_Lineament_Density',
  folder: 'GEE_exports',
  fileNamePrefix: 'lineament_density',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

// 16.10b Lineament vectors — one polygon feature per distinct lineament
// segment (section 13.1), not one point per pixel. SHP is a standard
// GIS vector format; switch fileFormat to 'GeoJSON' or 'KML' if you'd
// rather have those instead.
Export.table.toDrive({
  collection: lineamentVectors,
  description: 'Lineament_Vectors',
  folder: 'GEE_exports',
  fileNamePrefix: 'lineament_vectors',
  fileFormat: 'SHP'
});

// 16.11 Combined gold target priority map (section 14)
Export.image.toDrive({
  image: goldTargetPriority.addBands(goldPriorityClass).addBands(lineamentDensity_n).toDouble(),
  description: 'Gold_Target_Priority_Map',
  folder: 'GEE_exports',
  fileNamePrefix: 'gold_target_priority',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

/**
 * INTERPRETATION SUMMARY
 * ------------------------------------------------------------
 * Iron Oxide Ratio (B4/B2)     high -> limonite, hematite, goethite, jarosite
 *                                       (oxidized/weathered zones, gossans)
 * Ferrous Mineral Ratio (B6/B5) high -> biotite, chlorite, amphibole, pyroxene
 *                                       (propylitic/mafic alteration)
 * Hydroxyl/Clay Ratio (B6/B7)   high -> kaolinite, illite, sericite, alunite,
 *                                       gypsum (argillic/phyllic alteration —
 *                                       classic ore-proximal halo)
 * Gossan Ratio (B5/B4)          high -> gossan (Fe-capped sulfide outcrops)
 * Laterite Ratio (B6/B2)        high -> laterite/duricrust, deep weathering
 *
 * Zonation map combines Iron-oxide + Hydroxyl-clay + Ferrous anomalies
 * (each > mean + 1 stdDev over the AOI) into 5 classes. This is a first-pass
 * reconnaissance tool — always validate with field sampling, spectral
 * libraries (e.g. USGS splib07), or hyperspectral data (PRISMA/EMIT)
 * before drawing exploration conclusions.
 *
 * CLAY/HYDROXYL CROSS-SENSOR VALIDATION (sections 9-11)
 * Sentinel-2 (B11/B12)          same physical ratio as Landsat B6/B7 at
 *                                20 m — confirms the spatial pattern is
 *                                not a Landsat sensor artifact.
 * ASTER AlOH Index (B5+B7)/B6   generic phyllosilicate/OH indicator with
 *                                much finer SWIR spectral resolution.
 * ASTER Kaolinite Index         high -> kaolinite specifically.
 * ASTER Alunite Index           high -> alunite specifically (advanced
 *                                argillic / high-sulfidation indicator).
 * ASTER Calcite Index           high -> calcite/chlorite/epidote
 *                                (propylitic halo, outer alteration zone).
 * A high positive correlation (Pearson r, printed in the console) between
 * the Landsat ratio and both the Sentinel-2 and ASTER indices supports
 * treating the Landsat argillic/phyllic zones as a genuine mineralogical
 * signal. NOTE: ASTER SWIR is only reliable pre-April-2008 (detector
 * degradation since), so the ASTER check reflects the lithology/
 * alteration footprint, assumed static, not current land cover — a weak
 * or negative ASTER correlation more often means sparse/no valid
 * pre-2008 coverage over the AOI than a false Landsat signal; check the
 * printed ASTER scene count first.
 *
 * GOLD TARGETING LAYERS (sections 12-14)
 * Gold Vector - Core             weighted 0.45 Iron Oxide + 0.45 Hydroxyl/
 *                                 Clay + 0.10 Ferrous, i.e. brightest where
 *                                 the advanced-argillic overlap (iron oxide
 *                                 AND clay both anomalous) occurs — the
 *                                 classic epithermal Au alteration core.
 * Gold Vector - ASTER Refinement weighted 0.5 Alunite + 0.3 Kaolinite +
 *                                 0.2 AlOH; alunite is the strongest single
 *                                 Au-diagnostic mineral here (advanced
 *                                 argillic/high-sulfidation indicator) —
 *                                 only trust this where section 10 printed
 *                                 a non-zero pre-2008 ASTER scene count.
 * Lineament Density               Canny-edge density on an SRTM hillshade,
 *                                 a proxy for the fault/fracture network
 *                                 that channeled Au-bearing fluids — every
 *                                 Au deposit style in this list is
 *                                 structurally controlled, so alteration
 *                                 without structure is a weaker target.
 * Gold Target Priority Map        0.7 * Gold_Vector_Core + 0.3 * Lineament
 *                                 Density, classed by percentile (median/
 *                                 75th/90th) into Low/Moderate/High/Very
 *                                 High. Raise the structural weight for
 *                                 orogenic/shear-hosted settings; swap in
 *                                 Gold_Vector_ASTER_Refinement in place of
 *                                 (or blended with) the core vector where
 *                                 pre-2008 ASTER coverage is good, since it
 *                                 resolves alunite specifically. This is a
 *                                 reconnaissance ranking, not a drill-target
 *                                 selector — ground-truth Very High cells
 *                                 with mapping, soil/rock geochemistry, or
 *                                 hyperspectral data before committing
 *                                 exploration budget.
 */
