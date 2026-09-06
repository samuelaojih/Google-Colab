// ============================================================================
// ILAJE LGA SHORELINE CHANGE ANALYSIS
// 1986 - 2026 (annual)
// ============================================================================
//
// STUDY AREA:
// projects/ee-samuelcoolsdk/assets/Ilaje
//
// EXISTING 2023 SHORELINE:
// projects/ee-samuelcoolsdk/assets/Ilaje_coastline
//
// METHODS:
// MNDWI-based Landsat shoreline extraction, run for every year in the
// study period so sparse years (imagery is especially thin 1994-1999)
// can be inspected on the map and manually included or excluded.
// 2023 shoreline as reference baseline
// 100 m transects
// NSM
// EPR
// SCE
// LRR
//
// ============================================================================


// ============================================================================
// 1. USER PARAMETERS
// ============================================================================

var studyArea = ee.FeatureCollection(
  'projects/ee-samuelcoolsdk/assets/Ilaje'
);

var shoreline2023Asset = ee.FeatureCollection(
  'projects/ee-samuelcoolsdk/assets/Ilaje_coastline'
);

var aoi = studyArea.geometry();


// Study period - every year in this range is extracted
var startYear = 1986;
var endYear = 2026;

var years = [];

for (var yr = startYear; yr <= endYear; yr++) {
  years.push(yr);
}


// ----------------------------------------------------------------------
// Years used for the change statistics (NSM / EPR / SCE / LRR) and for
// the "Complete transects" filter below.
//
// Every year from startYear-endYear is extracted and added to the map
// (as hidden layers) further down, along with a printed scene count.
// Landsat coverage is thin for several years - especially 1994-1999,
// before Landsat 7 launched - so open the layer list, toggle the
// "Shoreline Edge YYYY" / "Landsat Shoreline YYYY" layers on, check the
// scene counts printed to the console, and edit this list down to only
// the years whose extracted shoreline looks reliable before trusting
// the statistics/export sections below.
// ----------------------------------------------------------------------

var analysisYears = years;


// Transect spacing
var transectSpacing = 100;


// Transect length
var transectLength = 3000;


// Half transect length
var halfTransect = 1500;


// Coastal buffer
var coastalBuffer = 2000;


// Cloud threshold
var cloudThreshold = 60;


// MNDWI threshold
var mndwiThreshold = 0;


// Minimum connected pixels
var minimumConnectedPixels = 10;


// ============================================================================
// 2. MAP SETUP
// ============================================================================

Map.centerObject(
  studyArea,
  10
);

Map.setOptions(
  'SATELLITE'
);


// ============================================================================
// 3. DISPLAY ILAJE BOUNDARY
// ============================================================================

