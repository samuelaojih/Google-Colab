// ============================================================================
// ACReSAL NATIONAL GEOSPATIAL DECISION SUPPORT SYSTEM
// ============================================================================
// PHASE 4C v3
// PIXEL-LEVEL SUITABILITY + HARD CONSTRAINTS + INVESTMENT OPPORTUNITY
//
// CORRECTIONS FROM v2
// -------------------
// 1. Removed external malaria-atlas friction surface.
// 2. Accessibility derived entirely from ACRESAL_ROADS.
// 3. Removed unnecessary intermediate reproject() calls.
// 4. Standardized final analysis/export CRS to EPSG:32632.
// 5. Added explicit null-safe raster handling.
// 6. Kept 100 m as the common analysis scale.
//
// ============================================================================


// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var VERSION =
  'ACReSAL_Phase_4C_v3';

var ANALYSIS_SCALE =
  100;

var MASTER_CRS =
  'EPSG:32632';

var OUTPUT_FOLDER =
  'ACRESAL_DSS';


// ============================================================================
// 2. ASSETS
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
// 3. OUTPUT
// ============================================================================

var OUTPUT_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4C_Pixel_Opportunity_v3';


// ============================================================================
// 4. LOAD DATA
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

var GAP =
  ee.FeatureCollection(
    GAP_ASSET
  );

var LULC =
  ee.Image(
    LULC_ASSET
  );


// ============================================================================
// 5. STUDY AREA
// ============================================================================

var STUDY_AREA =
  CATCHMENTS.geometry();


// ============================================================================
// 6. HEADER
// ============================================================================

print('============================================================');
print('ACReSAL PHASE 4C v3');
print('PIXEL-LEVEL SUITABILITY + HARD CONSTRAINTS');
print('============================================================');

print(
  'Version:',
  VERSION
);

print(
  'Strategic catchments:',
  CATCHMENTS.size()
);

print(
  'Gap records:',
  GAP.size()
);

print(
  'Road records:',
  ROADS.size()
);

print(
  'Analysis scale:',
  ANALYSIS_SCALE + ' m'
);

print(
  'CRS:',
  MASTER_CRS
);

print(
  'LULC:',
  LULC_ASSET
);

print(
  'Gap:',
  GAP_ASSET
);


// ============================================================================
// 7. AHP WEIGHTS
// ============================================================================
// These preserve the eight-criterion structure used in Phase 4B v5.
//
// Current values are the equal-weight implementation used previously:
// 8 × 0.125 = 1.0.
//
// Replace with the actual validated Phase 3B vectors before the final
// production analysis if those vectors differ.
// ============================================================================


var W_IRRIGATION = {

  drainage:
    0.125,

  slope:
    0.125,

  rainfall:
    0.125,

  soil:
    0.125,

  productivity:
    0.125,

  access:
    0.125,

  population:
    0.125,

  existingGap:
    0.125

};


var W_WETLAND = {

  drainage:
    0.125,

  wetness:
    0.125,

  permanentWater:
    0.125,

  HAND:
    0.125,

  NDWI:
    0.125,

  rainfall:
    0.125,

  ecologicalCondition:
    0.125,

  wetlandSignal:
    0.125

};


var W_EROSION = {

  slope:
    0.125,

  kFactor:
    0.125,

  rainfall:
    0.125,

  drainageDensity:
    0.125,

  NDVI:
    0.125,

  ecologicalPressure:
    0.125,

  settlement:
    0.125,

  existingGap:
    0.125

};


var W_REFORESTATION = {

  NDVI:
    0.125,

  naturalVegetationDeficit:
    0.125,

  ecologicalRestoration:
    0.125,

  ecologicalPressure:
    0.125,

  SOC:
    0.125,

  rainfall:
    0.125,

  slope:
    0.125,

  access:
    0.125

};


var W_FLOOD = {

  HAND:
    0.125,

  drainage:
    0.125,

  UPA:
    0.125,

  TWI:
    0.125,

  rainfall:
    0.125,

  population:
    0.125,

  settlement:
    0.125,

  builtup:
    0.125

};


var W_AGRICULTURE = {

  productivity:
    0.125,

  NDVI:
    0.125,

  rainfall:
    0.125,

  soilPH:
    0.125,

  SOC:
    0.125,

  AWC:
    0.125,

  agricultureVegetation:
    0.125,

  access:
    0.125

};


// ============================================================================
// 8. AHP VALIDATION
// ============================================================================

print('============================================================');
print('AHP WEIGHT VALIDATION');
print('============================================================');

print(
  'Irrigation:',
  W_IRRIGATION.drainage +
  W_IRRIGATION.slope +
  W_IRRIGATION.rainfall +
  W_IRRIGATION.soil +
  W_IRRIGATION.productivity +
  W_IRRIGATION.access +
  W_IRRIGATION.population +
  W_IRRIGATION.existingGap
);

print(
  'Wetland:',
  W_WETLAND.drainage +
  W_WETLAND.wetness +
  W_WETLAND.permanentWater +
  W_WETLAND.HAND +
  W_WETLAND.NDWI +
  W_WETLAND.rainfall +
  W_WETLAND.ecologicalCondition +
  W_WETLAND.wetlandSignal
);

print(
  'Erosion:',
  W_EROSION.slope +
  W_EROSION.kFactor +
  W_EROSION.rainfall +
  W_EROSION.drainageDensity +
  W_EROSION.NDVI +
  W_EROSION.ecologicalPressure +
  W_EROSION.settlement +
  W_EROSION.existingGap
);

print(
  'Reforestation:',
  W_REFORESTATION.NDVI +
  W_REFORESTATION.naturalVegetationDeficit +
  W_REFORESTATION.ecologicalRestoration +
  W_REFORESTATION.ecologicalPressure +
  W_REFORESTATION.SOC +
  W_REFORESTATION.rainfall +
  W_REFORESTATION.slope +
  W_REFORESTATION.access
);

