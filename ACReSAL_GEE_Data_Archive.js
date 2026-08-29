// ============================================================================
// ACReSAL NATIONAL GEOSPATIAL DECISION SUPPORT SYSTEM
// GEE DATA ACQUISITION / DOWNLOAD SCRIPT
// ============================================================================
// Purpose:
// Download/archive all major datasets used in ACReSAL Phase 4C.
//
// Analysis scale : 100 m
// Master CRS     : EPSG:32632
// Study area     : 20 ACReSAL strategic catchments
//
// External GEE datasets:
// 1. SRTM DEM
// 2. SRTM-derived slope
// 3. MERIT Hydro UPA
// 4. MERIT Hydro HAND
// 5. MERIT Hydro river width
// 6. MERIT Hydro permanent water
// 7. CHIRPS annual rainfall 2025
// 8. Sentinel-2 2025 composite
// 9. NDVI 2025
// 10. NDWI 2025
// 11. GHSL population 2025
// 12. GHSL built surface 2025
//
// ACReSAL assets:
// 13. Catchments
// 14. Soil
// 15. Geology
// 16. Groundwater
// 17. Protected areas
// 18. Roads
// 19. LULC 2025
// 20. Phase 4B.5 investment gaps
//
// ============================================================================


// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var VERSION = 'ACReSAL_GEE_Data_Archive_v1';

var ANALYSIS_SCALE = 100;

var MASTER_CRS = 'EPSG:32632';

var OUTPUT_FOLDER = 'ACRESAL_DATA_ARCHIVE';


// ============================================================================
// 2. ACReSAL ASSETS
// ============================================================================

var CATCHMENT_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_Project_Catchments';

var SOIL_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_Soil_Data';

var GEOLOGY_ASSET =
  'projects/ee-samuelaojih/assets/ACERSAL_Geological_Data';

var GROUNDWATER_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_GROUNDWATER';

var PROTECTED_AREA_ASSET =
  'projects/ee-samuelaojih/assets/Protected_Area';

var ROADS_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_ROADS';

var LULC_ASSET =
  'projects/ee-samuelcool28/assets/LULC_2025';

var GAP_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4B5_Intervention_Gaps_v7';


// ============================================================================
// 3. LOAD ACReSAL DATA
// ============================================================================

var CATCHMENTS =
  ee.FeatureCollection(
    CATCHMENT_ASSET
  );

var SOIL =
  ee.FeatureCollection(
    SOIL_ASSET
  );

var GEOLOGY =
  ee.FeatureCollection(
    GEOLOGY_ASSET
  );

var GROUNDWATER =
  ee.FeatureCollection(
    GROUNDWATER_ASSET
  );

var PROTECTED_AREAS =
  ee.FeatureCollection(
    PROTECTED_AREA_ASSET
  );

var ROADS =
  ee.FeatureCollection(
    ROADS_ASSET
  );

var LULC =
  ee.Image(
    LULC_ASSET
  );

var GAP =
  ee.FeatureCollection(
    GAP_ASSET
  );


// ============================================================================
// 4. STUDY AREA
// ============================================================================

var STUDY_AREA =
  CATCHMENTS
    .geometry()
    .simplify({
      maxError: ANALYSIS_SCALE
    });


// ============================================================================
// 5. HEADER
// ============================================================================

print('============================================================');
print('ACReSAL GEE DATA ARCHIVE');
print('============================================================');

print('Version:', VERSION);
print('Catchments:', CATCHMENTS.size());
print('Analysis scale:', ANALYSIS_SCALE + ' m');
print('Master CRS:', MASTER_CRS);
print('Output folder:', OUTPUT_FOLDER);


// ============================================================================
// 6. STUDY AREA
// ============================================================================

Map.centerObject(
  CATCHMENTS,
  6
);

