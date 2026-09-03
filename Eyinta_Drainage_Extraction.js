/***************************************************************
 * =============================================================
 * EYINTA DRAINAGE NETWORK EXTRACTION FOR MINERAL PROSPECTIVITY
 * =============================================================
 *
 * STUDY AREA:
 * projects/ee-samuelachonuojih/assets/Eyinta
 *
 * DATA:
 * SRTM 30 m DEM (context / hillshade backdrop)
 * WWF HydroSHEDS Flow Accumulation, 15 arc-seconds
 * WWF HydroSHEDS Flow Direction, 15 arc-seconds
 *
 * PROCESSING:
 * 1. Load study area
 * 2. Load SRTM DEM and derive hillshade backdrop
 * 3. Load HydroSHEDS flow accumulation and flow direction
 * 4. Align hydrology layers to the SRTM 30 m grid
 * 5. Log-transform flow accumulation
 * 6. Percentile-based channel initiation thresholding
 * 7. Create binary drainage network raster
 * 8. Remove isolated/spurious pixels
 * 9. Classify drainage into relative order classes
 * 10. Calculate drainage density
 * 11. Vectorize the drainage network (approximate corridors)
 * 12. Calculate drainage statistics
 * 13. Export all outputs
 *
 * NOTE:
 * Earth Engine has no native D8/D-infinity flow-routing
 * algorithm, so flow accumulation and flow direction are taken
 * from the precomputed HydroSHEDS hydrography layers (native
 * resolution ~15 arc-seconds, ~450-500 m) rather than derived
 * directly from the 30 m SRTM tile used elsewhere in this
 * project. This means the network below reliably captures
 * moderate-to-major channels but will miss the finest
 * first-order tributaries that a true 30 m flow-routing
 * analysis (e.g. WhiteboxTools/TauDEM/QGIS r.watershed run
 * outside Earth Engine) would resolve. The reprojection to the
 * SRTM 30 m grid below is purely for co-registration with the
 * lineament outputs — it does not add real spatial detail.
 * =============================================================
 ***************************************************************/


// =============================================================
// 1. LOAD EYINTA STUDY AREA
// =============================================================

var studyArea = ee.FeatureCollection(
  'projects/ee-samuelachonuojih/assets/Eyinta'
);

var studyGeom = studyArea.geometry();


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


print('==========================================');
print('EYINTA STUDY AREA');
print('==========================================');

print('Study Area:', studyArea);


// =============================================================
// 2. LOAD SRTM DEM AND HILLSHADE BACKDROP
// =============================================================

var dem = ee.Image('USGS/SRTMGL1_003')
  .select('elevation')
  .clip(studyGeom);


var hillshade = ee.Terrain.hillshade(dem, 315, 45)
  .clip(studyGeom);


Map.addLayer(
  hillshade,
  {
    min: 80,
    max: 255,
    gamma: 1.2
  },
  'Hillshade Backdrop',
  false
);


// =============================================================
// 3. LOAD HYDROSHEDS FLOW ACCUMULATION AND FLOW DIRECTION
// =============================================================
//
// Flow accumulation (band b1):
// Number of upstream cells draining into each cell.
//
// Flow direction (band b1):
// ESRI D8 encoding.
// 1 = E, 2 = SE, 4 = S, 8 = SW, 16 = W, 32 = NW, 64 = N, 128 = NE
// 0 = ocean outlet, -1 = inland sink.
// =============================================================

var flowAccumulationRaw = ee.Image('WWF/HydroSHEDS/15ACC')
  .select('b1')
  .rename('Flow_Accumulation');

var flowDirectionRaw = ee.Image('WWF/HydroSHEDS/15DIR')
  .select('b1')
  .rename('Flow_Direction');


// =============================================================
// 4. ALIGN HYDROLOGY LAYERS TO THE SRTM 30 m GRID
// =============================================================
//
// Bilinear resampling is used for the continuous accumulation
// grid; flow direction is categorical, so it is reprojected
// with nearest-neighbour (default) resampling to avoid
// inventing invalid direction codes.
// =============================================================

var demProjection = dem.projection();

var flowAccumulation = flowAccumulationRaw
  .resample('bilinear')
  .reproject({
    crs: demProjection,
    scale: 30
  })
  .clip(studyGeom);

var flowDirection = flowDirectionRaw
  .reproject({
    crs: demProjection,
    scale: 30
  })
  .clip(studyGeom);


Map.addLayer(
  flowDirection,
  {
    min: 0,
    max: 128,
    palette: [
      '440154',
      '3B528B',
      '21908C',
      '5DC863',
      'FDE725'
    ]
  },
  'Flow Direction',
  false
);


// =============================================================
// 5. LOG-TRANSFORM FLOW ACCUMULATION
// =============================================================
//
// Flow accumulation is extremely right-skewed (most pixels are
// hillslope with very low values; a small fraction of pixels
// along valley bottoms have very high values). A log transform
// makes the distribution usable for percentile thresholding and
// display.
// =============================================================

