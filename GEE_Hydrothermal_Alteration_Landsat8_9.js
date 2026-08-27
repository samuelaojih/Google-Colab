/**
 * HYDROTHERMAL ALTERATION MAPPING — Landsat 8/9 OLI (Collection 2, Level-2 SR)
 * ------------------------------------------------------------------------
 * Study area : projects/ee-samuelaojih/assets/study_area
 * Method     : Classic band-ratio technique (Sabins 1997; Segal 1983;
 *              Kaufmann 1988) adapted to Landsat 8/9 OLI band numbering,
 *              plus a Crosta-technique (selective PCA) alteration index
 *              and a simple threshold-based mineral-zonation map.
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
  .rename('Iron_Oxide_Ratio');

// --- 5.2 Ferrous Mineral ratio: SWIR1 / NIR = B6/B5 ---
// Highlights: biotite, chlorite, amphibole, pyroxene (mafic/propylitic
// alteration — chlorite-epidote-carbonate assemblages).
// High values = ferrous-silicate-bearing rocks.
var ferrousMinerals = image.select('SR_B6').divide(image.select('SR_B5'))
  .rename('Ferrous_Mineral_Ratio');

// --- 5.3 Hydroxyl / Clay-Sericite-Alunite ratio: SWIR1 / SWIR2 = B6/B7 ---
// Highlights: kaolinite, illite, muscovite/sericite, alunite, gypsum
// (argillic and phyllic/sericitic alteration — classic hydrothermal
// halo around ore bodies, since these OH-bearing minerals absorb
// strongly in SWIR2 relative to SWIR1).
var hydroxylClay = image.select('SR_B6').divide(image.select('SR_B7'))
  .rename('Hydroxyl_Clay_Ratio');

// --- 5.4 Gossan ratio: NIR / Red = B5/B4 ---
// Highlights: gossan (iron-capped outcrops above sulfide deposits) —
// low reflectance in red (Fe absorption) but higher NIR reflectance
// relative to iron oxide alone; used to separate true gossan from
// generic ferruginous soils.
var gossan = image.select('SR_B5').divide(image.select('SR_B4'))
  .rename('Gossan_Ratio');

// --- 5.5 Laterite / ferric-oxide + clay combined ratio: SWIR1/Blue = B6/B2 ---
// Highlights: laterite/duricrust and deeply weathered regolith,
// useful for distinguishing surficial weathering from bedrock alteration.
var laterite = image.select('SR_B6').divide(image.select('SR_B2'))
  .rename('Laterite_Ratio');

var ratioStack = ironOxide.addBands(ferrousMinerals)
  .addBands(hydroxylClay).addBands(gossan).addBands(laterite);

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
var alterationComposite = ee.Image.cat([ironOxide, hydroxylClay, ferrousMinerals]);
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
    .arrayProject([0]).arrayFlatten([bandNames.map(function(b, i) { return 'PC' + (i + 1); })]);

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
  reducer: ee.Reducer.mean().combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true}),
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
  .updateMask(ee.Image(1)); // keep full extent, 0 = background

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
// 9. EXPORTS
// ============================================================
Export.image.toDrive({
  image: ratioStack,
  description: 'Hydrothermal_Alteration_Ratios',
  folder: 'GEE_exports',
  fileNamePrefix: 'alteration_ratios',
  region: aoi,
  scale: 30,
  maxPixels: 1e9
});

Export.image.toDrive({
  image: mineralZones,
  description: 'Mineral_Alteration_Zonation_Map',
  folder: 'GEE_exports',
  fileNamePrefix: 'alteration_zonation',
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
 * libraries (e.g. USGS splib07), or hyperspectral data (ASTER/Sentinel-2/
 * PRISMA/EMIT) before drawing exploration conclusions.
 */