Map.addLayer(
  CATCHMENTS.style({
    color: '000000',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'ACReSAL Catchments'
);


// ============================================================================
// 7. SRTM DEM
// ============================================================================

var DEM =
  ee.Image(
    'USGS/SRTMGL1_003'
  )
  .select(
    'elevation'
  )
  .clip(
    STUDY_AREA
  )
  .rename(
    'Elevation_m'
  );


// ============================================================================
// 8. SLOPE
// ============================================================================

var SLOPE =
  ee.Terrain
    .slope(
      DEM
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'Slope_degree'
    );


// ============================================================================
// 9. MERIT HYDRO
// ============================================================================

var MERIT =
  ee.Image(
    'MERIT/Hydro/v1_0_1'
  );

var UPA =
  MERIT
    .select(
      'upa'
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'UPA'
    );

var HAND =
  MERIT
    .select(
      'hnd'
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'HAND'
    );

var RIVER_WIDTH =
  MERIT
    .select(
      'wth'
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'River_Width'
    );

var PERMANENT_WATER =
  MERIT
    .select(
      'wat'
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'Permanent_Water'
    );


// ============================================================================
// 10. CHIRPS ANNUAL RAINFALL 2025
// ============================================================================

var CHIRPS =
  ee.ImageCollection(
    'UCSB-CHG/CHIRPS/DAILY'
  )
  .filterDate(
    '2025-01-01',
    '2026-01-01'
  )
  .filterBounds(
    STUDY_AREA
  )
  .select(
    'precipitation'
  );

print(
  'CHIRPS 2025 image count:',
  CHIRPS.size()
);

var ANNUAL_RAINFALL =
  CHIRPS
    .sum()
    .clip(
      STUDY_AREA
    )
    .rename(
      'Annual_Rainfall_2025_mm'
    );


// ============================================================================
// 11. SENTINEL-2 2025
// ============================================================================

var S2 =
  ee.ImageCollection(
    'COPERNICUS/S2_SR_HARMONIZED'
  )
  .filterBounds(
    STUDY_AREA
  )
  .filterDate(
    '2025-01-01',
    '2026-01-01'
  )
  .filter(
    ee.Filter.lte(
      'CLOUDY_PIXEL_PERCENTAGE',
      30
    )
  )
  .select([
    'B3',
    'B4',
    'B8',
    'QA60'
  ]);

print(
  'Sentinel-2 image count:',
  S2.size()
);


// ============================================================================
// 12. SENTINEL-2 CLOUD MASK
// ============================================================================

function maskS2(
  image
) {

  var QA =
    image.select(
      'QA60'
    );

  var cloud =
    QA
      .bitwiseAnd(
        1 << 10
      )
      .eq(
        0
      );

  var cirrus =
    QA
      .bitwiseAnd(
        1 << 11
      )
      .eq(
        0
      );

  return image
    .updateMask(
      cloud.and(
        cirrus
      )
    )
    .select([
      'B3',
      'B4',
      'B8'
    ])
    .divide(
      10000
    );
}


// ============================================================================
// 13. SENTINEL-2 MEDIAN COMPOSITE
// ============================================================================

var S2_MEDIAN =
  S2
    .map(
      maskS2
    )
    .median()
    .clip(
      STUDY_AREA
    );


// ============================================================================
// 14. NDVI
// ============================================================================

var NDVI =
  S2_MEDIAN
    .normalizedDifference([
      'B8',
      'B4'
    ])
    .rename(
      'NDVI_2025'
    );


// ============================================================================
// 15. NDWI
// ============================================================================

var NDWI =
  S2_MEDIAN
    .normalizedDifference([
      'B3',
      'B8'
    ])
    .rename(
      'NDWI_2025'
    );


// ============================================================================
// 16. SENTINEL-2 COMPOSITE WITH INDICES
// ============================================================================

var S2_ARCHIVE =
  S2_MEDIAN
    .addBands(
      NDVI
    )
    .addBands(
      NDWI
    )
    .toFloat();


// ============================================================================
// 17. GHSL POPULATION
// ============================================================================
//
// IMPORTANT:
// GHSL products can have different temporal metadata structures.
// We therefore retrieve the available 2025 image after filtering.
//
// ============================================================================

var GHSL_POP_COLLECTION =
  ee.ImageCollection(
    'JRC/GHSL/P2023A/GHS_POP'
  )
  .filterBounds(
    STUDY_AREA
  );

print(
  'GHSL population collection:',
  GHSL_POP_COLLECTION
);

var POPULATION =
  GHSL_POP_COLLECTION
    .filterDate(
      '2025-01-01',
      '2026-01-01'
    )
    .first();

print(
  'GHSL population 2025 image:',
  POPULATION
);


// ---------------------------------------------------------------------------
// Safety check
// ---------------------------------------------------------------------------

var POPULATION_SAFE =
  ee.Image(
    POPULATION
  )
  .select(
    'population_count'
  )
  .clip(
    STUDY_AREA
  )
  .rename(
    'Population_2025'
  );


// ============================================================================
// 18. GHSL BUILT SURFACE
// ============================================================================

var GHSL_BUILT_COLLECTION =
  ee.ImageCollection(
    'JRC/GHSL/P2023A/GHS_BUILT_S'
  )
  .filterBounds(
    STUDY_AREA
  );

print(
  'GHSL built-surface collection:',
  GHSL_BUILT_COLLECTION
);

var BUILT =
  GHSL_BUILT_COLLECTION
    .filterDate(
      '2025-01-01',
      '2026-01-01'
    )
    .first();

print(
  'GHSL built surface 2025 image:',
  BUILT
);


var BUILT_SAFE =
  ee.Image(
    BUILT
  )
  .select(
    'built_surface'
  )
  .clip(
    STUDY_AREA
  )
  .rename(
    'Built_Surface_2025'
  );


// ============================================================================
// 19. DISPLAY CHECK
// ============================================================================

Map.addLayer(
  DEM,
  {
    min: 0,
    max: 1500
  },
  'SRTM DEM',
  false
);

Map.addLayer(
  SLOPE,
  {
    min: 0,
    max: 30
  },
  'Slope',
  false
);

Map.addLayer(
  NDVI,
  {
    min: -1,
    max: 1,
    palette: [
      '8B0000',
      'FFFF00',
      '006400'
    ]
  },
  'NDVI 2025',
  false
);

Map.addLayer(
  NDWI,
  {
    min: -1,
    max: 1,
    palette: [
      '8B0000',
      'FFFF00',
      '0000FF'
    ]
  },
  'NDWI 2025',
  false
);

Map.addLayer(
  ANNUAL_RAINFALL,
  {
    min: 500,
    max: 2000
  },
  'Annual Rainfall 2025',
  false
);

Map.addLayer(
  HAND,
  {
    min: 0,
    max: 50
  },
  'HAND',
  false
);


// ============================================================================
// 20. EXPORT FUNCTION
// ============================================================================

function exportRaster(
  image,
  name
) {

  Export.image.toDrive({

    image:
      image.toFloat(),

    description:
      name,

    folder:
      OUTPUT_FOLDER,

    fileNamePrefix:
      name,

    region:
      STUDY_AREA,

    crs:
      MASTER_CRS,

    scale:
      ANALYSIS_SCALE,

    maxPixels:
      1e13,

    fileFormat:
      'GeoTIFF'

  });

}


// ============================================================================
// 21. EXPORT GEE RASTER DATA
// ============================================================================

exportRaster(
  DEM,
  'ACRESAL_SRTM_DEM_100m_UTM32N'
);

exportRaster(
  SLOPE,
  'ACRESAL_Slope_100m_UTM32N'
);

exportRaster(
  UPA,
  'ACRESAL_MERIT_UPA_100m_UTM32N'
);

exportRaster(
  HAND,
  'ACRESAL_MERIT_HAND_100m_UTM32N'
);

exportRaster(
  RIVER_WIDTH,
  'ACRESAL_MERIT_RiverWidth_100m_UTM32N'
);

exportRaster(
  PERMANENT_WATER,
  'ACRESAL_MERIT_PermanentWater_100m_UTM32N'
);

exportRaster(
  ANNUAL_RAINFALL,
  'ACRESAL_CHIRPS_AnnualRainfall_2025_100m_UTM32N'
);

exportRaster(
  S2_ARCHIVE,
  'ACRESAL_Sentinel2_2025_NDVI_NDWI_100m_UTM32N'
);

exportRaster(
  NDVI,
  'ACRESAL_NDVI_2025_100m_UTM32N'
);

exportRaster(
  NDWI,
  'ACRESAL_NDWI_2025_100m_UTM32N'
);

exportRaster(
  POPULATION_SAFE,
  'ACRESAL_GHSL_Population_2025_100m_UTM32N'
);

exportRaster(
  BUILT_SAFE,
  'ACRESAL_GHSL_BuiltSurface_2025_100m_UTM32N'
);

exportRaster(
  LULC,
  'ACRESAL_LULC_2025_100m_UTM32N'
);


// ============================================================================
// 22. RASTERIZE ACReSAL ROAD NETWORK
// ============================================================================

var ROAD_REFERENCE =
  ee.Image(
    0
  )
  .toByte();

var ROAD_RASTER =
  ROAD_REFERENCE
    .paint(
      ROADS,
      1
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'ACReSAL_Roads'
    );


// ============================================================================
// 23. ROAD DISTANCE
// ============================================================================

var ROAD_DISTANCE =
  ROAD_RASTER
    .fastDistanceTransform(
      256,
      'pixels',
      'squared_euclidean'
    )
    .sqrt()
    .multiply(
      ANALYSIS_SCALE
    )
    .rename(
      'Road_Distance_m'
    );


// ============================================================================
// 24. ROAD ACCESSIBILITY
// ============================================================================

var ROAD_ACCESS =
  ee.Image(
    1
  )
  .subtract(

    ROAD_DISTANCE
      .divide(
        10000
      )
      .clamp(
        0,
        1
      )

  )
  .clamp(
    0,
    1
  )
  .rename(
    'Road_Accessibility'
  );


exportRaster(
  ROAD_RASTER,
  'ACRESAL_Road_Raster_100m_UTM32N'
);

exportRaster(
  ROAD_DISTANCE,
  'ACRESAL_Road_Distance_100m_UTM32N'
);

exportRaster(
  ROAD_ACCESS,
  'ACRESAL_Road_Accessibility_100m_UTM32N'
);


// ============================================================================
// 25. PROTECTED AREA RASTER
// ============================================================================

var PROTECTED_REFERENCE =
  ee.Image(
    0
  )
  .toByte();

var PROTECTED_MASK =
  PROTECTED_REFERENCE
    .paint(
      PROTECTED_AREAS,
      1
    )
    .clip(
      STUDY_AREA
    )
    .rename(
      'Protected_Area'
    );


exportRaster(
  PROTECTED_MASK,
  'ACRESAL_Protected_Areas_100m_UTM32N'
);


// ============================================================================
// 26. SOIL DATA RASTERIZATION
// ============================================================================

var SOIL_SAND =
  SOIL
    .reduceToImage({
      properties: ['SAND'],
      reducer: ee.Reducer.mean()
    })
    .clip(
      STUDY_AREA
    )
    .rename(
      'Sand'
    );

var SOIL_SILT =
  SOIL
    .reduceToImage({
      properties: ['SILT'],
      reducer: ee.Reducer.mean()
    })
    .clip(
      STUDY_AREA
    )
    .rename(
      'Silt'
    );

var SOIL_CLAY =
  SOIL
    .reduceToImage({
      properties: ['CLAY'],
      reducer: ee.Reducer.mean()
    })
    .clip(
      STUDY_AREA
    )
    .rename(
      'Clay'
    );

var SOIL_SOC =
  SOIL
    .reduceToImage({
      properties: ['ORG_CARBON'],
      reducer: ee.Reducer.mean()
    })
    .clip(
      STUDY_AREA
    )
    .rename(
      'SOC'
    );

var SOIL_AWC =
  SOIL
    .reduceToImage({
      properties: ['AWC'],
      reducer: ee.Reducer.mean()
    })
    .clip(
      STUDY_AREA
    )
    .rename(
      'AWC'
    );

var SOIL_PH =
  SOIL
    .reduceToImage({
      properties: ['PH_WATER'],
      reducer: ee.Reducer.mean()
    })
    .clip(
      STUDY_AREA
    )
    .rename(
      'Soil_pH'
    );


// ============================================================================
// 27. EXPORT SOIL VARIABLES
// ============================================================================

exportRaster(
  SOIL_SAND,
  'ACRESAL_Soil_Sand_100m_UTM32N'
);

exportRaster(
  SOIL_SILT,
  'ACRESAL_Soil_Silt_100m_UTM32N'
);

exportRaster(
  SOIL_CLAY,
  'ACRESAL_Soil_Clay_100m_UTM32N'
);

exportRaster(
  SOIL_SOC,
  'ACRESAL_Soil_SOC_100m_UTM32N'
);

exportRaster(
  SOIL_AWC,
  'ACRESAL_Soil_AWC_100m_UTM32N'
);

exportRaster(
  SOIL_PH,
  'ACRESAL_Soil_pH_100m_UTM32N'
);


// ============================================================================
// 28. VECTOR EXPORT FUNCTION
// ============================================================================

function exportVector(
  collection,
  name
) {

  Export.table.toDrive({

    collection:
      collection,

    description:
      name,

    folder:
      OUTPUT_FOLDER,

    fileNamePrefix:
      name,

    fileFormat:
      'SHP'

  });

}


// ============================================================================
// 29. EXPORT ACReSAL VECTOR DATA
// ============================================================================

exportVector(
  CATCHMENTS,
  'ACRESAL_Project_Catchments'
);

exportVector(
  SOIL,
  'ACRESAL_Soil_Data'
);

exportVector(
  GEOLOGY,
  'ACRESAL_Geological_Data'
);

exportVector(
  GROUNDWATER,
  'ACRESAL_Groundwater'
);

exportVector(
  PROTECTED_AREAS,
  'ACRESAL_Protected_Areas'
);

exportVector(
  ROADS,
  'ACRESAL_Roads'
);

exportVector(
  GAP,
  'ACRESAL_Phase4B5_Investment_Gaps'
);


// ============================================================================
// 30. DATASET INVENTORY
// ============================================================================

print('============================================================');
print('DATASET INVENTORY');
print('============================================================');

print('1. SRTM DEM');
print('2. Slope');
print('3. MERIT UPA');
print('4. MERIT HAND');
print('5. MERIT River Width');
print('6. MERIT Permanent Water');
print('7. CHIRPS Annual Rainfall 2025');
print('8. Sentinel-2 2025 Composite');
print('9. NDVI 2025');
print('10. NDWI 2025');
print('11. GHSL Population 2025');
print('12. GHSL Built Surface 2025');
print('13. ACReSAL LULC 2025');
print('14. ACReSAL Soil');
print('15. ACReSAL Roads');
print('16. ACReSAL Protected Areas');
print('17. ACReSAL Catchments');
print('18. ACReSAL Geological Data');
print('19. ACReSAL Groundwater');
print('20. Phase 4B.5 Investment Gaps');


// ============================================================================
// 31. FINAL STATUS
// ============================================================================

print('============================================================');
print('ACReSAL DATA ARCHIVE SCRIPT COMPLETE');
print('============================================================');

print(
  'Raster export scale:',
  ANALYSIS_SCALE + ' m'
);

print(
  'Export CRS:',
  MASTER_CRS
);

print(
  'Output folder:',
  OUTPUT_FOLDER
);

print(
  'Raster datasets:',
  'Created as GeoTIFF export tasks'
);

print(
  'Vector datasets:',
  'Created as Shapefile export tasks'
);

print(
  'NEXT:',
  'Open the Tasks tab and run the required exports.'
);

print('============================================================');
