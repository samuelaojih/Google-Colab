// ============================================================================
// ILAJE LGA SHORELINE CHANGE ANALYSIS
// 1986 - 2026
// ============================================================================
//
// STUDY AREA:
// projects/ee-samuelcoolsdk/assets/Ilaje
//
// EXISTING 2023 SHORELINE:
// projects/ee-samuelcoolsdk/assets/Ilaje_coastline
//
// METHODS:
// MNDWI-based Landsat shoreline extraction
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


// Years
var years = [
  1986,
  1996,
  2006,
  2016,
  2023,
  2026
];


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
// 9. LANDSAT 5
// ============================================================================

function getLandsat5(year) {

  var collection = ee.ImageCollection(
    'LANDSAT/LT05/C02/T1_L2'
  )

  .filterBounds(
    aoi
  )

  .filterDate(
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year + 1, 1, 1)
  )

  .filter(
    ee.Filter.lt(
      'CLOUD_COVER',
      cloudThreshold
    )
  )

  .map(
    maskLandsat
  );


  print(
    'Landsat 5 scenes - ' + year + ':',
    collection.size()
  );


  return collection.median();
}


// ============================================================================
// 10. LANDSAT 7
// ============================================================================

function getLandsat7(year) {

  var collection = ee.ImageCollection(
    'LANDSAT/LE07/C02/T1_L2'
  )

  .filterBounds(
    aoi
  )

  .filterDate(
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year + 1, 1, 1)
  )

  .filter(
    ee.Filter.lt(
      'CLOUD_COVER',
      cloudThreshold
    )
  )

  .map(
    maskLandsat
  );


  print(
    'Landsat 7 scenes - ' + year + ':',
    collection.size()
  );


  return collection.median();
}


// ============================================================================
// 11. LANDSAT 8
// ============================================================================

function getLandsat8(year) {

  var collection = ee.ImageCollection(
    'LANDSAT/LC08/C02/T1_L2'
  )

  .filterBounds(
    aoi
  )

  .filterDate(
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year + 1, 1, 1)
  )

  .filter(
    ee.Filter.lt(
      'CLOUD_COVER',
      cloudThreshold
    )
  )

  .map(
    maskLandsat
  );


  print(
    'Landsat 8 scenes - ' + year + ':',
    collection.size()
  );


  return collection.median();
}


// ============================================================================
// 12. LANDSAT 9
// ============================================================================

function getLandsat9(year) {

  var collection = ee.ImageCollection(
    'LANDSAT/LC09/C02/T1_L2'
  )

  .filterBounds(
    aoi
  )

  .filterDate(
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year + 1, 1, 1)
  )

  .filter(
    ee.Filter.lt(
      'CLOUD_COVER',
      cloudThreshold
    )
  )

  .map(
    maskLandsat
  );


  print(
    'Landsat 9 scenes - ' + year + ':',
    collection.size()
  );


  return collection.median();
}


// ============================================================================
// 13. PREPARE MNDWI BANDS
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