print(
  'Flood:',
  W_FLOOD.HAND +
  W_FLOOD.drainage +
  W_FLOOD.UPA +
  W_FLOOD.TWI +
  W_FLOOD.rainfall +
  W_FLOOD.population +
  W_FLOOD.settlement +
  W_FLOOD.builtup
);

print(
  'Agriculture:',
  W_AGRICULTURE.productivity +
  W_AGRICULTURE.NDVI +
  W_AGRICULTURE.rainfall +
  W_AGRICULTURE.soilPH +
  W_AGRICULTURE.SOC +
  W_AGRICULTURE.AWC +
  W_AGRICULTURE.agricultureVegetation +
  W_AGRICULTURE.access
);


// ============================================================================
// 9. HELPER FUNCTIONS
// ============================================================================

function clamp01(
  image
) {

  return ee.Image(
    image
  )
  .max(
    0
  )
  .min(
    1
  );

}


// ----------------------------------------------------------------------------
// Robust percentile normalization
// ----------------------------------------------------------------------------

function percentileNormalize(
  image,
  geometry,
  scale
) {

  var bandName =
    image
      .bandNames()
      .get(
        0
      );


  var stats =
    image.reduceRegion({

      reducer:
        ee.Reducer.percentile([
          2,
          98
        ]),

      geometry:
        geometry,

      scale:
        scale,

      bestEffort:
        true,

      maxPixels:
        1e8

    });


  var low =
    ee.Number(
      stats.get(
        ee.String(
          bandName
        )
        .cat(
          '_p2'
        )
      )
    );


  var high =
    ee.Number(
      stats.get(
        ee.String(
          bandName
        )
        .cat(
          '_p98'
        )
      )
    );


  return image
    .subtract(
      low
    )
    .divide(

      high
        .subtract(
          low
        )
        .max(
          0.000001
        )

    )
    .clamp(
      0,
      1
    );

}


// ============================================================================
// 10. TERRAIN
// ============================================================================

var ELEVATION =
  ee.Image(
    'USGS/SRTMGL1_003'
  )
  .select(
    'elevation'
  )
  .clip(
    STUDY_AREA
  );


var SLOPE =
  ee.Terrain
    .slope(
      ELEVATION
    )
    .rename(
      'Slope'
    );


var SLOPE_SUITABILITY =
  ee.Image(
    1
  )
  .subtract(

    SLOPE
      .divide(
        30
      )
      .clamp(
        0,
        1
      )

  )
  .clamp(
    0,
    1
  );


var SLOPE_RISK =
  ee.Image(
    1
  )
  .subtract(
    SLOPE_SUITABILITY
  );


// ============================================================================
// 11. MERIT HYDROLOGY
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
    );


var HAND =
  MERIT
    .select(
      'hnd'
    )
    .clip(
      STUDY_AREA
    );


var RIVER_WIDTH =
  MERIT
    .select(
      'wth'
    )
    .clip(
      STUDY_AREA
    );


var PERMANENT_WATER =
  MERIT
    .select(
      'wat'
    )
    .clip(
      STUDY_AREA
    );


// ============================================================================
// 12. DRAINAGE NETWORK
// ============================================================================

var PRIMARY_DRAINAGE =
  UPA
    .gte(
      1
    )
    .unmask(
      0
    )
    .toByte();


var DRAINAGE_DISTANCE =
  PRIMARY_DRAINAGE
    .fastDistanceTransform(
      256,
      'pixels',
      'squared_euclidean'
    )
    .sqrt()
    .multiply(
      92.77
    )
    .rename(
      'Distance_Drainage_m'
    );


var DRAINAGE_PROXIMITY =
  ee.Image(
    1
  )
  .subtract(

    DRAINAGE_DISTANCE
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
  );


var DRAINAGE_DENSITY =
  PRIMARY_DRAINAGE
    .focalMean({

      radius:
        500,

      units:
        'meters',

      kernelType:
        'circle'

    })
    .rename(
      'Drainage_Density'
    );


var DRAINAGE_DENSITY_NORMALIZED =
  DRAINAGE_DENSITY
    .clamp(
      0,
      1
    );


// ============================================================================
// 13. TWI
// ============================================================================

var SLOPE_RADIANS =
  SLOPE
    .multiply(
      Math.PI / 180
    );


var SAFE_SLOPE =
  SLOPE_RADIANS
    .max(
      0.001
    );


var SPECIFIC_CATCHMENT_AREA =
  UPA
    .multiply(
      1000000
    )
    .divide(
      92.77
    );


var TWI =
  SPECIFIC_CATCHMENT_AREA
    .divide(
      SAFE_SLOPE.tan()
    )
    .log()
    .rename(
      'TWI'
    );


var TWI_NORMALIZED =
  percentileNormalize(
    TWI,
    STUDY_AREA,
    250
  );


// ============================================================================
// 14. HYDROLOGICAL NORMALIZED VARIABLES
// ============================================================================

var HAND_SUITABILITY =
  ee.Image(
    1
  )
  .subtract(

    HAND
      .divide(
        50
      )
      .clamp(
        0,
        1
      )

  )
  .clamp(
    0,
    1
  );


var UPA_NORMALIZED =
  percentileNormalize(
    UPA,
    STUDY_AREA,
    250
  );


var PERMANENT_WATER_SCORE =
  PERMANENT_WATER
    .clamp(
      0,
      1
    );


// ============================================================================
// 15. CLIMATE
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


var ANNUAL_RAINFALL =
  CHIRPS
    .sum()
    .rename(
      'Annual_Rainfall'
    )
    .clip(
      STUDY_AREA
    );