var logAccumulation = flowAccumulation
  .add(1)
  .log10()
  .rename('Log_Flow_Accumulation');


Map.addLayer(
  logAccumulation,
  {
    min: 0,
    max: 4,
    palette: [
      'FFFFFF',
      '9ECAE1',
      '4292C6',
      '08519C',
      '08306B'
    ]
  },
  'Log Flow Accumulation',
  false
);


// =============================================================
// 6. PERCENTILE-BASED CHANNEL INITIATION THRESHOLDING
// =============================================================
//
// Contributing-area percentile thresholds are used to define
// channel initiation and relative stream order, rather than a
// fixed cell count, so the classification adapts to the actual
// distribution of accumulated area within this specific study
// area.
// =============================================================

var accumulationPercentiles = logAccumulation
  .reduceRegion({
    reducer: ee.Reducer.percentile([
      90,
      95,
      98,
      99
    ]),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


print(
  'Flow Accumulation Percentiles (log10):',
  accumulationPercentiles
);


var p90 = ee.Number(
  accumulationPercentiles.get(
    'Log_Flow_Accumulation_p90'
  )
);

var p95 = ee.Number(
  accumulationPercentiles.get(
    'Log_Flow_Accumulation_p95'
  )
);

var p98 = ee.Number(
  accumulationPercentiles.get(
    'Log_Flow_Accumulation_p98'
  )
);

var p99 = ee.Number(
  accumulationPercentiles.get(
    'Log_Flow_Accumulation_p99'
  )
);


// =============================================================
// 7. CREATE BINARY DRAINAGE NETWORK RASTER
// =============================================================
//
// Channel initiation threshold = 90th percentile of local
// contributing area (log10).
// =============================================================

var rawDrainage = logAccumulation
  .gte(p90)
  .selfMask()
  .rename('Drainage')
  .clip(studyGeom);


Map.addLayer(
  rawDrainage,
  {
    palette: [
      'FF0000'
    ]
  },
  'Raw Drainage Network',
  false
);


// =============================================================
// 8. REMOVE ISOLATED / SPURIOUS PIXELS
// =============================================================

var connectedPixels = rawDrainage
  .connectedPixelCount(
    50,
    true
  );


var filteredDrainage = rawDrainage
  .updateMask(
    connectedPixels.gte(3)
  )
  .selfMask()
  .rename('Drainage')
  .clip(studyGeom);


Map.addLayer(
  filteredDrainage,
  {
    palette: [
      '0000FF'
    ]
  },
  'Filtered Drainage Network'
);


// =============================================================
// 9. CLASSIFY DRAINAGE INTO RELATIVE ORDER CLASSES
// =============================================================
//
// 1 = Minor (headwater-scale) channel
// 2 = Moderate channel
// 3 = Major channel
// 4 = Trunk / dominant channel
// =============================================================

var drainageOrderClass = ee.Image(1)
  .where(
    logAccumulation.gte(p95),
    2
  )
  .where(
    logAccumulation.gte(p98),
    3
  )
  .where(
    logAccumulation.gte(p99),
    4
  )
  .updateMask(
    filteredDrainage
  )
  .rename('Drainage_Order_Class')
  .clip(studyGeom);


Map.addLayer(
  drainageOrderClass,
  {
    min: 1,
    max: 4,
    palette: [
      '9ECAE1',
      '4292C6',
      '08519C',
      '08306B'
    ]
  },
  'Drainage Order Classes'
);


// =============================================================
// 10. CALCULATE DRAINAGE DENSITY
// =============================================================
//
// A 500 m radius circular neighbourhood is used, matching the
// lineament density workflow for this study area.
//
// This is a RELATIVE drainage-density indicator (proportion of
// the neighbourhood occupied by detected channel pixels). It
// should not be reported as km/km² unless actual channel
// lengths have been extracted.
// =============================================================

var drainageBinary = filteredDrainage
  .unmask(0)
  .rename('Drainage');


var radius = 500;


var densityKernel = ee.Kernel.circle({
  radius: radius,
  units: 'meters',
  normalize: false
});


var drainagePixelCountLocal = drainageBinary
  .reduceNeighborhood({
    reducer: ee.Reducer.sum(),
    kernel: densityKernel
  });


var pixelArea = 30 * 30;

var neighbourhoodArea =
  Math.PI * radius * radius;


var drainageDensity = drainagePixelCountLocal
  .multiply(pixelArea)
  .divide(neighbourhoodArea)
  .rename('Drainage_Density')
  .clip(studyGeom);


var drainageDensityPercent = drainageDensity
  .multiply(100)
  .rename('Drainage_Density_Percent')
  .clip(studyGeom);


Map.addLayer(
  drainageDensityPercent,
  {
    min: 0,
    max: 5,
    palette: [
      'FFFFFF',
      'C6DBEF',
      '6BAED6',
      '2171B5',
      '08306B'
    ]
  },
  'Drainage Density (%)'
);


// =============================================================
// 11. VECTORIZE THE DRAINAGE NETWORK
// =============================================================
//
// reduceToVectors produces one-pixel-wide polygon corridors
// following the raster network, not true centerline lines.
// For cartographic-quality centerline vectors, export the
// filtered raster (Section 13) and run line-thinning /
// "raster to polyline" in GIS software (e.g. QGIS or
// WhiteboxTools).
// =============================================================

var drainageVectors = filteredDrainage
  .toByte()
  .reduceToVectors({
    geometry: studyGeom,
    scale: 30,
    geometryType: 'polygon',
    eightConnected: true,
    labelProperty: 'Drainage',
    maxPixels: 1e13
  });


print(
  'Drainage Vector Feature Count:',
  drainageVectors.size()
);


// =============================================================
// 12. CALCULATE DRAINAGE STATISTICS
// =============================================================

print('==========================================');
print('DRAINAGE STATISTICS');
print('==========================================');


var totalDrainagePixels = filteredDrainage
  .reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


print(
  'Total detected drainage pixels:',
  totalDrainagePixels.get('Drainage')
);


var drainageAreaImage = filteredDrainage
  .multiply(
    ee.Image.pixelArea()
  )
  .rename('Drainage_Area');


var drainageArea = drainageAreaImage
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyGeom,
    scale: 30,
    maxPixels: 1e13
  });


