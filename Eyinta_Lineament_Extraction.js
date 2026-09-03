/***************************************************************
 * =============================================================
 * EYINTA LINEAMENT EXTRACTION FOR MINERAL PROSPECTIVITY
 * =============================================================
 *
 * STUDY AREA:
 * projects/ee-samuelachonuojih/assets/Eyinta
 *
 * DATA:
 * SRTM 30 m DEM
 *
 * PROCESSING:
 * 1. Load study area
 * 2. Load SRTM DEM
 * 3. Generate terrain derivatives
 * 4. Generate multi-directional hillshades
 * 5. Create hillshade composite
 * 6. Smooth hillshade
 * 7. Canny edge detection
 * 8. Binary lineament extraction
 * 9. Remove isolated pixels
 * 10. Calculate lineament density
 * 11. Calculate lineament statistics
 * 12. Export all outputs
 *
 * NOTE:
 * The extracted features are terrain-derived linear features.
 * They require geological interpretation/validation before
 * being referred to as confirmed faults or fractures.
 * =============================================================
 ***************************************************************/


// =============================================================
// 1. LOAD EYINTA STUDY AREA
// =============================================================

var studyArea = ee.FeatureCollection(
  'projects/ee-samuelachonuojih/assets/Eyinta'
);

var studyGeom = studyArea.geometry();


// Display study area

Map.centerObject(studyArea, 12);