var RAINFALL_SCORE =
  percentileNormalize(
    ANNUAL_RAINFALL,
    STUDY_AREA,
    5000
  );


// ============================================================================
// 16. SENTINEL-2
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
  ])
  .limit(
    200
  );


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


var S2_MEDIAN =
  S2
    .map(
      maskS2
    )
    .median()
    .clip(
      STUDY_AREA
    );


var NDVI =
  S2_MEDIAN
    .normalizedDifference([
      'B8',
      'B4'
    ])
    .rename(
      'NDVI'
    );


var NDWI =
  S2_MEDIAN
    .normalizedDifference([
      'B3',
      'B8'
    ])
    .rename(
      'NDWI'
    );


var NDVI_CONDITION =
  NDVI
    .add(
      1
    )
    .divide(
      2
    )
    .clamp(
      0,
      1
    );


var NDVI_DEGRADATION =
  ee.Image(
    1
  )
  .subtract(
    NDVI_CONDITION
  );


var NDWI_CONDITION =
  NDWI
    .add(
      1
    )
    .divide(
      2
    )
    .clamp(
      0,
      1
    );


// ============================================================================
// 17. ECOLOGICAL VARIABLES
// ============================================================================

var ECOLOGICAL_CONDITION =
  NDVI_CONDITION
    .add(
      NDWI_CONDITION
    )
    .divide(
      2
    )
    .clamp(
      0,
      1
    );


var ECOLOGICAL_RESTORATION =
  ee.Image(
    1
  )
  .subtract(
    ECOLOGICAL_CONDITION
  );


var ECOLOGICAL_PRESSURE =
  NDVI_DEGRADATION;


var WETLAND_SIGNAL =
  NDWI_CONDITION
    .multiply(
      0.5
    )
    .add(

      LULC.eq(
        4
      )
      .multiply(
        0.5
      )

    )
    .clamp(
      0,
      1
    );


// ============================================================================
// 18. SOIL RASTERIZATION
// ============================================================================

var SOIL_SAND =
  SOIL
    .reduceToImage({

      properties:
        [
          'SAND'
        ],

      reducer:
        ee.Reducer.mean()

    })
    .clip(
      STUDY_AREA
    );


var SOIL_SILT =
  SOIL
    .reduceToImage({

      properties:
        [
          'SILT'
        ],

      reducer:
        ee.Reducer.mean()

    })
    .clip(
      STUDY_AREA
    );


var SOIL_CLAY =
  SOIL
    .reduceToImage({

      properties:
        [
          'CLAY'
        ],

      reducer:
        ee.Reducer.mean()

    })
    .clip(
      STUDY_AREA
    );


var SOIL_SOC =
  SOIL
    .reduceToImage({

      properties:
        [
          'ORG_CARBON'
        ],

      reducer:
        ee.Reducer.mean()

    })
    .clip(
      STUDY_AREA
    );


var SOIL_AWC =
  SOIL
    .reduceToImage({

      properties:
        [
          'AWC'
        ],

      reducer:
        ee.Reducer.mean()

    })
    .clip(
      STUDY_AREA
    );


var SOIL_PH =
  SOIL
    .reduceToImage({

      properties:
        [
          'PH_WATER'
        ],

      reducer:
        ee.Reducer.mean()

    })
    .clip(
      STUDY_AREA
    );


// ============================================================================
// 19. K-FACTOR
// ============================================================================

var SAND_FRACTION =
  SOIL_SAND
    .divide(
      100
    )
    .clamp(
      0,
      1
    );


var SILT_FRACTION =
  SOIL_SILT
    .divide(
      100
    )
    .clamp(
      0,
      1
    );


var CLAY_FRACTION =
  SOIL_CLAY
    .divide(
      100
    )
    .clamp(
      0,
      1
    );


var ORGANIC_C =
  SOIL_SOC
    .max(
      0
    );


var M =
  ee.Image(
    1
  )
  .subtract(
    SAND_FRACTION
  );


var SAND_EXP =
  SAND_FRACTION
    .multiply(
      -25.6
    )
    .exp();


var K_TEXTURE =
  ee.Image(
    0.2
  )
  .add(

    ee.Image(
      0.3
    )
    .multiply(
      SAND_EXP
    )

  );


var SILT_CLAY_RATIO =
  SILT_FRACTION
    .divide(

      SILT_FRACTION
        .add(
          CLAY_FRACTION
        )
        .max(
          0.001
        )

    );


var K_TEXT_TERM =
  K_TEXTURE
    .multiply(
      SILT_CLAY_RATIO.pow(
        0.3
      )
    );


var OC_EXPONENT =
  ee.Image(
    3.72
  )
  .subtract(

    ORGANIC_C
      .multiply(
        2.95
      )

  );


var OC_EXP =
  OC_EXPONENT.exp();


var K_OC_DENOMINATOR =
  ORGANIC_C
    .add(
      OC_EXP
    )
    .max(
      0.001
    );


var K_OC_TERM =
  ee.Image(
    1
  )
  .subtract(

    ee.Image(
      0.25
    )
    .multiply(
      ORGANIC_C
    )
    .divide(
      K_OC_DENOMINATOR
    )

  );


var SAND_EXPONENT =
  ee.Image(
    -5.51
  )
  .add(

    M
      .multiply(
        22.9
      )

  );


var SAND_EXP_TERM =
  SAND_EXPONENT.exp();


var K_SAND_DENOMINATOR =
  M
    .add(
      SAND_EXP_TERM
    )
    .max(
      0.001
    );


var K_SAND_TERM =
  ee.Image(
    1
  )
  .subtract(

    ee.Image(
      0.7
    )
    .multiply(

      M
        .divide(
          K_SAND_DENOMINATOR
        )

    )

  );