var drainageAreaM2 = ee.Number(
  drainageArea.get('Drainage_Area')
);

var drainageAreaKm2 = drainageAreaM2
  .divide(1000000);


print(
  'Detected drainage pixel area (km²):',
  drainageAreaKm2
);


var studyAreaAreaKm2 = studyGeom
  .area({
    maxError: 10
  })
  .divide(1000000);


print(
  'Study area area (km²):',
  studyAreaAreaKm2
);


var drainageCoverage = drainageAreaKm2
  .divide(studyAreaAreaKm2)
  .multiply(100);


print(
  'Overall drainage pixel coverage (%):',
  drainageCoverage
);


var densityStatistics = drainageDensityPercent
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
  'Mean drainage density (%):',
  densityStatistics.get(
    'Drainage_Density_Percent_mean'
  )
);

print(
  'Maximum drainage density (%):',
  densityStatistics.get(
    'Drainage_Density_Percent_max'
  )
);


// =============================================================
// 13. EXPORT ALL OUTPUTS
// =============================================================

Export.image.toDrive({
  image: logAccumulation.toFloat(),
  description: 'Eyinta_Flow_Accumulation_Log',
  folder: 'Eyinta_Mineral_Exploration',
  fileNamePrefix: 'Eyinta_Flow_Accumulation_Log',
  region: studyGeom,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


Export.image.toDrive({
  image: flowDirection.toShort(),
  description: 'Eyinta_Flow_Direction',
  folder: 'Eyinta_Mineral_Exploration',
  fileNamePrefix: 'Eyinta_Flow_Direction',
  region: studyGeom,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


Export.image.toDrive({
  image: filteredDrainage.toByte().rename('Drainage'),
  description: 'Eyinta_Drainage_Network_Binary',
  folder: 'Eyinta_Mineral_Exploration',
  fileNamePrefix: 'Eyinta_Drainage_Network_Binary',
  region: studyGeom,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


Export.image.toDrive({
  image: drainageOrderClass.toByte(),
  description: 'Eyinta_Drainage_Order_Classes',
  folder: 'Eyinta_Mineral_Exploration',
  fileNamePrefix: 'Eyinta_Drainage_Order_Classes',
  region: studyGeom,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


Export.image.toDrive({
  image: drainageDensityPercent.toFloat(),
  description: 'Eyinta_Drainage_Density_Percent',
  folder: 'Eyinta_Mineral_Exploration',
  fileNamePrefix: 'Eyinta_Drainage_Density_Percent',
  region: studyGeom,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


Export.table.toDrive({
  collection: drainageVectors,
  description: 'Eyinta_Drainage_Network_Vector',
  folder: 'Eyinta_Mineral_Exploration',
  fileNamePrefix: 'Eyinta_Drainage_Network_Vector',
  fileFormat: 'SHP'
});


// =============================================================
// 14. FINAL CONSOLE SUMMARY
// =============================================================

print('==========================================');
print('EYINTA DRAINAGE EXTRACTION COMPLETE');
print('==========================================');

print('Study Area (km²):', studyAreaAreaKm2);
print('Drainage Pixel Area (km²):', drainageAreaKm2);
print('Drainage Pixel Coverage (%):', drainageCoverage);

print(
  'Mean Density (%):',
  densityStatistics.get('Drainage_Density_Percent_mean')
);

print(
  'Maximum Density (%):',
  densityStatistics.get('Drainage_Density_Percent_max')
);

print('==========================================');
print('Export folder:', 'Eyinta_Mineral_Exploration');
print('==========================================');