Map.addLayer(
  studyArea.style({
    color: 'FF0000',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'Eyinta Study Area'
);


// Print study area information

print('==========================================');
print('EYINTA STUDY AREA');
print('==========================================');

print('Study Area:', studyArea);

print(
  'Study Area Area (km²):',
  studyGeom.area({
    maxError: 10
  }).divide(1000000)
);


// =============================================================
// 2. LOAD SRTM 30 m DEM
// =============================================================

var dem = ee.Image('USGS/SRTMGL1_003')
  .select('elevation')
  .clip(studyGeom);


print('SRTM DEM:', dem);


// Display DEM

Map.addLayer(
  dem,
  {
    min: 100,
    max: 600,
    palette: [
      '0000FF',
      '00FFFF',
      '00FF00',
      'FFFF00',
      'FFA500',
      'FF0000'
    ]
  },
  'SRTM DEM',
  false
);


// =============================================================
// 3. TERRAIN SLOPE
// =============================================================

var slope = ee.Terrain.slope(dem)
  .clip(studyGeom);


Map.addLayer(
  slope,
  {
    min: 0,
    max: 45,
    palette: [
      'FFFFFF',
      'FFFF00',
      'FFA500',
      'FF0000'
    ]
  },
  'Slope',
  false
);


// =============================================================
// 4. TERRAIN ASPECT
// =============================================================

var aspect = ee.Terrain.aspect(dem)
  .clip(studyGeom);


Map.addLayer(
  aspect,
  {
    min: 0,
    max: 360,
    palette: [
      '0000FF',
      '00FFFF',
      '00FF00',
      'FFFF00',
      'FF0000',
      'FF00FF',
      '0000FF'
    ]
  },
  'Aspect',
  false
);


// =============================================================
// 5. MULTI-DIRECTIONAL HILLSHADE
// =============================================================
//
// Multiple illumination directions are used because a
// structural feature may be clearly visible under one
// illumination direction but poorly visible under another.
//
// Azimuths:
// 45°
// 90°
// 135°
// 180°
// 225°
// 270°
// 315°
//
// Solar altitude = 45°
// =============================================================


var hillshade45 = ee.Terrain.hillshade(
  dem,
  45,
  45
);

var hillshade90 = ee.Terrain.hillshade(
  dem,
  90,
  45
);

var hillshade135 = ee.Terrain.hillshade(
  dem,
  135,
  45
);

var hillshade180 = ee.Terrain.hillshade(
  dem,
  180,
  45
);

var hillshade225 = ee.Terrain.hillshade(
  dem,
  225,
  45
);

var hillshade270 = ee.Terrain.hillshade(
  dem,
  270,
  45
);

var hillshade315 = ee.Terrain.hillshade(
  dem,
  315,
  45
);


// =============================================================
// 6. CREATE MULTI-DIRECTIONAL HILLSHADE COMPOSITE
// =============================================================
//
// Median composite reduces extreme responses while retaining
// terrain structures visible across illumination directions.
//
// =============================================================

var multiHillshade = ee.ImageCollection([
  hillshade45,
  hillshade90,
  hillshade135,
  hillshade180,
  hillshade225,
  hillshade270,
  hillshade315
])
.median()
.clip(studyGeom);


Map.addLayer(
  multiHillshade,
  {
    min: 80,
    max: 255,
    gamma: 1.2
  },
  'Multi-Directional Hillshade'
);


// =============================================================
// 7. SMOOTH HILLSHADE
// =============================================================
//
// A small focal mean filter reduces isolated DEM noise
// before edge detection.
// =============================================================

var smoothHillshade = multiHillshade
  .focal_mean({
    radius: 1,
    units: 'pixels'
  })
  .clip(studyGeom);


Map.addLayer(
  smoothHillshade,
  {
    min: 80,
    max: 255,
    gamma: 1.2
  },
  'Smoothed Hillshade',
  false
);


// =============================================================
// 8. NORMALIZE HILLSHADE
// =============================================================

var normalizedHillshade = smoothHillshade
  .unitScale(50, 255)
  .clamp(0, 1)
  .rename('Normalized_Hillshade');


Map.addLayer(
  normalizedHillshade,
  {
    min: 0,
    max: 1,
    palette: [
      '000000',
      'FFFFFF'
    ]
  },
  'Normalized Hillshade',
  false
);


// =============================================================
// 9. CANNY EDGE DETECTION
// =============================================================
//
// threshold = 0.12
//
// Lower threshold:
// More detected edges, but more noise.
//
// Higher threshold:
// Fewer edges, stronger features.
//
// sigma = 1
//
// Controls Gaussian smoothing prior to edge detection.
// =============================================================

var cannyEdges = ee.Algorithms.CannyEdgeDetector({
  image: normalizedHillshade,
  threshold: 0.12,
  sigma: 1
})
.clip(studyGeom)
.rename('Canny_Edges');


Map.addLayer(
  cannyEdges,
  {
    min: 0,
    max: 1,
    palette: [
      '000000',
      'FF0000'
    ]
  },
  'Raw Canny Edges',
  false
);


// =============================================================
// 10. CONVERT CANNY EDGES TO BINARY LINEAMENT RASTER
// =============================================================

var rawLineaments = cannyEdges
  .gt(0)
  .selfMask()
  .rename('Lineament')
  .clip(studyGeom);


Map.addLayer(
  rawLineaments,
  {
    palette: [
      'FF0000'
    ]
  },
  'Raw Lineaments',
  false
);


// =============================================================
// 11. REMOVE ISOLATED FEATURES
// =============================================================
//
// connectedPixelCount identifies the number of connected
// pixels belonging to the same feature.
//
// Features with fewer than 5 connected pixels are removed.
//
// At 30 m:
//
// 5 pixels ≈ 150 m minimum connected length
//
// Note:
// This is an approximate filtering criterion because diagonal
// connectivity and line geometry affect the actual length.
// =============================================================

var connectedPixels = rawLineaments
  .connectedPixelCount(
    100,
    true
  );


var filteredLineaments = rawLineaments
  .updateMask(
    connectedPixels.gte(5)
  )
  .selfMask()
  .rename('Lineament')
  .clip(studyGeom);


Map.addLayer(
  filteredLineaments,
  {
    palette: [
      '00FFFF'
    ]
  },
  'Filtered Lineaments'
);


// =============================================================
// 12. LINEAMENT DENSITY
// =============================================================
//
// A 500 m radius circular neighbourhood is used.
//
// The density represents the proportion of the neighbourhood
// occupied by detected lineament pixels.
//
// This is a RELATIVE lineament-density indicator.
//
// It should not be reported as km/km² unless actual line
// lengths have been extracted.
// =============================================================


var lineamentBinary = filteredLineaments
  .unmask(0)
  .rename('Lineament');


var radius = 500;


// Circular neighbourhood

var densityKernel = ee.Kernel.circle({
  radius: radius,
  units: 'meters',
  normalize: false
});


// Count lineament pixels

var lineamentPixelCountLocal = lineamentBinary
  .reduceNeighborhood({
    reducer: ee.Reducer.sum(),
    kernel: densityKernel
  });


// SRTM pixel area approximation

var pixelArea = 30 * 30;


// Area of circular neighbourhood

var neighbourhoodArea =
  Math.PI * radius * radius;


// Relative density

var lineamentDensity = lineamentPixelCountLocal
  .multiply(pixelArea)
  .divide(neighbourhoodArea)
  .rename('Lineament_Density')
  .clip(studyGeom);


// =============================================================
// 13. LINEAMENT DENSITY PERCENTAGE
// =============================================================

var lineamentDensityPercent = lineamentDensity
  .multiply(100)
  .rename('Lineament_Density_Percent')
  .clip(studyGeom);


// Display density

Map.addLayer(
  lineamentDensityPercent,
  {
    min: 0,
    max: 5,
    palette: [
      'FFFFFF',
      'FFFF00',
      'FFA500',
      'FF0000',
      '800000'
    ]
  },
  'Lineament Density (%)'
);


// =============================================================
// 14. CALCULATE TOTAL LINEAMENT PIXELS
// =============================================================

var totalLineamentPixels = filteredLineaments
  .reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


print('==========================================');
print('LINEAMENT STATISTICS');
print('==========================================');


print(
  'Total detected lineament pixels:',
  totalLineamentPixels.get('Lineament')
);


// =============================================================
// 15. CALCULATE LINEAMENT PIXEL AREA
// =============================================================

var lineamentAreaImage = filteredLineaments
  .multiply(
    ee.Image.pixelArea()
  )
  .rename('Lineament_Area');


var lineamentArea = lineamentAreaImage
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


var lineamentAreaM2 = ee.Number(
  lineamentArea.get('Lineament_Area')
);


var lineamentAreaKm2 = lineamentAreaM2
  .divide(1000000);


print(
  'Detected lineament pixel area (m²):',
  lineamentAreaM2
);


print(
  'Detected lineament pixel area (km²):',
  lineamentAreaKm2
);


// =============================================================
// 16. STUDY AREA AREA
// =============================================================

var studyAreaAreaM2 = studyGeom
  .area({
    maxError: 10
  });


var studyAreaAreaKm2 = studyAreaAreaM2
  .divide(1000000);


print(
  'Study area area (km²):',
  studyAreaAreaKm2
);


// =============================================================
// 17. OVERALL LINEAMENT PIXEL COVERAGE
// =============================================================

var lineamentCoverage = lineamentAreaKm2
  .divide(studyAreaAreaKm2)
  .multiply(100);


print(
  'Overall lineament pixel coverage (%):',
  lineamentCoverage
);


// =============================================================
// 18. LINEAMENT DENSITY STATISTICS
// =============================================================

var densityStatistics = lineamentDensityPercent
  .reduceRegion({
    reducer: ee.Reducer.mean()
      .combine({
        reducer2: ee.Reducer.min(),
        sharedInputs: true
      })
      .combine({
        reducer2: ee.Reducer.max(),
        sharedInputs: true
      }),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


print(
  'Mean lineament density (%):',
  densityStatistics.get(
    'Lineament_Density_Percent_mean'
  )
);


print(
  'Minimum lineament density (%):',
  densityStatistics.get(
    'Lineament_Density_Percent_min'
  )
);


print(
  'Maximum lineament density (%):',
  densityStatistics.get(
    'Lineament_Density_Percent_max'
  )
);


// =============================================================
// 19. CREATE LINEAMENT DENSITY CLASSES
// =============================================================
//
// Five relative density classes:
//
// 1 = Very Low
// 2 = Low
// 3 = Moderate
// 4 = High
// 5 = Very High
//
// Percentile-based classification is preferable for prospectivity
// analysis because it adapts to the actual distribution of the
// study area.
// =============================================================


var densityPercentiles = lineamentDensityPercent
  .reduceRegion({
    reducer: ee.Reducer.percentile([
      20,
      40,
      60,
      80
    ]),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


print(
  'Lineament Density Percentiles:',
  densityPercentiles
);


var p20 = ee.Number(
  densityPercentiles.get(
    'Lineament_Density_Percent_p20'
  )
);

var p40 = ee.Number(
  densityPercentiles.get(
    'Lineament_Density_Percent_p40'
  )
);

var p60 = ee.Number(
  densityPercentiles.get(
    'Lineament_Density_Percent_p60'
  )
);

var p80 = ee.Number(
  densityPercentiles.get(
    'Lineament_Density_Percent_p80'
  )
);


// Create classes

var densityClass = ee.Image(1)
  .where(
    lineamentDensityPercent.gt(p20),
    2
  )
  .where(
    lineamentDensityPercent.gt(p40),
    3
  )
  .where(
    lineamentDensityPercent.gt(p60),
    4
  )
  .where(
    lineamentDensityPercent.gt(p80),
    5
  )
  .rename('Lineament_Density_Class')
  .clip(studyGeom);


// Display classes

Map.addLayer(
  densityClass,
  {
    min: 1,
    max: 5,
    palette: [
      'FFFFFF',
      'FFFF00',
      'FFA500',
      'FF0000',
      '800000'
    ]
  },
  'Lineament Density Classes'
);


// =============================================================
// 20. EXPORT FILTERED LINEAMENT RASTER
// =============================================================

Export.image.toDrive({

  image: filteredLineaments
    .toByte()
    .rename('Lineament'),

  description:
    'Eyinta_Filtered_Lineaments',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_Filtered_Lineaments',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 21. EXPORT MULTI-DIRECTIONAL HILLSHADE
// =============================================================

Export.image.toDrive({

  image: multiHillshade
    .toFloat()
    .rename('Multi_Directional_Hillshade'),

  description:
    'Eyinta_Multi_Directional_Hillshade',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_Multi_Directional_Hillshade',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 22. EXPORT RAW CANNY EDGES
// =============================================================

Export.image.toDrive({

  image: cannyEdges
    .toFloat()
    .rename('Canny_Edges'),

  description:
    'Eyinta_Canny_Edges',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_Canny_Edges',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 23. EXPORT LINEAMENT DENSITY
// =============================================================

Export.image.toDrive({

  image: lineamentDensity
    .toFloat()
    .rename('Lineament_Density'),

  description:
    'Eyinta_Lineament_Density',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_Lineament_Density',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 24. EXPORT LINEAMENT DENSITY PERCENTAGE
// =============================================================

Export.image.toDrive({

  image: lineamentDensityPercent
    .toFloat()
    .rename('Lineament_Density_Percent'),

  description:
    'Eyinta_Lineament_Density_Percent',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_Lineament_Density_Percent',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 25. EXPORT LINEAMENT DENSITY CLASSES
// =============================================================

Export.image.toDrive({

  image: densityClass
    .toByte()
    .rename('Lineament_Density_Class'),

  description:
    'Eyinta_Lineament_Density_Classes',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_Lineament_Density_Classes',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 26. EXPORT DEM
// =============================================================

Export.image.toDrive({

  image: dem
    .toFloat()
    .rename('SRTM_Elevation'),

  description:
    'Eyinta_SRTM_DEM',

  folder:
    'Eyinta_Mineral_Exploration',

  fileNamePrefix:
    'Eyinta_SRTM_DEM',

  region:
    studyGeom,

  scale:
    30,

  crs:
    'EPSG:32631',

  maxPixels:
    1e13,

  fileFormat:
    'GeoTIFF'
});


// =============================================================
// 27. FINAL CONSOLE SUMMARY
// =============================================================

print('==========================================');
print('EYINTA LINEAMENT EXTRACTION COMPLETE');
print('==========================================');

print(
  'Study Area (km²):',
  studyAreaAreaKm2
);

print(
  'Lineament Pixel Area (km²):',
  lineamentAreaKm2
);

print(
  'Lineament Pixel Coverage (%):',
  lineamentCoverage
);

print(
  'Mean Density (%):',
  densityStatistics.get(
    'Lineament_Density_Percent_mean'
  )
);

print(
  'Maximum Density (%):',
  densityStatistics.get(
    'Lineament_Density_Percent_max'
  )
);

print('==========================================');

print(
  'Export folder:',
  'Eyinta_Mineral_Exploration'
);

print('==========================================');