var K_FACTOR =
  K_TEXT_TERM
    .multiply(
      K_OC_TERM
    )
    .multiply(
      K_SAND_TERM
    )
    .multiply(
      0.1317
    )
    .rename(
      'K_Factor'
    );


// ============================================================================
// 20. SOIL NORMALIZATION
// ============================================================================

var K_RISK =
  percentileNormalize(
    K_FACTOR,
    STUDY_AREA,
    250
  );


var SOIL_AWC_SCORE =
  percentileNormalize(
    SOIL_AWC,
    STUDY_AREA,
    250
  );


var SOIL_SOC_SCORE =
  percentileNormalize(
    SOIL_SOC,
    STUDY_AREA,
    250
  );


// ============================================================================
// 21. SOIL pH
// ============================================================================

var PH_SUITABILITY =

  SOIL_PH
    .where(
      SOIL_PH.lte(
        5
      ),
      0
    )

    .where(

      SOIL_PH.gt(
        5
      )
      .and(
        SOIL_PH.lt(
          6
        )
      ),

      SOIL_PH
        .subtract(
          5
        )

    )

    .where(

      SOIL_PH.gte(
        6
      )
      .and(
        SOIL_PH.lte(
          7.5
        )
      ),

      1

    )

    .where(

      SOIL_PH.gt(
        7.5
      )
      .and(
        SOIL_PH.lt(
          8.5
        )
      ),

      ee.Image(
        8.5
      )
      .subtract(
        SOIL_PH
      )

    )

    .where(
      SOIL_PH.gte(
        8.5
      ),
      0
    )

    .clamp(
      0,
      1
    );


// ============================================================================
// 22. ROADS-BASED ACCESSIBILITY
// ============================================================================
//
// IMPORTANT:
// The problematic external friction surface has been removed.
//
// Accessibility is derived directly from your ACRESAL road network.
//
// 1. Rasterize roads.
// 2. Calculate distance to nearest road.
// 3. Convert distance to 0–1 accessibility.
//
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
    );


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
  );


// ============================================================================
// 23. POPULATION
// ============================================================================

var POPULATION =
  ee.ImageCollection(
    'JRC/GHSL/P2023A/GHS_POP'
  )
  .filterDate(
    '2025-01-01',
    '2026-01-01'
  )
  .first()
  .select(
    'population_count'
  )
  .clip(
    STUDY_AREA
  );


var POPULATION_SCORE =
  percentileNormalize(
    POPULATION,
    STUDY_AREA,
    1000
  );


// ============================================================================
// 24. BUILT-UP
// ============================================================================

var BUILT =
  ee.ImageCollection(
    'JRC/GHSL/P2023A/GHS_BUILT_S'
  )
  .filterDate(
    '2025-01-01',
    '2026-01-01'
  )
  .first()
  .select(
    'built_surface'
  )
  .clip(
    STUDY_AREA
  );


var BUILTUP_SCORE =
  percentileNormalize(
    BUILT,
    STUDY_AREA,
    1000
  );


// ============================================================================
// 25. LULC
// ============================================================================

var WATER =
  LULC.eq(
    1
  );

var VEGETATION =
  LULC.eq(
    2
  );

var WETLAND =
  LULC.eq(
    4
  );

var AGRICULTURE =
  LULC.eq(
    5
  );

var BUILTUP =
  LULC.eq(
    7
  );

var BARE =
  LULC.eq(
    8
  );

var SHRUB =
  LULC.eq(
    11
  );


// ============================================================================
// 26. VEGETATION DERIVATIVES
// ============================================================================

var NATURAL_VEGETATION =
  VEGETATION
    .multiply(
      1
    )
    .add(
      WETLAND
        .multiply(
          0.8
        )
    )
    .add(
      SHRUB
        .multiply(
          0.5
        )
    )
    .clamp(
      0,
      1
    );


var NATURAL_VEGETATION_DEFICIT =
  ee.Image(
    1
  )
  .subtract(
    NATURAL_VEGETATION
  )
  .clamp(
    0,
    1
  );


var AGRICULTURAL_VEGETATION =
  AGRICULTURE
    .multiply(
      1
    )
    .add(
      VEGETATION
        .multiply(
          0.8
        )
    )
    .add(
      SHRUB
        .multiply(
          0.5
        )
    )
    .clamp(
      0,
      1
    );


// ============================================================================
// 27. PIXEL-LEVEL SUITABILITY
// ============================================================================


// ----------------------------------------------------------------------------
// IRRIGATION
// ----------------------------------------------------------------------------

var IRRIGATION_SUITABILITY =

  DRAINAGE_PROXIMITY
    .multiply(
      W_IRRIGATION.drainage
    )

    .add(

      SLOPE_SUITABILITY
        .multiply(
          W_IRRIGATION.slope
        )

    )

    .add(

      RAINFALL_SCORE
        .multiply(
          W_IRRIGATION.rainfall
        )

    )

    .add(

      SOIL_AWC_SCORE
        .multiply(
          W_IRRIGATION.soil
        )

    )

    .add(

      NDVI_CONDITION
        .multiply(
          W_IRRIGATION.productivity
        )

    )

    .add(

      ROAD_ACCESS
        .multiply(
          W_IRRIGATION.access
        )

    )

    .add(

      POPULATION_SCORE
        .multiply(
          W_IRRIGATION.population
        )

    )

    .clamp(
      0,
      1
    )
    .rename(
      'Irrigation_Suitability'
    );


// ----------------------------------------------------------------------------
// WETLAND RESTORATION
// ----------------------------------------------------------------------------