function prepare57(image) {

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


function prepare89(image) {

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
// 14. GET IMAGE FOR EACH YEAR
// ============================================================================

function getAnnualImage(year) {

  if (year <= 1999) {

    return prepare57(
      getLandsat5(year)
    );

  }


  if (year <= 2012) {

    return prepare57(
      getLandsat7(year)
    );

  }


  if (year <= 2021) {

    return prepare89(
      getLandsat8(year)
    );

  }


  // 2026
  var landsat8 = ee.ImageCollection(
    'LANDSAT/LC08/C02/T1_L2'
  )

  .filterBounds(aoi)

  .filterDate(
    '2026-01-01',
    '2027-01-01'
  )

  .filter(
    ee.Filter.lt(
      'CLOUD_COVER',
      cloudThreshold
    )
  )

  .map(
    maskLandsat
  )

  .map(
    prepare89
  );


  var landsat9 = ee.ImageCollection(
    'LANDSAT/LC09/C02/T1_L2'
  )

  .filterBounds(aoi)

  .filterDate(
    '2026-01-01',
    '2027-01-01'
  )

  .filter(
    ee.Filter.lt(
      'CLOUD_COVER',
      cloudThreshold
    )
  )

  .map(
    maskLandsat
  )

  .map(
    prepare89
  );


  print(
    'Landsat 8 scenes - 2026:',
    landsat8.size()
  );

  print(
    'Landsat 9 scenes - 2026:',
    landsat9.size()
  );


  return landsat8
    .merge(landsat9)
    .median();
}


// ============================================================================
// 15. EXTRACT SHORELINE FROM LANDSAT
// ============================================================================

function extractShoreline(year) {

  var image =
    getAnnualImage(year);


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
  // Display
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
// 16. EXTRACT HISTORICAL SHORELINES
// ============================================================================

var shoreline1986 =
  extractShoreline(
    1986
  );


var shoreline1996 =
  extractShoreline(
    1996
  );


var shoreline2006 =
  extractShoreline(
    2006
  );


var shoreline2016 =
  extractShoreline(
    2016
  );


var shoreline2026 =
  extractShoreline(
    2026
  );


// ============================================================================
// 17. CONVERT 2023 REFERENCE LINE TO POINTS
// ============================================================================
//
// We retain the original 2023 line for the baseline.
// Points are used only for intersection/position measurements.
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
// 18. CREATE 100-M TRANSECT ORIGIN POINTS
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
// 19. CREATE POINTS ALONG REFERENCE COASTLINE
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
// 20. CREATE MIDPOINTS
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
// 21. DISPLAY BASELINE POINTS
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
// 22. CREATE PERPENDICULAR TRANSECTS
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
// 23. CLIP TRANSECTS TO ILAJE
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
// 24. DISPLAY TRANSECTS
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
// 25. MEASURE DISTANCE FROM TRANSECT TO SHORELINE
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
// 26. MEASURE ALL SHORELINE POSITIONS
// ============================================================================

var measurements =
  addShorelineDistance(
    transects,
    shoreline1986,
    1986
  );


measurements =
  addShorelineDistance(
    measurements,
    shoreline1996,
    1996
  );


measurements =
  addShorelineDistance(
    measurements,
    shoreline2006,
    2006
  );


measurements =
  addShorelineDistance(
    measurements,
    shoreline2016,
    2016
  );


measurements =
  addShorelineDistance(
    measurements,
    shoreline2023Points,
    2023
  );


measurements =
  addShorelineDistance(
    measurements,
    shoreline2026,
    2026
  );


// ============================================================================
// 27. CALCULATE SHORELINE CHANGE
// ============================================================================

var results =
  measurements.map(
    function(feature) {

      var d86 =
        ee.Number(
          feature.get(
            'D_1986'
          )
        );

      var d96 =
        ee.Number(
          feature.get(
            'D_1996'
          )
        );

      var d06 =
        ee.Number(
          feature.get(
            'D_2006'
          )
        );

      var d16 =
        ee.Number(
          feature.get(
            'D_2016'
          )
        );

      var d23 =
        ee.Number(
          feature.get(
            'D_2023'
          )
        );

      var d26 =
        ee.Number(
          feature.get(
            'D_2026'
          )
        );


      // --------------------------------------------------------
      // NSM
      // --------------------------------------------------------

      var nsm8696 =
        d96.subtract(d86);

      var nsm9606 =
        d06.subtract(d96);

      var nsm0616 =
        d16.subtract(d06);

      var nsm1623 =
        d23.subtract(d16);

      var nsm2326 =
        d26.subtract(d23);

      var nsm8626 =
        d26.subtract(d86);


      // --------------------------------------------------------
      // EPR
      // --------------------------------------------------------

      var epr8696 =
        nsm8696.divide(10);

      var epr9606 =
        nsm9606.divide(10);

      var epr0616 =
        nsm0616.divide(10);

      var epr1623 =
        nsm1623.divide(7);

      var epr2326 =
        nsm2326.divide(3);

      var epr8626 =
        nsm8626.divide(40);


      // --------------------------------------------------------
      // SCE
      // --------------------------------------------------------

      var allDistances =
        ee.List([
          d86,
          d96,
          d06,
          d16,
          d23,
          d26
        ]);


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
      // LRR
      // --------------------------------------------------------

      var observationYears =
        ee.List([
          1986,
          1996,
          2006,
          2016,
          2023,
          2026
        ]);


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
            5
          ).map(
            function(i) {

              var x =
                ee.Number(
                  observationYears.get(i)
                )
                .subtract(
                  meanYear
                );


              var y =
                ee.Number(
                  allDistances.get(i)
                )
                .subtract(
                  meanDistance
                );


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
            5
          ).map(
            function(i) {

              var x =
                ee.Number(
                  observationYears.get(i)
                )
                .subtract(
                  meanYear
                );


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

          nsm8626.lt(-10),

          'Erosion',

          ee.Algorithms.If(

            nsm8626.gt(10),

            'Accretion',

            'Stable'

          )

        );


      // --------------------------------------------------------
      // RATE CLASS
      // --------------------------------------------------------

      var rateClass =
        ee.Algorithms.If(

          epr8626.lt(-5),

          'High erosion',

          ee.Algorithms.If(

            epr8626.lt(-1),

            'Moderate erosion',

            ee.Algorithms.If(

              epr8626.lt(1),

              'Stable',

              ee.Algorithms.If(

                epr8626.lt(5),

                'Moderate accretion',

                'High accretion'

              )

            )

          )

        );


      return feature.set({

        NSM_1986_1996_m:
          nsm8696,

        NSM_1996_2006_m:
          nsm9606,

        NSM_2006_2016_m:
          nsm0616,

        NSM_2016_2023_m:
          nsm1623,

        NSM_2023_2026_m:
          nsm2326,

        NSM_1986_2026_m:
          nsm8626,


        EPR_1986_1996_m_yr:
          epr8696,

        EPR_1996_2006_m_yr:
          epr9606,

        EPR_2006_2016_m_yr:
          epr0616,

        EPR_2016_2023_m_yr:
          epr1623,

        EPR_2023_2026_m_yr:
          epr2326,

        EPR_1986_2026_m_yr:
          epr8626,


        SCE_m:
          sce,

        LRR_m_yr:
          lrr,

        Overall_Change:
          overall,

        Rate_Class:
          rateClass

      });

    }
  );


// ============================================================================
// 28. KEEP ONLY COMPLETE TRANSECTS
// ============================================================================

var validResults =
  results.filter(
    ee.Filter.notNull([
      'D_1986',
      'D_1996',
      'D_2006',
      'D_2016',
      'D_2023',
      'D_2026'
    ])
  );


print(
  '===================================================='
);

print(
  'TRANSECT RESULTS'
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
// 29. CLASSIFICATION
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
// 30. DISPLAY EROSION
// ============================================================================

Map.addLayer(
  erosion.style({
    color: 'red',
    width: 3
  }),
  {},
  'Erosion 1986-2026',
  false
);


// ============================================================================
// 31. DISPLAY ACCRETION
// ============================================================================

Map.addLayer(
  accretion.style({
    color: '00FF00',
    width: 3
  }),
  {},
  'Accretion 1986-2026',
  false
);


// ============================================================================
// 32. DISPLAY STABLE
// ============================================================================

Map.addLayer(
  stable.style({
    color: 'FFFFFF',
    width: 2
  }),
  {},
  'Stable 1986-2026',
  false
);


// ============================================================================
// 33. PRINT CLASS COUNTS
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
// 34. STATISTICS FUNCTION
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
// 35. OVERALL NSM STATISTICS
// ============================================================================

statistics(
  validResults,
  'NSM_1986_2026_m',
  'NSM 1986-2026 statistics'
);


// ============================================================================
// 36. OVERALL EPR STATISTICS
// ============================================================================

statistics(
  validResults,
  'EPR_1986_2026_m_yr',
  'EPR 1986-2026 statistics'
);


// ============================================================================
// 37. LRR STATISTICS
// ============================================================================

statistics(
  validResults,
  'LRR_m_yr',
  'LRR 1986-2026 statistics'
);


// ============================================================================
// 38. SCE STATISTICS
// ============================================================================

statistics(
  validResults,
  'SCE_m',
  'SCE 1986-2026 statistics'
);


// ============================================================================
// 39. PERIOD STATISTICS
// ============================================================================

statistics(
  validResults,
  'EPR_1986_1996_m_yr',
  'EPR 1986-1996'
);


statistics(
  validResults,
  'EPR_1996_2006_m_yr',
  'EPR 1996-2006'
);


statistics(
  validResults,
  'EPR_2006_2016_m_yr',
  'EPR 2006-2016'
);


statistics(
  validResults,
  'EPR_2016_2023_m_yr',
  'EPR 2016-2023'
);


statistics(
  validResults,
  'EPR_2023_2026_m_yr',
  'EPR 2023-2026'
);


// ============================================================================
// 40. EXPORT COMPLETE RESULTS
// ============================================================================

Export.table.toDrive({

  collection:
    validResults,

  description:
    'Ilaje_Shoreline_Change_1986_2026',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Shoreline_Change_1986_2026',

  fileFormat:
    'SHP'

});


// ============================================================================
// 41. EXPORT CSV
// ============================================================================

Export.table.toDrive({

  collection:
    validResults,

  description:
    'Ilaje_Shoreline_Change_1986_2026_CSV',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Shoreline_Change_1986_2026',

  fileFormat:
    'CSV'

});


// ============================================================================
// 42. EXPORT EROSION
// ============================================================================

Export.table.toDrive({

  collection:
    erosion,

  description:
    'Ilaje_Erosion_1986_2026',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Erosion_1986_2026',

  fileFormat:
    'SHP'

});


// ============================================================================
// 43. EXPORT ACCRETION
// ============================================================================

Export.table.toDrive({

  collection:
    accretion,

  description:
    'Ilaje_Accretion_1986_2026',

  folder:
    'Ilaje_Shoreline_Analysis',

  fileNamePrefix:
    'Ilaje_Accretion_1986_2026',

  fileFormat:
    'SHP'

});


// ============================================================================
// 44. EXPORT 2023 REFERENCE SHORELINE
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
// 45. EXPORT TRANSECTS
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
// 46. END
// ============================================================================

print(
  '===================================================='
);

print(
  'ILAJE SHORELINE CHANGE ANALYSIS READY'
);

print(
  'Reference year: 2023'
);

print(
  'Historical years: 1986, 1996, 2006, 2016'
);

print(
  'Current year: 2026'
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