Map.addLayer(
  studyArea.style({
    color: 'red',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'Ilaje LGA Boundary',
  true
);


// ============================================================================
// 4. PREPARE 2023 REFERENCE SHORELINE
// ============================================================================

var shoreline2023 = shoreline2023Asset
  .filterBounds(aoi);


// Clip shoreline to Ilaje
var shoreline2023Clipped = shoreline2023.map(
  function(feature) {

    var geom = feature.geometry().intersection({
      right: aoi,
      maxError: 10
    });

    return ee.Feature(geom)
      .copyProperties(feature);

  }
);


// Calculate length
var shoreline2023Length = shoreline2023Clipped.map(
  function(feature) {

    var length = feature.geometry().length({
      maxError: 10
    });

    return feature.set({
      length_m: length,
      length_km: ee.Number(length).divide(1000)
    });

  }
);


// Remove very short segments
shoreline2023Length = shoreline2023Length.filter(
  ee.Filter.gte(
    'length_m',
    30
  )
);


// ============================================================================
// 5. PRINT 2023 INFORMATION
// ============================================================================

print(
  '===================================================='
);

print(
  'ILAJE 2023 REFERENCE SHORELINE'
);

print(
  'Number of shoreline features:',
  shoreline2023Length.size()
);


var total2023Length = shoreline2023Length
  .aggregate_sum(
    'length_m'
  );


print(
  '2023 coastline length (m):',
  total2023Length
);

print(
  '2023 coastline length (km):',
  ee.Number(total2023Length)
    .divide(1000)
);


// ============================================================================
// 6. DISPLAY 2023 SHORELINE
// ============================================================================

Map.addLayer(
  shoreline2023Length.style({
    color: 'yellow',
    width: 4
  }),
  {},
  '2023 Reference Shoreline',
  true
);


// ============================================================================
// 7. CREATE COASTAL ANALYSIS ZONE
// ============================================================================

var coastalZone = shoreline2023Length
  .geometry()
  .buffer(
    coastalBuffer
  );


// ============================================================================
// 8. LANDSAT CLOUD MASK
// ============================================================================

function maskLandsat(image) {

  var qa = image.select(
    'QA_PIXEL'
  );

  var fill = qa.bitwiseAnd(
    1 << 0
  ).eq(0);

  var dilatedCloud = qa.bitwiseAnd(
    1 << 1
  ).eq(0);

  var cirrus = qa.bitwiseAnd(
    1 << 2
  ).eq(0);

  var cloud = qa.bitwiseAnd(
    1 << 3
  ).eq(0);

  var shadow = qa.bitwiseAnd(
    1 << 4
  ).eq(0);

  var snow = qa.bitwiseAnd(
    1 << 5
  ).eq(0);


  var mask = fill
    .and(dilatedCloud)
    .and(cirrus)
    .and(cloud)
    .and(shadow)
    .and(snow);


  return image
    .updateMask(mask)

    .multiply(0.0000275)

    .add(-0.2)

    .copyProperties(
      image,
      image.propertyNames()
    );
}


// ============================================================================
// 9. STANDARDISE BANDS ACROSS SENSORS
// ============================================================================
//
// Landsat 5/7:
// Green = SR_B2
// SWIR1 = SR_B5
//
// Landsat 8/9:
// Green = SR_B3
// SWIR1 = SR_B6
//
// ============================================================================

function rename57(image) {

  return image.select(
    [
      'SR_B2',
      'SR_B5'
    ],
    [
      'GREEN',
      'SWIR1'
    ]
  );
}


function rename89(image) {

  return image.select(
    [
      'SR_B3',
      'SR_B6'
    ],
    [
      'GREEN',
      'SWIR1'
    ]
  );
}


// ============================================================================
// 10. BUILD A MERGED LANDSAT COLLECTION FOR ANY GIVEN YEAR
// ============================================================================
//
// Every archive (L5, L7, L8, L9) is queried for every year. A collection
// that has no scenes for a given year (because the sensor was not yet
// launched, or had already been retired) simply comes back empty and
// contributes nothing to the merge - so years that straddle two sensors
// (e.g. 1999-2012, 2013-2022) automatically combine both.
//
// ============================================================================

function getYearlyCollection(year) {

  var start =
    ee.Date.fromYMD(year, 1, 1);

  var end =
    ee.Date.fromYMD(year + 1, 1, 1);


  function loadCollection(id) {

    return ee.ImageCollection(id)
      .filterBounds(aoi)
      .filterDate(start, end)
      .filter(
        ee.Filter.lt(
          'CLOUD_COVER',
          cloudThreshold
        )
      )
      .map(maskLandsat);

  }


  var landsat5 =
    loadCollection('LANDSAT/LT05/C02/T1_L2')
      .map(rename57);

  var landsat7 =
    loadCollection('LANDSAT/LE07/C02/T1_L2')
      .map(rename57);

  var landsat8 =
    loadCollection('LANDSAT/LC08/C02/T1_L2')
      .map(rename89);

  var landsat9 =
    loadCollection('LANDSAT/LC09/C02/T1_L2')
      .map(rename89);


  var merged =
    landsat5
      .merge(landsat7)
      .merge(landsat8)
      .merge(landsat9);


  print(
    'Landsat scenes - ' + year + ':',
    merged.size()
  );


  return merged;
}


function getYearlyImage(year) {

  return getYearlyCollection(year).median();
}


// ============================================================================
// 11. EXTRACT SHORELINE FROM LANDSAT
// ============================================================================

function extractShoreline(year) {

  var image =
    getYearlyImage(year);


  // ----------------------------------------------------------
  // MNDWI
  // ----------------------------------------------------------

  var mndwi =
    image.normalizedDifference([
      'GREEN',
      'SWIR1'
    ]).rename(
      'MNDWI'
    );


  // ----------------------------------------------------------
  // Water mask
  // ----------------------------------------------------------

  var water =
    mndwi.gt(
      mndwiThreshold
    );


  // ----------------------------------------------------------
  // Restrict to coastal zone
  // ----------------------------------------------------------

  water =
    water.clip(
      coastalZone
    );


  // ----------------------------------------------------------
  // Remove isolated pixels
  // ----------------------------------------------------------

  var connected =
    water.connectedPixelCount(
      100,
      true
    );


  water =
    water.updateMask(
      connected.gte(
        minimumConnectedPixels
      )
    );


  // ----------------------------------------------------------
  // Detect land-water edge
  // ----------------------------------------------------------

  var eroded =
    water.focal_min({
      radius: 30,
      units: 'meters'
    });


  var edge =
    water.and(
      eroded.not()
    );


  edge =
    edge.selfMask();


  // ----------------------------------------------------------
  // Convert shoreline pixels to points
  // ----------------------------------------------------------

  var points =
    edge.reduceToVectors({

      geometry:
        coastalZone,

      scale:
        30,

      geometryType:
        'centroid',

      eightConnected:
        true,

      labelProperty:
        'shoreline',

      maxPixels:
        1e13,

      bestEffort:
        true

    });


  points =
    points.map(
      function(feature) {

        return feature.set({
          Year: year
        });

      }
    );


  // ----------------------------------------------------------
  // Display (hidden by default - toggle on to inspect a year)
  // ----------------------------------------------------------

  Map.addLayer(
    edge,
    {
      palette: [
        '00FFFF'
      ]
    },
    'Shoreline Edge ' + year,
    false
  );


  Map.addLayer(
    points.style({
      color: 'cyan',
      pointSize: 2
    }),
    {},
    'Landsat Shoreline ' + year,
    false
  );


  print(
    'Shoreline points - ' + year + ':',
    points.size()
  );


  return points;
}


// ============================================================================
// 12. EXTRACT EVERY YEAR IN THE STUDY PERIOD
// ============================================================================

var shorelinesByYear = {};

for (var i = 0; i < years.length; i++) {

  var extractionYear = years[i];

  shorelinesByYear[extractionYear] =
    extractShoreline(extractionYear);

}


// ============================================================================
// 13. CONVERT 2023 REFERENCE LINE TO POINTS
// ============================================================================
//
// The surveyed 2023 asset is more reliable than an MNDWI extraction, so
// it overrides the Landsat-derived 2023 shoreline for the distance
// measurements below (see section 17).
//
// ============================================================================

var shoreline2023Points =
  shoreline2023Length.map(
    function(feature) {

      var centroid =
        feature.geometry()
          .centroid({
            maxError: 10
          });

      return ee.Feature(
        centroid
      ).set({
        Year: 2023
      });

    }
  );


// ============================================================================
// 14. CREATE 100-M TRANSECT ORIGIN POINTS
// ============================================================================
//
// Use the 2023 coastline geometry as the reference.
//
// ============================================================================

var referenceLine =
  shoreline2023Length
    .geometry();


// Total reference coastline length
var referenceLength =
  referenceLine.length({
    maxError: 10
  });


print(
  'Reference coastline length:',
  referenceLength
);


// Number of sample points
var numberOfPoints =
  referenceLength
    .divide(transectSpacing)
    .ceil();


// Generate regular distances
var distances =
  ee.List.sequence(
    0,
    referenceLength,
    transectSpacing
  );


// ============================================================================
// 15. CREATE POINTS ALONG REFERENCE COASTLINE
// ============================================================================
//
// Earth Engine's cutLines creates approximately equally spaced pieces.
//
// ============================================================================

var baselineSegments =
  referenceLine.cutLines({
    distances:
      distances,

    maxError:
      10
  });


// Extract geometries
var segmentGeometries =
  baselineSegments.geometries();


// ============================================================================
// 16. CREATE MIDPOINTS
// ============================================================================

var baselinePoints =
  ee.FeatureCollection(
    ee.List.sequence(
      0,
      segmentGeometries.length()
        .subtract(1)
    ).map(
      function(i) {

        var segment =
          ee.Geometry(
            segmentGeometries.get(i)
          );


        var midpoint =
          segment.centroid({
            maxError: 10
          });


        return ee.Feature(
          midpoint,
          {
            Transect_ID:
              ee.Number(i)
                .add(1)
          }
        );

      }
    )
  );


// ============================================================================
// 17. DISPLAY BASELINE POINTS
// ============================================================================

Map.addLayer(
  baselinePoints.style({
    color: 'white',
    pointSize: 2
  }),
  {},
  'Transect Origin Points',
  false
);


print(
  'Number of transect origin points:',
  baselinePoints.size()
);


// ============================================================================
// 18. CREATE PERPENDICULAR TRANSECTS
// ============================================================================
//
// Each baseline point is used to create a local perpendicular transect.
//
// A small neighbourhood around each point is used to estimate the local
// coastline orientation.
//
// ============================================================================

var transects =
  baselinePoints.map(
    function(feature) {

      var point =
        feature.geometry();


      // Local 100-m neighbourhood
      var localArea =
        point.buffer(
          100
        );


      var localLine =
        shoreline2023Length
          .filterBounds(
            localArea
          )
          .geometry();


      // Get bounding box coordinates.
      //
      // This provides a stable local orientation estimate even when the
      // coastline is complex.

      var bounds =
        localLine.bounds({
          maxError: 10
        });


      var coords =
        ee.List(
          bounds.coordinates()
            .get(0)
        );


      var p1 =
        ee.List(
          coords.get(0)
        );

      var p2 =
        ee.List(
          coords.get(1)
        );


      var x1 =
        ee.Number(
          p1.get(0)
        );

      var y1 =
        ee.Number(
          p1.get(1)
        );


      var x2 =
        ee.Number(
          p2.get(0)
        );

      var y2 =
        ee.Number(
          p2.get(1)
        );


      var dx =
        x2.subtract(x1);

      var dy =
        y2.subtract(y1);


      var magnitude =
        dx.pow(2)
          .add(
            dy.pow(2)
          )
          .sqrt()
          .max(
            0.000001
          );


      // Perpendicular direction

      var px =
        dy.multiply(-1)
          .divide(
            magnitude
          );

      var py =
        dx.divide(
          magnitude
        );


      var coordinates =
        point.coordinates();


      var lon =
        ee.Number(
          coordinates.get(0)
        );

      var lat =
        ee.Number(
          coordinates.get(1)
        );


      // Approximate metre-to-degree conversion.
      //
      // 1 degree latitude ~111,320 m.
      // Longitude is adjusted for latitude.

      var metresPerDegreeLat =
        111320;


      var metresPerDegreeLon =
        ee.Number(
          111320
        ).multiply(
          lat.multiply(
            Math.PI / 180
          ).cos()
        );


      var dLon =
        px.multiply(
          halfTransect
        )
        .divide(
          metresPerDegreeLon
        );


      var dLat =
        py.multiply(
          halfTransect
        )
        .divide(
          metresPerDegreeLat
        );


      var start =
        ee.Geometry.Point([
          lon.subtract(dLon),
          lat.subtract(dLat)
        ]);


      var end =
        ee.Geometry.Point([
          lon.add(dLon),
          lat.add(dLat)
        ]);


      var line =
        ee.Geometry.LineString([
          start.coordinates(),
          end.coordinates()
        ]);


      return ee.Feature(
        line,
        {
          Transect_ID:
            feature.get(
              'Transect_ID'
            ),

          Spacing_m:
            transectSpacing,

          Transect_Length_m:
            transectLength

        }
      );

    }
  );


// ============================================================================
// 19. CLIP TRANSECTS TO ILAJE
// ============================================================================

transects =
  transects.map(
    function(feature) {

      var clipped =
        feature.geometry()
          .intersection({
            right: aoi,
            maxError: 10
          });

      return ee.Feature(
        clipped
      ).copyProperties(
        feature
      );

    }
  );


// ============================================================================
// 20. DISPLAY TRANSECTS
// ============================================================================

Map.addLayer(
  transects.style({
    color: 'magenta',
    width: 1
  }),
  {},
  '100-m Perpendicular Transects',
  true
);


// ============================================================================
// 21. MEASURE DISTANCE FROM TRANSECT TO SHORELINE
// ============================================================================
//
// The distance between the transect and the nearest shoreline point is
// calculated.
//
// ============================================================================

function addShorelineDistance(
  transectCollection,
  shorelinePoints,
  year
) {

  return transectCollection.map(
    function(transect) {

      var corridor =
        transect.geometry()
          .buffer(
            100
          );


      var candidates =
        shorelinePoints
          .filterBounds(
            corridor
          );


      var withDistance =
        candidates.map(
          function(point) {

            var distance =
              point.geometry()
                .distance(
                  transect.geometry(),
                  10
                );

            return point.set({
              Distance_m:
                distance
            });

          }
        );


      var nearest =
        withDistance
          .sort(
            'Distance_m',
            true
          )
          .first();


      return transect.set(

        'D_' + year,

        ee.Algorithms.If(
          withDistance.size().gt(0),
          ee.Feature(
            nearest
          ).get(
            'Distance_m'
          ),
          null
        )

      );

    }
  );

}


// ============================================================================
// 22. MEASURE SHORELINE POSITION FOR EVERY YEAR
// ============================================================================

var measurements = transects;

for (var j = 0; j < years.length; j++) {

  var measureYear = years[j];

  measurements =
    addShorelineDistance(
      measurements,
      shorelinesByYear[measureYear],
      measureYear
    );

}


// Override 2023 with the surveyed reference line
measurements =
  addShorelineDistance(
    measurements,
    shoreline2023Points,
    2023
  );


// ============================================================================
// 23. CALCULATE SHORELINE CHANGE OVER THE SELECTED YEARS
// ============================================================================
//
// Only "analysisYears" (edited in section 1 after reviewing the map)
// feeds into NSM, EPR, SCE and LRR - so a sparse year that was left out
// simply does not affect these statistics.
//
// ============================================================================

var firstYear =
  analysisYears[0];

var lastYear =
  analysisYears[analysisYears.length - 1];


var results =
  measurements.map(
    function(feature) {

      var props = {};


      // --------------------------------------------------------
      // Per-consecutive-year NSM / EPR, using whatever gap
      // separates each pair of selected years.
      // --------------------------------------------------------

      for (var k = 0; k < analysisYears.length - 1; k++) {

        var yearA = analysisYears[k];
        var yearB = analysisYears[k + 1];

        var distanceA =
          ee.Number(
            feature.get('D_' + yearA)
          );

        var distanceB =
          ee.Number(
            feature.get('D_' + yearB)
          );

        var periodNsm =
          distanceB.subtract(distanceA);

        var periodEpr =
          periodNsm.divide(yearB - yearA);

        props['NSM_' + yearA + '_' + yearB + '_m'] =
          periodNsm;

        props['EPR_' + yearA + '_' + yearB + '_m_yr'] =
          periodEpr;

      }


      // --------------------------------------------------------
      // Overall NSM / EPR across the full selected range
      // --------------------------------------------------------

      var firstDistance =
        ee.Number(
          feature.get('D_' + firstYear)
        );

      var lastDistance =
        ee.Number(
          feature.get('D_' + lastYear)
        );

      var overallNsm =
        lastDistance.subtract(firstDistance);

      var overallEpr =
        overallNsm.divide(lastYear - firstYear);

      props['NSM_' + firstYear + '_' + lastYear + '_m'] =
        overallNsm;

      props['EPR_' + firstYear + '_' + lastYear + '_m_yr'] =
        overallEpr;


      // --------------------------------------------------------
      // SCE - shoreline change envelope across selected years
      // --------------------------------------------------------

      var allDistances =
        ee.List(
          analysisYears.map(
            function(y) {
              return ee.Number(
                feature.get('D_' + y)
              );
            }
          )
        );


      var maxDistance =
        ee.Number(
          allDistances.reduce(
            ee.Reducer.max()
          )
        );

      var minDistance =
        ee.Number(
          allDistances.reduce(
            ee.Reducer.min()
          )
        );

      var sce =
        maxDistance.subtract(
          minDistance
        );


      // --------------------------------------------------------
      // LRR - linear regression slope across selected years
      // --------------------------------------------------------

      var observationYears =
        ee.List(analysisYears);

      var meanYear =
        ee.Number(
          observationYears.reduce(
            ee.Reducer.mean()
          )
        );

      var meanDistance =
        ee.Number(
          allDistances.reduce(
            ee.Reducer.mean()
          )
        );

      var numerator =
        ee.Number(
          ee.List.sequence(
            0,
            analysisYears.length - 1
          ).map(
            function(idx) {

              var x =
                ee.Number(
                  observationYears.get(idx)
                ).subtract(meanYear);

              var y =
                ee.Number(
                  allDistances.get(idx)
                ).subtract(meanDistance);

              return x.multiply(y);

            }
          ).reduce(
            ee.Reducer.sum()
          )
        );

      var denominator =
        ee.Number(
          ee.List.sequence(
            0,
            analysisYears.length - 1
          ).map(
            function(idx) {

              var x =
                ee.Number(
                  observationYears.get(idx)
                ).subtract(meanYear);

              return x.pow(2);

            }
          ).reduce(
            ee.Reducer.sum()
          )
        );

      var lrr =
        numerator.divide(
          denominator
        );


      // --------------------------------------------------------
      // OVERALL CLASS
      // --------------------------------------------------------

      var overall =
        ee.Algorithms.If(

          overallNsm.lt(-10),

          'Erosion',

          ee.Algorithms.If(

            overallNsm.gt(10),

            'Accretion',

            'Stable'

          )

        );


      // --------------------------------------------------------
      // RATE CLASS
      // --------------------------------------------------------

      var rateClass =
        ee.Algorithms.If(

          overallEpr.lt(-5),

          'High erosion',

          ee.Algorithms.If(

            overallEpr.lt(-1),

            'Moderate erosion',

            ee.Algorithms.If(

              overallEpr.lt(1),

              'Stable',

              ee.Algorithms.If(

                overallEpr.lt(5),

                'Moderate accretion',

                'High accretion'

              )

            )

          )

        );


      props.SCE_m = sce;
      props.LRR_m_yr = lrr;
      props.Overall_Change = overall;
      props.Rate_Class = rateClass;


      return feature.set(props);

    }
  );


// ============================================================================
// 24. KEEP ONLY TRANSECTS COMPLETE FOR THE SELECTED YEARS
// ============================================================================

var requiredFields =
  analysisYears.map(
    function(y) {
      return 'D_' + y;
    }
  );


var validResults =
  results.filter(
    ee.Filter.notNull(
      requiredFields
    )
  );


print(
  '===================================================='
);

print(
  'TRANSECT RESULTS'
);

print(
  'Analysis years:',
  analysisYears
);

print(
  'Total transects:',
  transects.size()
);

print(
  'Complete transects:',
  validResults.size()
);


// ============================================================================
// 25. CLASSIFICATION
// ============================================================================

var erosion =
  validResults.filter(
    ee.Filter.eq(
      'Overall_Change',
      'Erosion'
    )
  );


var accretion =
  validResults.filter(
    ee.Filter.eq(
      'Overall_Change',
      'Accretion'
    )
  );


var stable =
  validResults.filter(
    ee.Filter.eq(
      'Overall_Change',
      'Stable'
    )
  );


// ============================================================================
// 26. DISPLAY EROSION
// ============================================================================

Map.addLayer(
  erosion.style({
    color: 'red',
    width: 3
  }),
  {},
  'Erosion ' + firstYear + '-' + lastYear,
  false
);


// ============================================================================
// 27. DISPLAY ACCRETION
// ============================================================================

Map.addLayer(
  accretion.style({
    color: '00FF00',
    width: 3
  }),
  {},
  'Accretion ' + firstYear + '-' + lastYear,
  false
);


// ============================================================================
// 28. DISPLAY STABLE
// ============================================================================

Map.addLayer(
  stable.style({
    color: 'FFFFFF',
    width: 2
  }),
  {},
  'Stable ' + firstYear + '-' + lastYear,
  false
);


// ============================================================================
// 29. PRINT CLASS COUNTS
// ============================================================================

print(
  'Erosion transects:',
  erosion.size()
);

print(
  'Accretion transects:',
  accretion.size()
);

print(
  'Stable transects:',
  stable.size()
);


// ============================================================================
// 30. STATISTICS FUNCTION
// ============================================================================

function statistics(
  collection,
  field,
  label
) {

  var stats =
    collection.reduceColumns({

      reducer:
        ee.Reducer.mean()
          .combine({
            reducer2:
              ee.Reducer.minMax(),
            sharedInputs:
              true
          })
          .combine({
            reducer2:
              ee.Reducer.stdDev(),
            sharedInputs:
              true
          }),

      selectors: [
        field
      ]

    });


  print(
    label,
    stats
  );

}


// ============================================================================
// 31. OVERALL STATISTICS
// ============================================================================

statistics(
  validResults,
  'NSM_' + firstYear + '_' + lastYear + '_m',
  'NSM ' + firstYear + '-' + lastYear + ' statistics'
);

statistics(
  validResults,
  'EPR_' + firstYear + '_' + lastYear + '_m_yr',
  'EPR ' + firstYear + '-' + lastYear + ' statistics'
);

statistics(
  validResults,
  'LRR_m_yr',
  'LRR ' + firstYear + '-' + lastYear + ' statistics'
);

statistics(
  validResults,
  'SCE_m',
  'SCE ' + firstYear + '-' + lastYear + ' statistics'
);


// ============================================================================
// 32. PER-PERIOD STATISTICS
// ============================================================================

for (var m = 0; m < analysisYears.length - 1; m++) {

  var periodYearA = analysisYears[m];
  var periodYearB = analysisYears[m + 1];

  statistics(
    validResults,
    'EPR_' + periodYearA + '_' + periodYearB + '_m_yr',
    'EPR ' + periodYearA + '-' + periodYearB
  );

}


// ============================================================================
// 33. EXPORT COMPLETE RESULTS
// ============================================================================

var exportSuffix =
  firstYear + '_' + lastYear;


Export.table.toDrive({

  collection:
    validResults,

  description:
    'Ilaje_Shoreline_Change_' + exportSuffix,

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Shoreline_Change_' + exportSuffix,

  fileFormat:
    'SHP'

});


// ============================================================================
// 34. EXPORT CSV
// ============================================================================

Export.table.toDrive({

  collection:
    validResults,

  description:
    'Ilaje_Shoreline_Change_' + exportSuffix + '_CSV',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Shoreline_Change_' + exportSuffix,

  fileFormat:
    'CSV'

});


// ============================================================================
// 35. EXPORT EROSION
// ============================================================================

Export.table.toDrive({

  collection:
    erosion,

  description:
    'Ilaje_Erosion_' + exportSuffix,

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Erosion_' + exportSuffix,

  fileFormat:
    'SHP'

});


// ============================================================================
// 36. EXPORT ACCRETION
// ============================================================================

Export.table.toDrive({

  collection:
    accretion,

  description:
    'Ilaje_Accretion_' + exportSuffix,

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Accretion_' + exportSuffix,

  fileFormat:
    'SHP'

});


// ============================================================================
// 37. EXPORT 2023 REFERENCE SHORELINE
// ============================================================================

Export.table.toDrive({

  collection:
    shoreline2023Length,

  description:
    'Ilaje_2023_Reference_Shoreline',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_2023_Reference_Shoreline',

  fileFormat:
    'SHP'

});


// ============================================================================
// 38. EXPORT TRANSECTS
// ============================================================================

Export.table.toDrive({

  collection:
    transects,

  description:
    'Ilaje_100m_Shoreline_Transects',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_100m_Shoreline_Transects',

  fileFormat:
    'SHP'

});


// ============================================================================
// 39. END
// ============================================================================

print(
  '===================================================='
);

print(
  'ILAJE SHORELINE CHANGE ANALYSIS READY'
);

print(
  'Extracted years: ' + startYear + '-' + endYear + ' (every year)'
);

print(
  'Analysis years (edit in section 1 after inspecting the map): ',
  analysisYears
);

print(
  'Transect spacing: 100 m'
);

print(
  'Metrics: NSM, EPR, SCE, LRR'
);

print(
  '===================================================='
);