var WETLAND_SUITABILITY =

  DRAINAGE_PROXIMITY
    .multiply(
      W_WETLAND.drainage
    )

    .add(

      WETLAND_SIGNAL
        .multiply(
          W_WETLAND.wetlandSignal
        )

    )

    .add(

      PERMANENT_WATER_SCORE
        .multiply(
          W_WETLAND.permanentWater
        )

    )

    .add(

      HAND_SUITABILITY
        .multiply(
          W_WETLAND.HAND
        )

    )

    .add(

      NDWI_CONDITION
        .multiply(
          W_WETLAND.NDWI
        )

    )

    .add(

      RAINFALL_SCORE
        .multiply(
          W_WETLAND.rainfall
        )

    )

    .add(

      ECOLOGICAL_CONDITION
        .multiply(
          W_WETLAND.ecologicalCondition
        )

    )

    .add(

      TWI_NORMALIZED
        .multiply(
          W_WETLAND.wetness
        )

    )

    .clamp(
      0,
      1
    )
    .rename(
      'Wetland_Suitability'
    );


// ----------------------------------------------------------------------------
// EROSION CONTROL
// ----------------------------------------------------------------------------

var EROSION_SUITABILITY =

  SLOPE_RISK
    .multiply(
      W_EROSION.slope
    )

    .add(

      K_RISK
        .multiply(
          W_EROSION.kFactor
        )

    )

    .add(

      RAINFALL_SCORE
        .multiply(
          W_EROSION.rainfall
        )

    )

    .add(

      DRAINAGE_DENSITY_NORMALIZED
        .multiply(
          W_EROSION.drainageDensity
        )

    )

    .add(

      NDVI_DEGRADATION
        .multiply(
          W_EROSION.NDVI
        )

    )

    .add(

      ECOLOGICAL_PRESSURE
        .multiply(
          W_EROSION.ecologicalPressure
        )

    )

    .add(

      BUILTUP_SCORE
        .multiply(
          W_EROSION.settlement
        )

    )

    .clamp(
      0,
      1
    )
    .rename(
      'Erosion_Suitability'
    );


// ----------------------------------------------------------------------------
// REFORESTATION
// ----------------------------------------------------------------------------

var REFORESTATION_SUITABILITY =

  NDVI_DEGRADATION
    .multiply(
      W_REFORESTATION.NDVI
    )

    .add(

      NATURAL_VEGETATION_DEFICIT
        .multiply(
          W_REFORESTATION.naturalVegetationDeficit
        )

    )

    .add(

      ECOLOGICAL_RESTORATION
        .multiply(
          W_REFORESTATION.ecologicalRestoration
        )

    )

    .add(

      ECOLOGICAL_PRESSURE
        .multiply(
          W_REFORESTATION.ecologicalPressure
        )

    )

    .add(

      SOIL_SOC_SCORE
        .multiply(
          W_REFORESTATION.SOC
        )

    )

    .add(

      RAINFALL_SCORE
        .multiply(
          W_REFORESTATION.rainfall
        )

    )

    .add(

      SLOPE_SUITABILITY
        .multiply(
          W_REFORESTATION.slope
        )

    )

    .add(

      ROAD_ACCESS
        .multiply(
          W_REFORESTATION.access
        )

    )

    .clamp(
      0,
      1
    )
    .rename(
      'Reforestation_Suitability'
    );


// ----------------------------------------------------------------------------
// FLOOD
// ----------------------------------------------------------------------------

var FLOOD_SUITABILITY =

  HAND_SUITABILITY
    .multiply(
      W_FLOOD.HAND
    )

    .add(

      DRAINAGE_PROXIMITY
        .multiply(
          W_FLOOD.drainage
        )

    )

    .add(

      UPA_NORMALIZED
        .multiply(
          W_FLOOD.UPA
        )

    )

    .add(

      TWI_NORMALIZED
        .multiply(
          W_FLOOD.TWI
        )

    )

    .add(

      RAINFALL_SCORE
        .multiply(
          W_FLOOD.rainfall
        )

    )

    .add(

      POPULATION_SCORE
        .multiply(
          W_FLOOD.population
        )

    )

    .add(

      BUILTUP_SCORE
        .multiply(
          W_FLOOD.settlement
        )

    )

    .add(

      BUILTUP_SCORE
        .multiply(
          W_FLOOD.builtup
        )

    )

    .clamp(
      0,
      1
    )
    .rename(
      'Flood_Suitability'
    );


// ----------------------------------------------------------------------------
// AGRICULTURE
// ----------------------------------------------------------------------------

var AGRICULTURE_SUITABILITY =

  NDVI_CONDITION
    .multiply(
      W_AGRICULTURE.productivity
    )

    .add(

      NDVI_CONDITION
        .multiply(
          W_AGRICULTURE.NDVI
        )

    )

    .add(

      RAINFALL_SCORE
        .multiply(
          W_AGRICULTURE.rainfall
        )

    )

    .add(

      PH_SUITABILITY
        .multiply(
          W_AGRICULTURE.soilPH
        )

    )

    .add(

      SOIL_SOC_SCORE
        .multiply(
          W_AGRICULTURE.SOC
        )

    )

    .add(

      SOIL_AWC_SCORE
        .multiply(
          W_AGRICULTURE.AWC
        )

    )

    .add(

      AGRICULTURAL_VEGETATION
        .multiply(
          W_AGRICULTURE.agricultureVegetation
        )

    )

    .add(

      ROAD_ACCESS
        .multiply(
          W_AGRICULTURE.access
        )

    )

    .clamp(
      0,
      1
    )
    .rename(
      'Agriculture_Suitability'
    );


// ============================================================================
// 28. HARD CONSTRAINTS
// ============================================================================
//
// Protected areas are treated differently depending on intervention.
//
// Wetland restoration can legitimately occur in protected areas.
// Flood mitigation can target built-up areas.
// Irrigation and agriculture conservatively exclude protected areas.
// Water is excluded where the intervention represents land-based project
// placement.
//
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
    );


