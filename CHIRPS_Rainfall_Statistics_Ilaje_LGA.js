// ==============================================================
// CHIRPS ANNUAL RAINFALL STATISTICS - ILAJE LGA
// Google Earth Engine Code Editor (JavaScript) script
// Zonal Max / Min / Std Dev / Mean of Annual Rainfall Totals
// ==============================================================
//
// What this script does:
// 1. Loads the study area asset (Ilaje LGA) as the region of interest
// 2. Loads CHIRPS Daily rainfall data (UCSB-CHG/CHIRPS/DAILY)
// 3. For each target year, sums daily rainfall into an annual total
//    rainfall image (mm/year) per pixel
// 4. Computes zonal statistics (max, min, mean, std dev) of that
//    annual total across the study area
// 5. Prints the results as a table and a chart, and exports the
//    table to a CSV in Google Drive
//
// Target years: 1986, 1996, 2006, 2016, 2026
// Note: CHIRPS Daily data starts in 1981, so 1986-2016 are complete
// calendar years. 2026 is the current year at time of writing, so its
// annual total will only reflect the days available in the CHIRPS
// archive so far (CHIRPS also has ~1-2 months of processing latency).
// ==============================================================

// ---------------------------------------------------------------
// STEP 1: STUDY AREA
// ---------------------------------------------------------------
var studyArea = ee.FeatureCollection('projects/ee-samuelcoolsdk/assets/Ilaje_LGA');
var roi = studyArea.geometry();

Map.centerObject(roi, 10);
Map.addLayer(roi, {color: 'red'}, 'Ilaje LGA');

// ---------------------------------------------------------------
// STEP 2: CHIRPS COLLECTION AND TARGET YEARS
// ---------------------------------------------------------------
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY');
var chirpsScale = 5566; // native CHIRPS resolution (~0.05 deg) in meters
var targetYears = [1986, 1996, 2006, 2016, 2026];

// ---------------------------------------------------------------
// STEP 3: FUNCTION TO COMPUTE ANNUAL RAINFALL ZONAL STATISTICS
// ---------------------------------------------------------------
function getAnnualRainfallStats(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var annualCollection = chirps.filterDate(start, end).filterBounds(roi);

  // Annual total rainfall (mm/year) per pixel
  var annualTotal = annualCollection.select('precipitation').sum().clip(roi);

  var reducers = ee.Reducer.minMax()
    .combine({reducer2: ee.Reducer.mean(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true});

  var stats = annualTotal.reduceRegion({
    reducer: reducers,
    geometry: roi,
    scale: chirpsScale,
    maxPixels: 1e13,
    bestEffort: true
  });

  return ee.Feature(null, {
    year: year,
    images_used: annualCollection.size(),
    max_mm: stats.get('precipitation_max'),
    min_mm: stats.get('precipitation_min'),
    mean_mm: stats.get('precipitation_mean'),
    std_mm: stats.get('precipitation_stdDev')
  });
}

// ---------------------------------------------------------------
// STEP 4: RUN FOR EACH TARGET YEAR
// ---------------------------------------------------------------
var resultsFc = ee.FeatureCollection(targetYears.map(getAnnualRainfallStats));

print('CHIRPS Annual Rainfall Stats - Ilaje LGA', resultsFc);

// Bar chart of mean annual rainfall by year
var chart = ui.Chart.feature.byFeature(resultsFc, 'year', ['mean_mm'])
  .setChartType('ColumnChart')
  .setOptions({
    title: 'CHIRPS Mean Annual Rainfall - Ilaje LGA',
    hAxis: {title: 'Year'},
    vAxis: {title: 'Mean Annual Rainfall (mm)'},
    legend: {position: 'none'}
  });
print(chart);

// ---------------------------------------------------------------
// STEP 5: EXPORT RESULTS TABLE TO DRIVE
// ---------------------------------------------------------------
Export.table.toDrive({
  collection: resultsFc,
  description: 'Ilaje_LGA_CHIRPS_Annual_Rainfall_Stats',
  fileNamePrefix: 'Ilaje_LGA_CHIRPS_Annual_Rainfall_Stats',
  fileFormat: 'CSV'
});

// NOTE: 2026's row will be a partial-year total, not a full calendar
// year - check "images_used" (day count) to see how much of the year
// is actually covered by CHIRPS so far. Run Export.table.toDrive from
// the Tasks tab to generate the CSV.