var IRRIGATION_CONSTRAINT =
  ee.Image(
    1
  )
  .subtract(
    WATER
  )
  .subtract(
    BUILTUP
  )
  .subtract(
    PROTECTED_MASK
  )
  .max(
    0
  )
  .clamp(
    0,
    1
  );


var WETLAND_CONSTRAINT =
  ee.Image(
    1
  )
  .subtract(
    BUILTUP
  )
  .clamp(
    0,
    1
  );


var EROSION_CONSTRAINT =
  ee.Image(
    1
  )
  .subtract(
    WATER
  )
  .subtract(
    BUILTUP
  )
  .max(
    0
  )
  .clamp(
    0,
    1
  );


var REFORESTATION_CONSTRAINT =
  ee.Image(
    1
  )
  .subtract(
    WATER
  )
  .subtract(
    BUILTUP
  )
  .max(
    0
  )
  .clamp(
    0,
    1
  );


var FLOOD_CONSTRAINT =
  ee.Image(
    1
  )
  .subtract(
    WATER
  )
  .clamp(
    0,
    1
  );


var AGRICULTURE_CONSTRAINT =
  ee.Image(
    1
  )
  .subtract(
    WATER
  )
  .subtract(
    BUILTUP
  )
  .subtract(
    PROTECTED_MASK
  )
  .max(
    0
  )
  .clamp(
    0,
    1
  );


// ============================================================================
// 29. FEASIBLE SUITABILITY
// ============================================================================

var IRRIGATION_FEASIBLE =
  IRRIGATION_SUITABILITY
    .multiply(
      IRRIGATION_CONSTRAINT
    )
    .rename(
      'Irrigation_Feasible_Suitability'
    );


var WETLAND_FEASIBLE =
  WETLAND_SUITABILITY
    .multiply(
      WETLAND_CONSTRAINT
    )
    .rename(
      'Wetland_Feasible_Suitability'
    );


var EROSION_FEASIBLE =
  EROSION_SUITABILITY
    .multiply(
      EROSION_CONSTRAINT
    )
    .rename(
      'Erosion_Feasible_Suitability'
    );


var REFORESTATION_FEASIBLE =
  REFORESTATION_SUITABILITY
    .multiply(
      REFORESTATION_CONSTRAINT
    )
    .rename(
      'Reforestation_Feasible_Suitability'
    );


var FLOOD_FEASIBLE =
  FLOOD_SUITABILITY
    .multiply(
      FLOOD_CONSTRAINT
    )
    .rename(
      'Flood_Feasible_Suitability'
    );


var AGRICULTURE_FEASIBLE =
  AGRICULTURE_SUITABILITY
    .multiply(
      AGRICULTURE_CONSTRAINT
    )
    .rename(
      'Agriculture_Feasible_Suitability'
    );


// ============================================================================
// 30. CATCHMENT INVESTMENT GAP RASTERS
// ============================================================================
//
// reduceToImage uses the 20 catchments as the source of the investment-gap
// surface. Each catchment receives its corresponding family gap.
//
// ============================================================================

var IRRIGATION_GAP =
  GAP
    .reduceToImage({

      properties:
        [
          'Irrigation_Gap'
        ],

      reducer:
        ee.Reducer.first()

    })
    .clip(
      STUDY_AREA
    );


var WETLAND_GAP =
  GAP
    .reduceToImage({

      properties:
        [
          'Wetland_Gap'
        ],

      reducer:
        ee.Reducer.first()

    })
    .clip(
      STUDY_AREA
    );


var EROSION_GAP =
  GAP
    .reduceToImage({

      properties:
        [
          'Erosion_Gap'
        ],

      reducer:
        ee.Reducer.first()

    })
    .clip(
      STUDY_AREA
    );


var REFORESTATION_GAP =
  GAP
    .reduceToImage({

      properties:
        [
          'Reforestation_Gap'
        ],

      reducer:
        ee.Reducer.first()

    })
    .clip(
      STUDY_AREA
    );


var FLOOD_GAP =
  GAP
    .reduceToImage({

      properties:
        [
          'Flood_Gap'
        ],

      reducer:
        ee.Reducer.first()

    })
    .clip(
      STUDY_AREA
    );


var AGRICULTURE_GAP =
  GAP
    .reduceToImage({

      properties:
        [
          'Agriculture_Gap'
        ],

      reducer:
        ee.Reducer.first()

    })
    .clip(
      STUDY_AREA
    );


// ============================================================================
// 31. GAP NULL PROTECTION
// ============================================================================

var IRRIGATION_GAP_SAFE =
  IRRIGATION_GAP.unmask(
    0
  );


var WETLAND_GAP_SAFE =
  WETLAND_GAP.unmask(
    0
  );


var EROSION_GAP_SAFE =
  EROSION_GAP.unmask(
    0
  );


var REFORESTATION_GAP_SAFE =
  REFORESTATION_GAP.unmask(
    0
  );


var FLOOD_GAP_SAFE =
  FLOOD_GAP.unmask(
    0
  );


var AGRICULTURE_GAP_SAFE =
  AGRICULTURE_GAP.unmask(
    0
  );


// ============================================================================
// 32. FINAL PIXEL OPPORTUNITY
// ============================================================================

var IRRIGATION_OPPORTUNITY =
  IRRIGATION_FEASIBLE
    .multiply(
      IRRIGATION_GAP_SAFE
    )
    .clamp(
      0,
      1
    )
    .rename(
      'Irrigation_Opportunity'
    );


var WETLAND_OPPORTUNITY =
  WETLAND_FEASIBLE
    .multiply(
      WETLAND_GAP_SAFE
    )
    .clamp(
      0,
      1
    )
    .rename(
      'Wetland_Opportunity'
    );


var EROSION_OPPORTUNITY =
  EROSION_FEASIBLE
    .multiply(
      EROSION_GAP_SAFE
    )
    .clamp(
      0,
      1
    )
    .rename(
      'Erosion_Opportunity'
    );


var REFORESTATION_OPPORTUNITY =
  REFORESTATION_FEASIBLE
    .multiply(
      REFORESTATION_GAP_SAFE
    )
    .clamp(
      0,
      1
    )
    .rename(
      'Reforestation_Opportunity'
    );


var FLOOD_OPPORTUNITY =
  FLOOD_FEASIBLE
    .multiply(
      FLOOD_GAP_SAFE
    )
    .clamp(
      0,
      1
    )
    .rename(
      'Flood_Opportunity'
    );


var AGRICULTURE_OPPORTUNITY =
  AGRICULTURE_FEASIBLE
    .multiply(
      AGRICULTURE_GAP_SAFE
    )
    .clamp(
      0,
      1
    )
    .rename(
      'Agriculture_Opportunity'
    );


// ============================================================================
// 33. MASTER OPPORTUNITY STACK
// ============================================================================

var OPPORTUNITY_STACK =
  ee.Image.cat([

    IRRIGATION_OPPORTUNITY,

    WETLAND_OPPORTUNITY,

    EROSION_OPPORTUNITY,

    REFORESTATION_OPPORTUNITY,

    FLOOD_OPPORTUNITY,

    AGRICULTURE_OPPORTUNITY

  ])
  .clip(
    STUDY_AREA
  );


// ============================================================================
// 34. BEST OPPORTUNITY
// ============================================================================

var BEST_OPPORTUNITY =
  OPPORTUNITY_STACK
    .reduce(
      ee.Reducer.max()
    )
    .rename(
      'Best_Opportunity_Score'
    );


// ============================================================================
// 35. BEST INTERVENTION CODE
// ============================================================================

var BEST_INTERVENTION_CODE =
  OPPORTUNITY_STACK
    .toArray()
    .arrayArgmax()
    .arrayGet([
      0
    ])
    .add(
      1
    )
    .rename(
      'Best_Intervention_Code'
    );


// ============================================================================
// 36. FINAL MASTER STACK
// ============================================================================

var FINAL_STACK =
  OPPORTUNITY_STACK
    .addBands(
      BEST_OPPORTUNITY
    )
    .addBands(
      BEST_INTERVENTION_CODE
    )
    .toFloat();


// ============================================================================
// 37. PIXEL VALIDATION
// ============================================================================

print('============================================================');
print('PIXEL OPPORTUNITY LAYERS');
print('============================================================');

print(
  'Irrigation:',
  IRRIGATION_OPPORTUNITY
);

print(
  'Wetland:',
  WETLAND_OPPORTUNITY
);

print(
  'Erosion:',
  EROSION_OPPORTUNITY
);

print(
  'Reforestation:',
  REFORESTATION_OPPORTUNITY
);

print(
  'Flood:',
  FLOOD_OPPORTUNITY
);

print(
  'Agriculture:',
  AGRICULTURE_OPPORTUNITY
);


// ============================================================================
// 38. HARD-CONSTRAINT COVERAGE
// ============================================================================

print('============================================================');
print('HARD-CONSTRAINT COVERAGE');
print('============================================================');


function meanConstraint(
  image
) {

  return image.reduceRegion({

    reducer:
      ee.Reducer.mean(),

    geometry:
      STUDY_AREA,

    scale:
      ANALYSIS_SCALE,

    bestEffort:
      true,

    maxPixels:
      1e8

  });

}


print(
  'Irrigation:',
  meanConstraint(
    IRRIGATION_CONSTRAINT
  )
);

print(
  'Wetland:',
  meanConstraint(
    WETLAND_CONSTRAINT
  )
);

print(
  'Erosion:',
  meanConstraint(
    EROSION_CONSTRAINT
  )
);

print(
  'Reforestation:',
  meanConstraint(
    REFORESTATION_CONSTRAINT
  )
);

print(
  'Flood:',
  meanConstraint(
    FLOOD_CONSTRAINT
  )
);

print(
  'Agriculture:',
  meanConstraint(
    AGRICULTURE_CONSTRAINT
  )
);


// ============================================================================
// 39. NATIONAL PIXEL OPPORTUNITY SUMMARY
// ============================================================================

print('============================================================');
print('NATIONAL PIXEL OPPORTUNITY SUMMARY');
print('============================================================');


function meanRaster(
  image
) {

  return image.reduceRegion({

    reducer:
      ee.Reducer.mean(),

    geometry:
      STUDY_AREA,

    scale:
      ANALYSIS_SCALE,

    bestEffort:
      true,

    maxPixels:
      1e8

  });

}


print(
  'Irrigation:',
  meanRaster(
    IRRIGATION_OPPORTUNITY
  )
);

print(
  'Wetland:',
  meanRaster(
    WETLAND_OPPORTUNITY
  )
);

print(
  'Erosion:',
  meanRaster(
    EROSION_OPPORTUNITY
  )
);

print(
  'Reforestation:',
  meanRaster(
    REFORESTATION_OPPORTUNITY
  )
);

print(
  'Flood:',
  meanRaster(
    FLOOD_OPPORTUNITY
  )
);

print(
  'Agriculture:',
  meanRaster(
    AGRICULTURE_OPPORTUNITY
  )
);


// ============================================================================
// 40. MAP
// ============================================================================

Map.centerObject(
  CATCHMENTS,
  6
);


Map.addLayer(

  CATCHMENTS.style({

    color:
      '000000',

    fillColor:
      '00000000',

    width:
      2

  }),

  {},

  'ACReSAL Strategic Catchments'

);


Map.addLayer(

  ROAD_RASTER,

  {
    min:
      0,

    max:
      1

  },

  'ACReSAL Roads',

  false

);


Map.addLayer(

  PROTECTED_MASK,

  {
    min:
      0,

    max:
      1

  },

  'Protected Areas',

  false

);


// ============================================================================
// 41. OPPORTUNITY MAPS
// ============================================================================

Map.addLayer(

  IRRIGATION_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      'FFFFFF',
      'FFFFCC',
      'FED976',
      'FEB24C',
      'FD8D3C',
      'FC4E2A',
      'E31A1C',
      'BD0026'
    ]

  },

  'Irrigation Opportunity',

  false

);


Map.addLayer(

  WETLAND_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      'FFFFFF',
      'E0F3DB',
      'A8DDB5',
      '7BCCC4',
      '43A2CA',
      '0868AC',
      '084081'
    ]

  },

  'Wetland Opportunity',

  false

);


Map.addLayer(

  EROSION_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      'FFFFFF',
      'FFFFCC',
      'FED976',
      'FD8D3C',
      'FC4E2A',
      'E31A1C',
      'BD0026'
    ]

  },

  'Erosion Opportunity',

  false

);


Map.addLayer(

  REFORESTATION_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      '8B0000',
      'FF0000',
      'FFA500',
      'FFFF00',
      '9ACD32',
      '006400'
    ]

  },

  'Reforestation Opportunity',

  false

);


Map.addLayer(

  FLOOD_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      'FFFFFF',
      'D9F0D3',
      'A6DBA0',
      '5AAE61',
      '1B7837',
      '00441B'
    ]

  },

  'Flood Opportunity',

  false

);


Map.addLayer(

  AGRICULTURE_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      '8B0000',
      'FF0000',
      'FFA500',
      'FFFF00',
      '9ACD32',
      '006400'
    ]

  },

  'Agriculture Opportunity',

  false

);


Map.addLayer(

  BEST_OPPORTUNITY,

  {
    min:
      0,

    max:
      1,

    palette: [
      'FFFFFF',
      'FFFFCC',
      'FED976',
      'FEB24C',
      'FD8D3C',
      'FC4E2A',
      'E31A1C',
      'BD0026'
    ]

  },

  'Best Opportunity',

  true

);


Map.addLayer(

  BEST_INTERVENTION_CODE,

  {
    min:
      1,

    max:
      6,

    palette: [
      '1b9e77',
      'd95f02',
      '7570b3',
      'e7298a',
      '66a61e',
      'e6ab02'
    ]

  },

  'Best Intervention Code',

  false

);


// ============================================================================
// 42. EXPORT MASTER STACK
// ============================================================================

Export.image.toDrive({

  image:
    FINAL_STACK,

  description:
    'ACRESAL_Phase4C_Pixel_Opportunity_v3',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4C_Pixel_Opportunity_v3',

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


// ============================================================================
// 43. EXPORT INDIVIDUAL OPPORTUNITY RASTERS
// ============================================================================

function exportOpportunity(
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


exportOpportunity(
  IRRIGATION_OPPORTUNITY,
  'ACRESAL_Phase4C_Irrigation_Opportunity_v3'
);


exportOpportunity(
  WETLAND_OPPORTUNITY,
  'ACRESAL_Phase4C_Wetland_Opportunity_v3'
);


exportOpportunity(
  EROSION_OPPORTUNITY,
  'ACRESAL_Phase4C_Erosion_Opportunity_v3'
);


exportOpportunity(
  REFORESTATION_OPPORTUNITY,
  'ACRESAL_Phase4C_Reforestation_Opportunity_v3'
);


exportOpportunity(
  FLOOD_OPPORTUNITY,
  'ACRESAL_Phase4C_Flood_Opportunity_v3'
);


exportOpportunity(
  AGRICULTURE_OPPORTUNITY,
  'ACRESAL_Phase4C_Agriculture_Opportunity_v3'
);


// ============================================================================
// 44. EXPORT BEST OPPORTUNITY
// ============================================================================

Export.image.toDrive({

  image:
    BEST_OPPORTUNITY
      .toFloat(),

  description:
    'ACRESAL_Phase4C_Best_Opportunity_v3',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4C_Best_Opportunity_v3',

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


// ============================================================================
// 45. EXPORT BEST INTERVENTION
// ============================================================================

Export.image.toDrive({

  image:
    BEST_INTERVENTION_CODE
      .toByte(),

  description:
    'ACRESAL_Phase4C_Best_Intervention_Code_v3',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4C_Best_Intervention_Code_v3',

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


// ============================================================================
// 46. FINAL STATUS
// ============================================================================

print('============================================================');
print('PHASE 4C v3 COMPLETE');
print('============================================================');

print(
  'Version:',
  VERSION
);

print(
  'Strategic catchments:',
  CATCHMENTS.size()
);

print(
  'Analysis scale:',
  ANALYSIS_SCALE + ' m'
);

print(
  'CRS:',
  MASTER_CRS
);

print(
  'Pixel suitability:',
  'CALCULATED'
);

print(
  'Hard constraints:',
  'APPLIED'
);

print(
  'Investment gap:',
  'PROPAGATED FROM PHASE 4B.5 v7'
);

print(
  'Pixel opportunity:',
  'CALCULATED'
);

print(
  'Accessibility:',
  'ACReSAL road-distance based'
);

print(
  'External friction raster:',
  'NOT USED'
);

print(
  'Protected areas:',
  'INTERVENTION-SPECIFIC CONSTRAINT'
);

print(
  'Best intervention:',
  'CALCULATED'
);

print(
  'Output asset:',
  OUTPUT_ASSET
);

print(
  'Next:',
  'PHASE 4D - CANDIDATE SITE EXTRACTION + FINAL INVESTMENT PRIORITY'
);

print('============================================================');
