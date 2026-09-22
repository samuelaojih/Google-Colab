/*******************************************************************************************************
 * Flood Detection and Monitoring System (FDMS) - Nigeria Edition
 *
 * Ported from a US-focused GEE flood app (originally built around USDA NAIP, USDA NASS CDL,
 * USGS 3DEP 10m DEM, and US Census TIGER states/counties). This version replaces every
 * US-only dataset with a global equivalent so the same SAR + optical flood-detection engine
 * (Sentinel-1 SAR, Sentinel-2 / Landsat 8-9 MNDWI, JRC Global Surface Water, GHSL population/
 * built-up/settlement) runs over Nigeria instead.
 *
 * Substitutions made:
 *   - US states (TIGER/2018/States)      -> FAO/GAUL/2015/level1, filtered to Nigeria (36 states + FCT)
 *   - US counties (TIGER/2018/Counties)  -> FAO/GAUL/2015/level2, filtered to Nigeria (774 LGAs)
 *   - USDA NASS CDL (crop-type layer)    -> ESA WorldCover v200 (2021, 10m global land cover).
 *         NOTE: there is no free, GEE-hosted, per-crop-type dataset with CDL-like granularity
 *         (maize/cassava/rice/sorghum/etc.) for Nigeria. The "crop impact assessment" panel is
 *         kept, but it now reports flooded LAND COVER classes (cropland, built-up, grassland,
 *         wetland, mangrove, forest, etc.) rather than individual crop species.
 *   - USDA NAIP (US-only high-res aerial)-> removed (no global free equivalent in GEE).
 *   - USGS 3DEP 10m DEM (US-only)        -> USGS/SRTMGL1_003, global 30m SRTM DEM.
 *   - NHD WBDHU12/14 (California-only)   -> removed. WWF HydroSHEDS Free Flowing Rivers is kept
 *         as-is since it is already global and covers the Niger/Benue river systems.
 *
 * Everything else (Sentinel-1 GRD, Sentinel-2 SR, Landsat 8/9 SR, JRC GSW, GHSL settlement/
 * built-up/population, the ATD/RTD/Ratio/Z-score/Modified-Z-score flood algorithms, and the
 * flood-depth estimation logic) is dataset-agnostic and required no change beyond re-centering
 * the map on Nigeria.
 *******************************************************************************************************/

var settlement = ui.import && ui.import("settlement", "imageCollection", {
      "id": "JRC/GHSL/P2016/SMOD_POP_GLOBE_V1"
    }) || ee.ImageCollection("JRC/GHSL/P2016/SMOD_POP_GLOBE_V1"),
    builtup = ui.import && ui.import("builtup", "image", {
      "id": "JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1"
    }) || ee.Image("JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1"),
    population = ui.import && ui.import("population", "imageCollection", {
      "id": "JRC/GHSL/P2016/POP_GPW_GLOBE_V1"
    }) || ee.ImageCollection("JRC/GHSL/P2016/POP_GPW_GLOBE_V1"),
    builtupVis = ui.import && ui.import("builtupVis", "imageVisParam", {
      "params": {
        "min": 1,
        "max": 6,
        "palette": [
          "0c1d60",
          "000000",
          "448564",
          "70daa4",
          "83ffbf",
          "ffffff"
        ]
      }
    }) || {"min":1,"max":6,"palette":["0c1d60","000000","448564","70daa4","83ffbf","ffffff"]},
    settleVis = ui.import && ui.import("settleVis", "imageVisParam", {
      "params": {
        "min": 0,
        "max": 3,
        "palette": [
          "000000",
          "448564",
          "70daa4",
          "ffffff"
        ]
      }
    }) || {"min":0,"max":3,"palette":["000000","448564","70daa4","ffffff"]},
    countries = ui.import && ui.import("countries", "table", {
      "id": "USDOS/LSIB_SIMPLE/2017"
    }) || ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017"),
    rivers = ui.import && ui.import("rivers", "table", {
      "id": "WWF/HydroSHEDS/v1/FreeFlowingRivers"
    }) || ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers"),
    dem = ui.import && ui.import("dem", "image", {
      "id": "USGS/SRTMGL1_003"
    }) || ee.Image("USGS/SRTMGL1_003"),
    surfaceWater = ui.import && ui.import("surfaceWater", "image", {
      "id": "JRC/GSW1_3/GlobalSurfaceWater"
    }) || ee.Image("JRC/GSW1_3/GlobalSurfaceWater"),
    landsat9_l2t1 = ui.import && ui.import("landsat9_l2t1", "imageCollection", {
      "id": "LANDSAT/LC09/C02/T1_L2"
    }) || ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"),
    landsat8_l2t1 = ui.import && ui.import("landsat8_l2t1", "imageCollection", {
      "id": "LANDSAT/LC08/C02/T1_L2"
    }) || ee.ImageCollection("LANDSAT/LC08/C02/T1_L2"),
    sentinel2_sr = ui.import && ui.import("sentinel2_sr", "imageCollection", {
      "id": "COPERNICUS/S2_SR_HARMONIZED"
    }) || ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED"),
    sentinel2_clouds = ui.import && ui.import("sentinel2_clouds", "imageCollection", {
      "id": "COPERNICUS/S2_CLOUD_PROBABILITY"
    }) || ee.ImageCollection("COPERNICUS/S2_CLOUD_PROBABILITY"),
    populationCountVis = ui.import && ui.import("populationCountVis", "imageVisParam", {
      "params": {
        "min": 0,
        "max": 200,
        "palette": [
          "FFF8DC","FFEBCD","FFE4C4","FFDEAD","F5DEB3","DEB887","D2B48C","BC8F8F","F4A460","DAA520",
          "B8860B","CD853F","D2691E","8B4513","A0522D","A52A2A","800000"
        ]
      }
    }) || {"min":0,"max":200,"palette":["FFF8DC","FFEBCD","FFE4C4","FFDEAD","F5DEB3","DEB887","D2B48C","BC8F8F","F4A460","DAA520","B8860B","CD853F","D2691E","8B4513","A0522D","A52A2A","800000"]};

//////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// Nigeria administrative boundaries and land cover setup //////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////
// FAO GAUL 2015 is used instead of US Census TIGER. Field names differ from TIGER:
//   TIGER 'NAME'      -> GAUL level1 'ADM1_NAME' (state), GAUL level2 'ADM2_NAME' (LGA)
//   TIGER 'STATEFP'   -> GAUL 'ADM1_CODE'
// Variable names (us_states, counties, STATEFP-derived vars) are kept from the original script to
// minimize downstream edits; they now hold Nigerian GAUL features instead of US TIGER features.

var nigeria_boundary = ee.FeatureCollection("FAO/GAUL/2015/level0")
                          .filter(ee.Filter.eq('ADM0_NAME', 'Nigeria'));

var us_states = ee.FeatureCollection("FAO/GAUL/2015/level1")
                  .filter(ee.Filter.eq('ADM0_NAME', 'Nigeria'));          // Nigeria's 36 states + FCT

var counties = ee.FeatureCollection("FAO/GAUL/2015/level2")
                  .filter(ee.Filter.eq('ADM0_NAME', 'Nigeria'));          // Nigeria's 774 LGAs

// ESA WorldCover replaces USDA NASS CDL. It is a single global 10m land-cover snapshot (2021),
// not an annual crop-type time series, so there is no per-year matching logic like CDL had.
var worldcover_legend = {
  10  : 'Trees',
  20  : 'Shrubland',
  30  : 'Grassland',
  40  : 'Cropland',
  50  : 'Built-up',
  60  : 'Bare / sparse vegetation',
  70  : 'Snow and ice',
  80  : 'Permanent water bodies',
  90  : 'Herbaceous wetland',
  95  : 'Mangroves',
  100 : 'Moss and lichen'
};
var lgd = ee.Dictionary(worldcover_legend);
var crop_values = lgd.keys();

var worldcover_img = ee.ImageCollection("ESA/WorldCover/v200").first()
                       .select('Map').rename('cropland');   // renamed 'cropland' so downstream
                                                              // reduceRegion(...).get('cropland')
                                                              // calls keep working unmodified.

//////////////////////////////////////////////////////////////////////////////////////////////////////


var water_s2_l89_postEvent = ee.Image();
var water_s2_l89_preEvent = ee.Image();

var state_name = '';
var state_FP_selected = '';                 // now holds a GAUL ADM1_CODE, not a TIGER STATEFP
var state_selected = nigeria_boundary;       // default AOI: all of Nigeria until a state is picked

var AOI = state_selected;

var empty = ee.Image().byte();

var aoi_lyr = ui.Map.Layer;

var county_name = 'Not selected';            // "county" == Nigerian LGA throughout this script
var county_selected = counties.first();

var ndwiViz = {min: -1, max:1, palette:['EE6C12', 'EE8D12', 'EECD12', '1215EE']};

var event_end_date = ee.Date(Date.now());
var event_start_date = event_end_date.advance(-7, 'day');

var normal_end_date = event_end_date.advance(-1, 'year');
var normal_start_date = event_start_date.advance(-1, 'year');

event_start_date = event_start_date.format('YYYY-MM-dd');
event_end_date = event_end_date.format('YYYY-MM-dd');
print('Default event start and end dates:', event_start_date, event_end_date);

normal_start_date = normal_start_date.format('YYYY-MM-dd');
normal_end_date = normal_end_date.format('YYYY-MM-dd');
print('Default normal start and end dates:', normal_start_date, normal_end_date);

var threshold_vv = -17;       /// Tian et al., 2017, Dynamic Monitoring of the Largest Freshwater Lake in China Using a New Water Index Derived from High Spatiotemporal Resolution Sentinel-1A Data, Remote Sensing, 9, 521; doi:10.3390/rs9060521
var threshold_vh = -23;       /// Tian et al., 2017, Dynamic Monitoring of the Largest Freshwater Lake in China Using a New Water Index Derived from High Spatiotemporal Resolution Sentinel-1A Data, Remote Sensing, 9, 521; doi:10.3390/rs9060521

var focal_radius = 50;   ///////// in meter
var CLOUD_FILTER = 50;   ///////// in %
var slope_threshold = 5;  ////// in degree, 5 degree tan(5) = 0.0874, Mask out areas with more than 8.74% slope using DEM
var resolution = 30;

var cdl_year = '2021 (ESA WorldCover v200)';

var option_name = 'Use pre-event images';
var algorithm_name = 'Absolute Threshold Differencing (ATD)';
var assessment_option = 'Full flood extent';
var flood_layer_name = '';
var inundated_crop_layer_name = '';


/////////////////////////// WWF HydroSHEDS Free Flowing Rivers Network v1 (global, covers Niger/Benue) //////////////
//Map.addLayer(rivers, {}, "Free Flowing Rivers");


// Define a hillshade layer from the digital elevation model, and then blend with SAR anomaly composite.
var hillshade = ee.Terrain.hillshade(dem.multiply(2)); // Exaggerate the elevation to increase contrast in hillshade.
var slope = ee.Terrain.slope(dem);

var shp_us_states = ee.FeatureCollection(us_states);
var shp_us_counties = ee.FeatureCollection(counties);

var states_outline_lyr = ui.Map.Layer();
var counties_outline_lyr = ui.Map.Layer();
var state_outline_lyr = ui.Map.Layer();
var county_outline_lyr = ui.Map.Layer();

var river_lyr = ui.Map.Layer();
var degreeOfUrbanization_lyr = ui.Map.Layer();
var builtUpMultitemporal_lyr = ui.Map.Layer();
var population_lyr = ui.Map.Layer();

var elev_lyr = ui.Map.Layer();

var composite_post_event_asc_lyr = ui.Map.Layer();
var composite_post_event_des_lyr = ui.Map.Layer();
var composite_pre_event_asc_lyr = ui.Map.Layer();
var composite_pre_event_des_lyr = ui.Map.Layer();
var composite_anomaly_asc_lyr = ui.Map.Layer();
var composite_anomaly_des_lyr = ui.Map.Layer();

var s2_mndwi_Xu_postEvent_lyr = ui.Map.Layer();
var l89_mndwi_Xu_postEvent_lyr = ui.Map.Layer();
var multiSensor_mndwi_Xu_postEvent_lyr = ui.Map.Layer();

var flood_asc_des_lyr = ui.Map.Layer();
var flood_asc_des_lyr2 = ui.Map.Layer();
var flood_s2_l89_lyr = ui.Map.Layer();
var flood_sar_optical_lyr = ui.Map.Layer();
var inundated_cropland_lyr = ui.Map.Layer();
var inundated_terrain_lyr = ui.Map.Layer();
var clicked_floodPoly_lyr = ui.Map.Layer();


var crop_img = ee.Image();
var cultivated_img = ee.Image();
var crop_yyyy = ee.Image();

var flood_depth_col = ee.ImageCollection([]);
var s2Col_postEvent = ee.ImageCollection([]);
var s2Col_preEvent = ee.ImageCollection([]);
var l89Col_postEvent = ee.ImageCollection([]);
var l89Col_preEvent = ee.ImageCollection([]);
var multiSensor_mndwi_Xu_postEvent_Col = ee.ImageCollection([]);
var multiSensor_mndwi_Xu_preEvent_Col = ee.ImageCollection([]);

var VV_baseline_image_asc = ee.Image();
var VH_baseline_image_asc = ee.Image();
var VV_baseline_image_des = ee.Image();
var VH_baseline_image_des = ee.Image();

var flood_depth = ee.Image();
var flood_depth_unmasked = dem.multiply(0).add(-9999).rename('flood_depth');

var s2_mndwi_Xu_preEvent = ee.Image();
var s2_mndwi_Xu_postEvent = ee.Image();
var s2_mndwi_Xu_preEvent_unmasked = dem.multiply(0).add(9999).rename('mndwi');
var s2_mndwi_Xu_postEvent_unmasked = dem.multiply(0).add(9999).rename('mndwi');
var s2_b8_postEvent_unmasked = dem.multiply(0).add(-9999).rename('nir');
var s2_b8_preEvent_unmasked = dem.multiply(0).add(-9999).rename('nir');

var l89_mndwi_Xu_preEvent = ee.Image();
var l89_mndwi_Xu_postEvent = ee.Image();
var l89_mndwi_Xu_preEvent_unmasked = dem.multiply(0).add(9999).rename('mndwi');
var l89_mndwi_Xu_postEvent_unmasked = dem.multiply(0).add(9999).rename('mndwi');
var l89_b5_postEvent_unmasked = dem.multiply(0).add(-9999).rename('nir');
var l89_b5_preEvent_unmasked = dem.multiply(0).add(-9999).rename('nir');

var multiSensor_mndwi_Xu_preEvent = ee.Image();
var multiSensor_mndwi_Xu_postEvent = ee.Image();
var multiSensor_mndwi_Xu_preEvent_unmasked = dem.multiply(0).add(9999).rename('mndwi');
var multiSensor_mndwi_Xu_postEvent_unmasked = dem.multiply(0).add(9999).rename('mndwi');
var multiSensor_nir_preEvent_unmasked = dem.multiply(0).add(9999).rename('nir');
var multiSensor_nir_postEvent_unmasked = dem.multiply(0).add(9999).rename('nir');

var VH_flood_asc = ee.Image();
var VH_flood_des = ee.Image();
var connections = ee.Image();

var flood_all_models2 = ee.Image();
var inundated_cropland = ee.Image();
var crops_for_assessment  = ee.Image();
var inundated_terrain = ee.Image();

var s2_b8_postEvent = ee.Image();
var s2_b8_preEvent = ee.Image();
var multiSensor_nir_preEvent = ee.Image();
var multiSensor_nir_postEvent = ee.Image();

var l89_b5_postEvent = ee.Image();
var l89_b5_preEvent = ee.Image();

var flood_polygons = AOI;

var Button_removeDashboard = ui.Button();
var Button_removeReport = ui.Button();
var assessmentPanel = ui.Panel();
var dashboardPanel = ui.Panel();
var legend_floodDepth = ui.Panel();

var number_legend_called = 0;
////////////////////////////////////// Create a continous legend for a layer ////////////////////////////////////////
function createLegend (titleText, palette, min, max) {
  var title = ui.Label({
    value: titleText,
    style: {fontWeight: 'bold', textAlign: 'center', stretch: 'horizontal'}});

  var legend = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '200x20',
      format: 'png',
      min: 0, max: 1,
      palette: palette},
    style: {stretch: 'horizontal', margin: '8px 8px', maxHeight: '40px'},
  });

  var labels = ui.Panel({
    widgets: [
      ui.Label(min, {margin: '4px 10px',textAlign: 'left', stretch: 'horizontal'}),
      ui.Label((min+max)/2, {margin: '4px 20px', textAlign: 'center', stretch: 'horizontal'}),
      ui.Label(max, {margin: '4px 10px',textAlign: 'right', stretch: 'horizontal'})],
    layout: ui.Panel.Layout.flow('horizontal')});

  var legendPanel = ui.Panel({
    widgets: [title, legend, labels],
    style: {position: 'bottom-left', padding: '8px 15px'}
  });

  number_legend_called += 1;
  return legendPanel;
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////

var get_crop_layer = function () {
  return worldcover_img;    ///// single-epoch (2021) global land cover; no year matching needed
};

var get_cultivated_layer = function () {
  return worldcover_img;
};

var crop_2023 = worldcover_img;    ///// kept as a variable name for structural compatibility with
                                    ///// downstream code that queries a "current" land cover layer.

var crop_2023_lyr = ui.Map.Layer(worldcover_img).setName('ESA WorldCover 2021');

var fd_depth_lyr = ui.Map.Layer();
var s2_rgb = ee.Image();

var s2_rgb_before_lyr = ui.Map.Layer();
var s2_rgb_after_lyr = ui.Map.Layer();

var l89_rgb_before = ee.Image();
var l89_rgb_after = ee.Image();


/////////////////////////////  Landsat 8 and 9 processing //////////////////////////////////////

function maskClouds(image) {
  var cloudShadowBitMask = (1 << 3);
  var cloudsBitMask = (1 << 5);
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
                 .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return image.updateMask(mask);
}

var processedCol = function applyScaleFactors(image) {
  return image.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
              .multiply(0.0000275).add(-0.2).toFloat()
              .set('system:time_end', image.get('system:time_end'))
              .set('date', ee.Date(image.get('system:time_end')));
};

function get_l89_sr_cloudMask_col(start, end, aoi) {
  var lansat9_Col = landsat9_l2t1.filterDate(start, end)
                                 .filterBounds(aoi)
                                 .filter(ee.Filter.lt('CLOUD_COVER', CLOUD_FILTER))
                                 .map(maskClouds)
                                 .map(processedCol);

  var lansat8_Col = landsat8_l2t1.filterDate(start, end)
                                 .filterBounds(aoi)
                                 .filter(ee.Filter.lt('CLOUD_COVER', CLOUD_FILTER))
                                 .map(maskClouds)
                                 .map(processedCol);

  var landsat_89Col = lansat9_Col.merge(lansat8_Col);
  return landsat_89Col.sort('system:time_end');
}


/////////////// Get Sentinel-2 surface reflectance images with cloud mask ////////////////

var get_s2_sr_cloudMask_col = function (start, end, aoi) {

  var s2Sr = sentinel2_sr.filterBounds(aoi).filter(ee.Filter.lt('CLOUD_COVERAGE_ASSESSMENT', CLOUD_FILTER));
  var s2Clouds = sentinel2_clouds.filterBounds(aoi);

  var MAX_CLOUD_PROBABILITY = 65;

  function maskClouds(img) {
    var clouds = ee.Image(img.get('cloud_mask')).select('probability');
    var isNotCloud = clouds.lt(MAX_CLOUD_PROBABILITY);
    return img.updateMask(isNotCloud);
  }

  function maskEdges(s2_img) {
    return s2_img.updateMask(
        s2_img.select('B8A').mask().updateMask(s2_img.select('B9').mask()));
  }

  var criteria = ee.Filter.and(ee.Filter.date(start, end));
  s2Sr = s2Sr.filter(criteria).map(maskEdges);
  s2Clouds = s2Clouds.filter(criteria);

  var s2SrWithCloudMask = ee.Join.saveFirst('cloud_mask').apply({
    primary: s2Sr,
    secondary: s2Clouds,
    condition: ee.Filter.equals({leftField: 'system:index', rightField: 'system:index'})
  });

  var s2CloudMasked = ee.ImageCollection(s2SrWithCloudMask).map(maskClouds)
                                                           .map(function(img) {
                                                             return img.divide(10000);
                                                           });
  return s2CloudMasked;
};


function sentinel1Col (start, end, aoi, direction, pol) {
  return ee.ImageCollection('COPERNICUS/S1_GRD')
                    .filterDate(start, end)
                    .filter(ee.Filter.eq('instrumentMode', 'IW'))
                    .filter(ee.Filter.eq('orbitProperties_pass', direction))
                    .filterBounds(aoi)
                    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', pol))
                    .select(pol)
                    .map(function(image) {
                      var edge = image.lt(-49.0);
                      var maskedImage = image.mask().and(edge.not());
                      return image.updateMask(maskedImage);
                    });
}


////////// Calculate SWI ///////////////////////////////
function get_swi (img_vv, img_vh){
    var swi_part1 = ee.Image(0.1747).multiply(img_vv);
    var swi_part2 = ee.Image(0.0082).multiply(img_vv).multiply(img_vh);
    var swi_part3 = ee.Image(0.0023).multiply(img_vv).multiply(img_vv);
    var swi_part4 = ee.Image(-0.0015).multiply(img_vh).multiply(img_vh);
    return swi_part1.add(swi_part2).add(swi_part3).add(swi_part4).add(ee.Image(0.1904)).rename('SWI');
}

var swater = surfaceWater.select('occurrence').gte(70);
var swater_mask = swater.updateMask(swater);
var swater_mask_lyr = swater_mask.visualize({palette:"orange"});
swater_mask_lyr = ui.Map.Layer(swater_mask_lyr).setName('JRC Global Surface Water');


//////////// Refine flood pixels by masking out permanent water and other  ////////////
function refine_flood (tmp_water) {
  tmp_water = tmp_water.where(swater_mask, 0);
  tmp_water = tmp_water.updateMask(tmp_water);
  return tmp_water.updateMask(slope.lt(slope_threshold));
}

//////////////////////////// Remove false alarm floods such as "harvested lands ////////////////"
function refine_flood2 (tmp_water) {
  tmp_water = tmp_water.updateMask(multiSensor_mndwi_Xu_postEvent_unmasked.gt(0.1));
  return tmp_water.updateMask(tmp_water);
}


/*
 * Map layer (mapPanel) configuration
 */
var mapPanel = ui.Map().setOptions('SATELLITE');
mapPanel.setControlVisibility(
    {all: true, zoomControl: true, mapTypeControl: true, drawingToolsControl: true});
mapPanel.setCenter(8.6753, 9.0820, 6);  //// Nigeria

var layers = mapPanel.layers();


function show_errorMessage() {
  var Panel_errorMessage = ui.Panel();
  var label_errorMessage = ui.Label('No image available for your specified date range :(');
  var Button_removeErrormessage = ui.Button({
    label: 'OK',
    onClick: function() {
      Panel_errorMessage.widgets().remove(label_errorMessage);
      Panel_errorMessage.widgets().remove(Button_removeErrormessage);
      mapPanel.widgets().remove(Panel_errorMessage);
    }
  });

  Panel_errorMessage.add(label_errorMessage);
  Panel_errorMessage.add(Button_removeErrormessage);
  mapPanel.add(Panel_errorMessage);
}


/////////////////////////////Panel setup////////////////////////////////////
var Panel = ui.Panel({style: {width: '20%'}});

var intro = ui.Panel([
  ui.Label({
    value: 'Flood Detection and Monitoring System (FDMS) - Nigeria',
    style: {fontSize: '20px', fontWeight: 'bold', color: 'blue'}
  }),
  ui.Label('This app was designed for near-real time flood extent mapping and depth estimation from ESA Copernicus Sentinel-1 C-band ' +
           'SAR imagery and a global 30m SRTM DEM, adapted for Nigeria. Maximum flood inundation conditions are reflected for ' +
           'specified time windows. ESA WorldCover (2021, global 10m land cover) is integrated for land cover impact assessment ' +
           '(cropland, built-up, wetland, mangrove, etc.), since a per-crop-species dataset comparable to USDA NASS CDL is not ' +
           'available for Nigeria in Earth Engine.'
           , {fontSize: '11px'})
]);
Panel.add(intro);


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Add a dropdown menu for states ///////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////

var Label_assessment = ui.Panel([
  ui.Label({
    value: 'Region of Interest',
    style: {fontSize: '14px', fontWeight: 'bold', color: 'red'}
  }),
]);
Panel.add(Label_assessment);

var Label_selectState = ui.Label({value: 'Select a state:',
                                  style: {fontSize: '12px'}
});

var dropdown_menu_states = ui.Select({
                                      placeholder: ' ',
                                      style: {width: '100px'}
                                      });

var statesNames = us_states.aggregate_array('ADM1_NAME').sort();
statesNames = statesNames.insert(0, ' ');

statesNames.evaluate(function(states){
  dropdown_menu_states.items().reset(states);
  dropdown_menu_states.style().set({width: '200px',});
});

var Panel_selectState = ui.Panel({
  widgets: [Label_selectState, dropdown_menu_states],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_selectState);

dropdown_menu_states.onChange(function(callback) {
  state_name = dropdown_menu_states.getValue();
  print('State name', state_name);
  layers.remove(state_outline_lyr);
  layers.remove(county_outline_lyr);

  if (state_name === ' ') {
    AOI = nigeria_boundary;
  } else {

    state_selected = us_states.filterMetadata('ADM1_NAME', 'equals', state_name);

    AOI = state_selected;

    var polygonCentroid = state_selected.geometry().centroid({'maxError': 1});
    mapPanel.setCenter(polygonCentroid.coordinates().get(0).getInfo(),
                       polygonCentroid.coordinates().get(1).getInfo(), 8);

    var state_outline = empty.paint({featureCollection: state_selected, color: 1, width: 3})
                             .visualize({palette: 'cyan'});
    state_outline_lyr = ui.Map.Layer(state_outline).setName(state_name);
    layers.add(state_outline_lyr);


    //////////// Find ADM1_CODE by state name ////////////////////////
    var statefp_list = state_selected.reduceColumns(ee.Reducer.toList(), ['ADM1_CODE']).get('list');
    print('adm1_code_list', statefp_list);
    state_FP_selected = ee.List(statefp_list).get(0);
    print('ADM1_CODE', state_FP_selected);


    //////////// Query LGAs by ADM1_CODE ////////////////////////
    shp_us_counties = counties.filter(ee.Filter.eq('ADM1_CODE', state_FP_selected));
    var countyNames = shp_us_counties.reduceColumns(ee.Reducer.toList(), ['ADM2_NAME']).get('list');
    countyNames = ee.List(countyNames).sort();
    countyNames = countyNames.insert(0, ' ');

    countyNames.evaluate(function(county){
      dropdown_menu_counties.items().reset(county);
    });

  }

});



/////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Add a dropdown menu for LGAs (local government areas) //////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////

var Label_selectCounty = ui.Label({value: 'Select an LGA (optional):',
                                  style: {fontSize: '12px'}
});

var dropdown_menu_counties = ui.Select({
                                        placeholder: ' ',
                                      });
dropdown_menu_counties.style().set({width: '100px',});

var Panel_selectCounty = ui.Panel({
  widgets: [Label_selectCounty, dropdown_menu_counties],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_selectCounty);

dropdown_menu_counties.onChange(function(callback) {
  county_name = dropdown_menu_counties.getValue();
  print('LGA name', county_name);

  layers.remove(county_outline_lyr);

  if (county_name === ' ') {
    AOI = state_selected;
  } else {

    county_selected = counties.filterMetadata('ADM1_CODE', 'equals', state_FP_selected)
                              .filterMetadata('ADM2_NAME', 'equals', county_name);

    AOI = county_selected;

    var polygonCentroid = county_selected.geometry().centroid({'maxError': 1});
    mapPanel.setCenter(polygonCentroid.coordinates().get(0).getInfo(),
                       polygonCentroid.coordinates().get(1).getInfo(), 11);

    var county_outline = empty.paint({featureCollection: county_selected, color: 1, width: 3})
                              .visualize({palette: 'cyan'});
    county_outline_lyr = ui.Map.Layer(county_outline).setName(county_name);
    layers.add(county_outline_lyr);

  }

});



//////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////// After event ///////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////

var Label_date_filters = ui.Label({
    value: 'Flood Detection',
    style: {fontSize: '14px', fontWeight: 'bold', color: 'red'}
  });
Panel.add(Label_date_filters);

var Label_postEvent = ui.Label({value: 'During/Post-event:',
                                     style: {fontSize: '12px', fontWeight: 'bold', color: 'black'}
});
Panel.add(Label_postEvent);

var Label_eventStartDate = ui.Label({value: 'Start date (yyyy-mm-dd):',
                                     style: {fontSize: '12px', color: 'black'}
});

var Textbox_eventStartDate = ui.Textbox({placeholder: 'YYYY-MM-DD',
                                         value: event_start_date.getInfo(),
                                         style: {width: '100px'}
});

var Panel_eventStartDate = ui.Panel({
  widgets: [Label_eventStartDate, Textbox_eventStartDate],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_eventStartDate);

var Label_eventEndDate = ui.Label({value: 'End date (yyyy-mm-dd):',
                                   style: {fontSize: '12px', }
});

var Textbox_eventEndDate = ui.Textbox({placeholder: 'YYYY-MM-DD',
                                       value: event_end_date.getInfo(),
                                       style: {width: '100px', }
});

var Panel_postEventDates = ui.Panel({
  widgets: [Label_eventEndDate, Textbox_eventEndDate],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_postEventDates);


///////////////////////// Display post-event ascending Sentinel-1 images //////////////////////////
var checkbox_after_sentinel1_asc = ui.Checkbox({label: 'Show ascending Sentinel-1 SAR composite',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});
Panel.add(checkbox_after_sentinel1_asc);

checkbox_after_sentinel1_asc.onChange(function(callback) {
  if (callback === true){

    var start_date = Textbox_eventStartDate.getValue();
    var end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', start_date, end_date);

    var vv_asc_Col = sentinel1Col(start_date, end_date, AOI, 'ASCENDING', 'VV');
    var vh_asc_Col = sentinel1Col(start_date, end_date, AOI, 'ASCENDING', 'VH');


    if (vv_asc_Col.size().getInfo() > 0){

      var date_first_image_asc_vv = ee.Date(vv_asc_Col.first().get('system:time_start')).format('YYYY-MM-dd');
      var date_last_image_asc_vv = ee.Date(vv_asc_Col.sort('system:time_start', false).first().get('system:time_start')).format('YYYY-MM-dd');
      print('# of S1 ascending images', vv_asc_Col.size(), date_first_image_asc_vv, date_last_image_asc_vv);

      var VV_postEvent_image_asc = vv_asc_Col.min();
      var VH_postEvent_image_asc = vh_asc_Col.min();
      print('Post-event VV ascending', vv_asc_Col);

      var projection = VH_postEvent_image_asc.projection();
      var nominalScale = projection.nominalScale();
      print('Resolution VH_postEvent_image_asc:', nominalScale);
      var crs = projection.crs();
      print('CRS VH_postEvent_image_asc:', crs);


      var composite_post_event_asc = VV_postEvent_image_asc.addBands(VH_postEvent_image_asc).addBands(VV_postEvent_image_asc.divide(VH_postEvent_image_asc));
      composite_post_event_asc_lyr = ui.Map.Layer(composite_post_event_asc.visualize({min:[-25, -25, 0] ,max:[-5, -5, 1]})).setName('S1 (VV, VH, VV/VH) asc ' + date_first_image_asc_vv.getInfo() + ', ' + date_last_image_asc_vv.getInfo());
      layers.add(composite_post_event_asc_lyr);

    } else {
      print('No S1 ascending images available for your specified date range :(');
      show_errorMessage();
    }

  } else {
    layers.remove(composite_post_event_asc_lyr);
  }
});


///////////////////////// Display post-event descending Sentinel-1 images //////////////////////////
var checkbox_after_sentinel1_des = ui.Checkbox({label: 'Show descending Sentinel-1 SAR composite',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});
Panel.add(checkbox_after_sentinel1_des);

checkbox_after_sentinel1_des.onChange(function(callback) {
  if (callback === true){

    var start_date = Textbox_eventStartDate.getValue();
    var end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', start_date, end_date);

    var vv_des_Col = sentinel1Col(start_date, end_date, AOI, 'DESCENDING', 'VV');
    var vh_des_Col = sentinel1Col(start_date, end_date, AOI, 'DESCENDING', 'VH');

    if (vv_des_Col.size().getInfo() > 0){

      var date_first_image_des_vv = ee.Date(vv_des_Col.first().get('system:time_start')).format('YYYY-MM-dd');
      var date_last_image_des_vv = ee.Date(vv_des_Col.sort('system:time_start', false).first().get('system:time_start')).format('YYYY-MM-dd');
      print('# of S1 descending images', vv_des_Col.size(), date_first_image_des_vv, date_last_image_des_vv);

      var VV_postEvent_image_des = vv_des_Col.min();
      var VH_postEvent_image_des = vh_des_Col.min();
      print('Post-event VV descending', vv_des_Col);

      var composite_post_event_des = VV_postEvent_image_des.addBands(VH_postEvent_image_des).addBands(VV_postEvent_image_des.divide(VH_postEvent_image_des));
      composite_post_event_des_lyr = ui.Map.Layer(composite_post_event_des.visualize({min:[-25, -25, 0] ,max:[-5, -5, 1]})).setName('S1 (VV, VH, VV/VH) des ' + date_first_image_des_vv.getInfo() + ', ' + date_last_image_des_vv.getInfo());
      layers.add(composite_post_event_des_lyr);

    } else {
      print('No S1 descending images available for your specified date range :(');
      show_errorMessage();
    }

  } else {
    layers.remove(composite_post_event_des_lyr);
  }
});

var seperate_line1 = ui.Label({value: '------------------------------------------------------------------------------------------'});
Panel.add(seperate_line1);

//////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////// Before event ///////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
var Label_preEvent = ui.Label({value: 'Reference:',
                               style: {fontSize: '12px', fontWeight: 'bold', color: 'black'}
});
Panel.add(Label_preEvent);


////////////////////////////////  Reference image option menu /////////////////////////////////////
var Label_referenceImages = ui.Label({value: 'Reference images:',
                                style: {fontSize: '12px'}
});

var referenceOptions = ['Use pre-event images', 'Use baseline images'];
var dropdown_menu_referenceImages = ui.Select({items: referenceOptions,
                                               placeholder: 'Use pre-event images',
                                               style: {width: '192px'}
});


ee.List(referenceOptions).evaluate(function(option){
  dropdown_menu_referenceImages.items().reset(option);
});

var Panel_referenceImages = ui.Panel({
  widgets: [Label_referenceImages, dropdown_menu_referenceImages],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_referenceImages);

dropdown_menu_referenceImages.onChange(function(callback) {
  option_name = dropdown_menu_referenceImages.getValue();
  print('Reference images', option_name);

  if (option_name === 'Use baseline images') {

    var start_date = '2017-01-01', end_date = '2020-01-01';
    Textbox_imageStartDate.setValue(start_date);
    Textbox_imageEndDate.setValue(end_date);

  }

});


var Label_imageStartDate = ui.Label({value: 'Start date (yyyy-mm-dd):',
                                     style: {fontSize: '12px'},
});

var Textbox_imageStartDate = ui.Textbox({placeholder: 'YYYY-MM-DD',
                                         value: normal_start_date.getInfo(),
                                         style: {width: '100px'},
});

var Panel_imageStartDate = ui.Panel({
  widgets: [Label_imageStartDate, Textbox_imageStartDate],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_imageStartDate);

var Label_imageEndDate = ui.Label({value: 'End date (yyyy-mm-dd):',
                                     style: {fontSize: '12px'},
});

var Textbox_imageEndDate = ui.Textbox({placeholder: 'YYYY-MM-DD',
                                       value: normal_end_date.getInfo(),
                                       style: {width: '100px'},
});

var Panel_preEventDates = ui.Panel({
  widgets: [Label_imageEndDate, Textbox_imageEndDate],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_preEventDates);


///////////////////////// Display pre-event ascending Sentinel-1 images //////////////////////////
var checkbox_before_sentinel1_asc = ui.Checkbox({label: 'Show ascending Sentinel-1 SAR composite',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});
Panel.add(checkbox_before_sentinel1_asc);

checkbox_before_sentinel1_asc.onChange(function(callback) {
  if (callback === true){

      var start_date = Textbox_imageStartDate.getValue();
      var end_date = Textbox_imageEndDate.getValue();
      print('Pre-event start and end date', start_date, end_date);

      var vv_asc_Col = sentinel1Col(start_date, end_date, AOI, 'ASCENDING', 'VV');
      var vh_asc_Col = sentinel1Col(start_date, end_date, AOI, 'ASCENDING', 'VH');

      if (vv_asc_Col.size().getInfo() > 0){

        var date_first_image_asc_vv = ee.Date(vv_asc_Col.first().get('system:time_start')).format('YYYY-MM-dd');
        var date_last_image_asc_vv = ee.Date(vv_asc_Col.sort('system:time_start', false).first().get('system:time_start')).format('YYYY-MM-dd');
        print('# of S1 ascending images', vv_asc_Col.size(), date_first_image_asc_vv, date_last_image_asc_vv);

        var VV_baseline_image_asc = vv_asc_Col.median();
        var VH_baseline_image_asc = vh_asc_Col.median();
        print('VH_baseline_image_asc', VH_baseline_image_asc);

        var composite_pre_event_asc = VV_baseline_image_asc.addBands(VH_baseline_image_asc).addBands(VV_baseline_image_asc.divide(VH_baseline_image_asc));
        composite_pre_event_asc_lyr = ui.Map.Layer(composite_pre_event_asc.visualize({min:[-25, -25, 0] ,max:[-5, -5, 1]})).setName('S1 (VV, VH, VV/VH) asc ' + date_first_image_asc_vv.getInfo() + ', ' + date_last_image_asc_vv.getInfo());
        layers.add(composite_pre_event_asc_lyr);

      } else {
        print('No S1 ascending images available for your specified date range :(');
        show_errorMessage();
      }

  } else {
    layers.remove(composite_pre_event_asc_lyr);
  }
});


///////////////////////// Display pre-event descending Sentinel-1 images //////////////////////////
var checkbox_before_sentinel1_des = ui.Checkbox({label: 'Show descending Sentinel-1 SAR composite',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});
Panel.add(checkbox_before_sentinel1_des);

checkbox_before_sentinel1_des.onChange(function(callback) {
  if (callback === true){

    var start_date = Textbox_imageStartDate.getValue();
    var end_date = Textbox_imageEndDate.getValue();
    print('Pre-event start and end date', start_date, end_date);

    var vv_des_Col = sentinel1Col(start_date, end_date, AOI, 'DESCENDING', 'VV');
    var vh_des_Col = sentinel1Col(start_date, end_date, AOI, 'DESCENDING', 'VH');

    if (vv_des_Col.size().getInfo() > 0){

      var date_first_image_des_vv = ee.Date(vv_des_Col.first().get('system:time_start')).format('YYYY-MM-dd');
      var date_last_image_des_vv = ee.Date(vv_des_Col.sort('system:time_start', false).first().get('system:time_start')).format('YYYY-MM-dd');
      print('# of S1 descending images', vv_des_Col.size(), date_first_image_des_vv, date_last_image_des_vv);

      var VV_baseline_image_des = vv_des_Col.median();
      var VH_baseline_image_des = vh_des_Col.median();
      print('VH_baseline_image_des', VH_baseline_image_des);

      var composite_pre_event_des = VV_baseline_image_des.addBands(VH_baseline_image_des).addBands(VV_baseline_image_des.divide(VH_baseline_image_des));
      composite_pre_event_des_lyr = ui.Map.Layer(composite_pre_event_des.visualize({min:[-25, -25, 0] ,max:[-5, -5, 1]})).setName('S1 (VV, VH, VV/VH) des ' + date_first_image_des_vv.getInfo() + ', ' + date_last_image_des_vv.getInfo());
      layers.add(composite_pre_event_des_lyr);

    } else {
      print('No S1 descending images available for your specified date range :(');
      show_errorMessage();
    }

  } else {
    layers.remove(composite_pre_event_des_lyr);
  }
});

var seperate_line2 = ui.Label({value: '------------------------------------------------------------------------------------------'});
Panel.add(seperate_line2);


var Label_anomaly = ui.Label({value: 'Anomaly visualization of pre and post events:',
                               style: {fontSize: '12px', fontWeight: 'bold', color: 'black'}
});
Panel.add(Label_anomaly);

///////////////////////// Display SAR anomaly - ascending //////////////////////////
var checkbox_sar_anomaly_asc = ui.Checkbox({label: 'Show SAR anomaly composite (ascending)',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});
Panel.add(checkbox_sar_anomaly_asc);

checkbox_sar_anomaly_asc.onChange(function(callback) {
  if (callback === true){

    var after_start_date = Textbox_eventStartDate.getValue();
    var after_end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', after_start_date, after_end_date);

    var before_start_date = Textbox_imageStartDate.getValue();
    var before_end_date = Textbox_imageEndDate.getValue();
    print('Pre-event start and end date', before_start_date, before_end_date);

    var VH_postEvent_image_asc = sentinel1Col(after_start_date, after_end_date, AOI, 'ASCENDING', 'VH').min();
    var VH_baseline_image_asc = sentinel1Col(before_start_date, before_end_date, AOI, 'ASCENDING', 'VH').median();

    var composite_anomaly_asc = VH_postEvent_image_asc.addBands(VH_postEvent_image_asc).addBands(VH_baseline_image_asc);
    composite_anomaly_asc_lyr = ui.Map.Layer(composite_anomaly_asc.visualize({min: -25, max: -5})).setName('S1 (post-VH, post-VH. pre-VH) asc anomaly');
    layers.add(composite_anomaly_asc_lyr);

  } else {
    layers.remove(composite_anomaly_asc_lyr);
  }
});

///////////////////////// Display SAR anomaly - descending //////////////////////////
var checkbox_sar_anomaly_des = ui.Checkbox({label: 'Show SAR anomaly composite (descending)',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});
Panel.add(checkbox_sar_anomaly_des);

checkbox_sar_anomaly_des.onChange(function(callback) {
  if (callback === true){

    var after_start_date = Textbox_eventStartDate.getValue();
    var after_end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', after_start_date, after_end_date);

    var before_start_date = Textbox_imageStartDate.getValue();
    var before_end_date = Textbox_imageEndDate.getValue();
    print('Pre-event start and end date', before_start_date, before_end_date);

    var VH_postEvent_image_des = sentinel1Col(after_start_date, after_end_date, AOI, 'DESCENDING', 'VH').min();
    var VH_baseline_image_des = sentinel1Col(before_start_date, before_end_date, AOI, 'DESCENDING', 'VH').median();

    var composite_anomaly_des = VH_postEvent_image_des.addBands(VH_postEvent_image_des).addBands(VH_baseline_image_des);
    composite_anomaly_des_lyr = ui.Map.Layer(composite_anomaly_des.visualize({min: -25, max: -5})).setName('S1 (post-VH, post-VH. pre-VH) des anomaly');
    layers.add(composite_anomaly_des_lyr);

  } else {
    layers.remove(composite_anomaly_des_lyr);
  }
});


var seperate_line3 = ui.Label({value: '------------------------------------------------------------------------------------------'});
Panel.add(seperate_line3);

////////////////////////////////  Flood detection algrithm menu /////////////////////////////////////
var Label_floodDetection_algorithms = ui.Label({value: 'Flood detection algorithm:',
                                style: {fontSize: '12px'}
});


var floodDetection_algorithms =['Absolute Threshold Differencing (ATD)', 'Relative Threshold Differencing (RTD)',
                                         'Ratio', 'Z-score', 'Modified Z-score (Robust Z-score)'];

var dropdown_menu_floodDetection_algorithms = ui.Select({items: floodDetection_algorithms,
                                                         placeholder: 'Ratio',
                                                         style: {width: '190px'}
});
dropdown_menu_floodDetection_algorithms.setValue('Ratio');

ee.List(floodDetection_algorithms).evaluate(function(algorithm){
  dropdown_menu_floodDetection_algorithms.items().reset(algorithm);
});

var Panel_floodDetection_algorithms = ui.Panel({
  widgets: [Label_floodDetection_algorithms, dropdown_menu_floodDetection_algorithms],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_floodDetection_algorithms);

dropdown_menu_floodDetection_algorithms.onChange(function(callback) {
  algorithm_name = dropdown_menu_floodDetection_algorithms.getValue();
  print('Algorithm selected', algorithm_name);
});




var checkbox_floodDepth = ui.Checkbox({label: 'Including flood depth',
                                       value: false,
                                       style: {fontSize: '12px', color: 'black'}
});

checkbox_floodDepth.onChange(function(callback) {
  if (callback === true){
    checkbox_floodDepth.setValue(true);
    print('Including flood depth checked', checkbox_floodDepth.getValue());
  } else {
    checkbox_floodDepth.setValue(false);
    print('Including flood depth checked', checkbox_floodDepth.getValue());
  }
});

var Button_Generate_flood = ui.Button({
  label: 'Generate flood layers',
  onClick: function() {

    algorithm_name = dropdown_menu_floodDetection_algorithms.getValue();
    print('Algorithm selected', algorithm_name);


    var after_start_date = Textbox_eventStartDate.getValue();
    var after_end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', after_start_date, after_end_date);

    var before_start_date = Textbox_imageStartDate.getValue();
    var before_end_date = Textbox_imageEndDate.getValue();
    print('Pre-event start and end date', before_start_date, before_end_date);

    /////// ESA WorldCover is a single 2021 snapshot (no annual time series like CDL had) ///////
    cdl_year = '2021 (ESA WorldCover v200)';
    print('Land cover dataset used for impact assessment', cdl_year);
    crop_img = worldcover_img;


    ////////////////////////////// Sentinel-2 MNDWI ///////////////////////////////

    s2Col_preEvent = get_s2_sr_cloudMask_col (before_start_date, before_end_date, AOI);
    var s2_mndwiCol_preEvent = s2Col_preEvent.map(function(img) {
      var green = img.select(['B3']);
      var swir1 = img.select(['B11']);
      return green.subtract(swir1).divide(green.add(swir1)).rename('MNDWI');
    });
    s2_mndwi_Xu_preEvent = s2_mndwiCol_preEvent.median().rename('mndwi');
    s2_b8_preEvent = get_s2_sr_cloudMask_col (before_start_date, before_end_date, AOI).select('B8').median().rename('nir');
    s2_b8_preEvent_unmasked = s2_b8_preEvent.unmask(-9999).rename('nir');


    s2Col_postEvent = get_s2_sr_cloudMask_col (after_start_date, after_end_date, AOI);
    var s2_mndwiCol_postEvent = s2Col_postEvent.map(function(img) {
      var green = img.select(['B3']);
      var swir1 = img.select(['B11']);
      return green.subtract(swir1).divide(green.add(swir1)).rename('MNDWI');
    });
    s2_mndwi_Xu_postEvent = s2_mndwiCol_postEvent.max().rename('mndwi');
    print('s2_mndwi_Xu_postEvent', s2_mndwi_Xu_postEvent);

    s2_b8_postEvent = get_s2_sr_cloudMask_col (after_start_date, after_end_date, AOI).select('B8').median().rename('nir');
    print('s2_b8_postEvent_unmasked', s2_b8_postEvent_unmasked)
    s2_b8_postEvent_unmasked = s2_b8_postEvent.unmask(-9999).rename('nir');


    ////////////////////////////// Landsat 8 and 9 MNDWI ///////////////////////////////

    l89Col_preEvent = get_l89_sr_cloudMask_col (before_start_date, before_end_date, AOI);
    var l89_mndwiCol_preEvent = l89Col_preEvent.map(function(img) {
      var green = img.select(['SR_B3']);
      var swir1 = img.select(['SR_B6']);
      return green.subtract(swir1).divide(green.add(swir1)).rename('MNDWI');
    });
    l89_mndwi_Xu_preEvent = l89_mndwiCol_preEvent.median().rename('mndwi');
    l89_b5_preEvent = get_l89_sr_cloudMask_col (before_start_date, before_end_date, AOI).select('SR_B5').median().rename('nir');
    l89_b5_preEvent_unmasked = l89_b5_preEvent.unmask(-9999).rename('nir');

    l89Col_postEvent = get_l89_sr_cloudMask_col (after_start_date, after_end_date, AOI);
    var l89_mndwiCol_postEvent = l89Col_postEvent.map(function(img) {
      var green = img.select(['SR_B3']);
      var swir1 = img.select(['SR_B6']);
      return green.subtract(swir1).divide(green.add(swir1)).rename('MNDWI');
    });
    print('Landsat 8&9 merged MNDWI postEvent collection', l89_mndwiCol_postEvent);
    l89_mndwi_Xu_postEvent = l89_mndwiCol_postEvent.max().rename('mndwi');
    l89_b5_postEvent = get_l89_sr_cloudMask_col (after_start_date, after_end_date, AOI).select('SR_B5').median().rename('nir');
    l89_b5_postEvent_unmasked = l89_b5_postEvent.unmask(-9999).rename('nir');
    print('l89_b5_postEvent_unmasked', l89_b5_postEvent_unmasked)


    ////////////////////////////// Multi-sensor MNDWI derived from Sentinel-2, Landsat 8 and 9 MNDWI ///////////////////////////////
    multiSensor_mndwi_Xu_preEvent_Col = s2_mndwiCol_preEvent.merge(l89_mndwiCol_preEvent);
    multiSensor_mndwi_Xu_preEvent = multiSensor_mndwi_Xu_preEvent_Col.median().rename('mndwi');
    multiSensor_mndwi_Xu_preEvent_unmasked = multiSensor_mndwi_Xu_preEvent.unmask(9999);

    multiSensor_nir_preEvent = ee.ImageCollection(s2_b8_preEvent).merge(ee.ImageCollection(l89_b5_preEvent)).median().rename('nir');
    print('multiSensor_nir_preEvent', multiSensor_nir_preEvent)

    multiSensor_mndwi_Xu_postEvent_Col = s2_mndwiCol_postEvent.merge(l89_mndwiCol_postEvent);
    multiSensor_mndwi_Xu_postEvent = multiSensor_mndwi_Xu_postEvent_Col.max().rename('mndwi');
    print('MultiSensor postEvent MNDWI Col', multiSensor_mndwi_Xu_postEvent_Col);
    multiSensor_mndwi_Xu_postEvent_unmasked = multiSensor_mndwi_Xu_postEvent.unmask(9999);


    if ((sentinel1Col(after_start_date, after_end_date, AOI, 'ASCENDING', 'VH').size().getInfo() > 0)
       && (sentinel1Col(before_start_date, before_end_date, AOI, 'ASCENDING', 'VH').size().getInfo() > 0)) {

      print('Ascending images available!', sentinel1Col(after_start_date, after_end_date, AOI, 'ASCENDING', 'VH').size());
      var VH_baseline_image_asc = sentinel1Col(before_start_date, before_end_date, AOI, 'ASCENDING', 'VH').median().focal_mean(focal_radius, 'circle', 'meters');
      var VH_baseline_water_asc = VH_baseline_image_asc.lte(threshold_vh);
      var VH_postEvent_image_asc = sentinel1Col(after_start_date, after_end_date, AOI, 'ASCENDING', 'VH').min().focal_mean(focal_radius, 'circle', 'meters');


      if (algorithm_name === 'Absolute Threshold Differencing (ATD)') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-ATD';
        inundated_crop_layer_name = 'Impacted land cover (ATD)';
        var VH_postEvent_water_asc = VH_postEvent_image_asc.lte(threshold_vh);
        VH_flood_asc = VH_postEvent_water_asc.subtract(VH_baseline_water_asc).gt(0).rename('flood');

      } else if (algorithm_name === 'Relative Threshold Differencing (RTD)') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-RTD';
        inundated_crop_layer_name = 'Impacted land cover (RTD)';
        var relative_diff_asc = (VH_postEvent_image_asc.subtract(VH_baseline_image_asc)).divide((VH_baseline_image_asc.abs()));
        VH_flood_asc = relative_diff_asc.lt(-0.2).rename('flood');

      } else if (algorithm_name === 'Ratio') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-ratio';
        inundated_crop_layer_name = 'Impacted land cover (ratio)';
        var ratio_asc = (VH_postEvent_image_asc.divide(VH_baseline_image_asc));
        VH_flood_asc = ratio_asc.gt(1.25).rename('flood');
        /// Pandey, A.C.; Kaushik, K.; Parida, B.R. Google Earth Engine for Large-Scale Flood Mapping Using SAR Data and Impact Assessment on Agriculture and Population of Ganga-Brahmaputra Basin. Sustainability 2022, 14, 4210. https://doi.org/10.3390/su14074210
      } else if (algorithm_name === 'Z-score') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-Z-score';
        inundated_crop_layer_name = 'Impacted land cover (Z-score)';
        var VH_mean_image_asc = sentinel1Col(before_start_date, before_end_date, AOI, 'ASCENDING', 'VH').mean().focal_mean(focal_radius, 'circle', 'meters');
        var VH_std_image_asc = sentinel1Col(before_start_date, before_end_date, AOI, 'ASCENDING', 'VH').reduce(ee.Reducer.stdDev()).focal_mean(focal_radius, 'circle', 'meters');
        var vh_postEvent_z_asc = VH_postEvent_image_asc.subtract(VH_mean_image_asc).divide(VH_std_image_asc);
        VH_flood_asc = vh_postEvent_z_asc.lt(-1.96).rename('flood');

      } else {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-MAD';
        inundated_crop_layer_name = 'Impacted land cover (MAD)';

        var absolute_deviations_vh_asc = sentinel1Col(before_start_date, before_end_date, AOI, 'ASCENDING', 'VH').map(function(img) {
          return img.subtract(VH_baseline_image_asc).abs().rename('abs_dev_vh');
        });

        var VH_mad_image_asc = absolute_deviations_vh_asc.median();
        var vh_postEvent_modified_z_asc = VH_postEvent_image_asc.subtract(VH_baseline_image_asc).divide(VH_mad_image_asc.multiply(1.4826));
        VH_flood_asc = vh_postEvent_modified_z_asc.lt(-1.96).rename('flood');
      }
    }

    if ((sentinel1Col(after_start_date, after_end_date, AOI, 'DESCENDING', 'VH').size().getInfo() > 0)
       && (sentinel1Col(before_start_date, before_end_date, AOI, 'DESCENDING', 'VH').size().getInfo() > 0)) {

      print('Descending images available!', sentinel1Col(after_start_date, after_end_date, AOI, 'DESCENDING', 'VH').size());
      var VH_baseline_image_des = sentinel1Col(before_start_date, before_end_date, AOI, 'DESCENDING', 'VH').median().focal_mean(focal_radius, 'circle', 'meters');
      var VH_baseline_water_des = VH_baseline_image_des.lte(threshold_vh);
      var VH_postEvent_image_des = sentinel1Col(after_start_date, after_end_date, AOI, 'DESCENDING', 'VH').min().focal_mean(focal_radius, 'circle', 'meters');

      if (algorithm_name === 'Absolute Threshold Differencing (ATD)') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-ATD';
        inundated_crop_layer_name = 'Impacted land cover (ATD)';
        var VH_postEvent_water_des = VH_postEvent_image_des.lte(threshold_vh);
        VH_flood_des = VH_postEvent_water_des.subtract(VH_baseline_water_des).gt(0).rename('flood');
      } else if (algorithm_name === 'Relative Threshold Differencing (RTD)') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-RTD';
        inundated_crop_layer_name = 'Impacted land cover (RTD)';
        var relative_diff_des = (VH_postEvent_image_des.subtract(VH_baseline_image_des)).divide((VH_baseline_image_des.abs()));
        VH_flood_des = relative_diff_des.lt(-0.2).rename('flood');

      } else if (algorithm_name === 'Ratio') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-Ratio';
        inundated_crop_layer_name = 'Impacted land cover (ratio)';
        var ratio_des = (VH_postEvent_image_des.divide(VH_baseline_image_des));
        VH_flood_des = ratio_des.gt(1.25).rename('flood');
      } else if (algorithm_name === 'Z-score') {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods (SAR-Z-score';
        inundated_crop_layer_name = 'Impacted land cover (Z-score)';
        var VH_mean_image_des = sentinel1Col(before_start_date, before_end_date, AOI, 'DESCENDING', 'VH').mean().focal_mean(focal_radius, 'circle', 'meters');
        var VH_std_image_des = sentinel1Col(before_start_date, before_end_date, AOI, 'DESCENDING', 'VH').reduce(ee.Reducer.stdDev()).focal_mean(focal_radius, 'circle', 'meters');
        var vh_postEvent_z_des = VH_postEvent_image_des.subtract(VH_mean_image_des).divide(VH_std_image_des);
        VH_flood_des = vh_postEvent_z_des.lt(-1.96).rename('flood');

      } else {
        print(algorithm_name + ' selected');
        flood_layer_name = 'Floods derived from SAR (MAD)';
        inundated_crop_layer_name = 'Impacted land cover (MAD)';

        var absolute_deviations_vh_des = sentinel1Col(before_start_date, before_end_date, AOI, 'DESCENDING', 'VH').map(function(img) {
          return img.subtract(VH_baseline_image_des).abs().rename('abs_dev_vh');
        });

        var VH_mad_image_des = absolute_deviations_vh_des.median();
        var vh_postEvent_modified_z_des = VH_postEvent_image_des.subtract(VH_baseline_image_des).divide(VH_mad_image_des.multiply(1.4826));
        VH_flood_des = vh_postEvent_modified_z_des.lt(-1.96).rename('flood');
      }
    }


    ///////////// *********************** Merge floods layers derived from both acsending and descending images  *********************** ////////////////////////////
    var VH_flood_asc_des = VH_flood_asc.unmask().or(VH_flood_des.unmask());

    var flood_final = refine_flood (VH_flood_asc_des);
    flood_asc_des_lyr = flood_final.visualize({palette:"blue"});
    flood_asc_des_lyr = ui.Map.Layer(flood_asc_des_lyr).setName(flood_layer_name+ ' )');
    layers.add(flood_asc_des_lyr);

    if (multiSensor_mndwi_Xu_postEvent_Col.size().getInfo() > 0) {

      var flood_sar_corrected_by_mndwi = refine_flood2 (flood_final);
      flood_asc_des_lyr2 = flood_sar_corrected_by_mndwi.visualize({palette:"blue"});
      flood_asc_des_lyr2 = ui.Map.Layer(flood_asc_des_lyr2).setName(flood_layer_name + ' with multi-sensor MNDWI corrected)');
      layers.add(flood_asc_des_lyr2);


      //////////// Use NIR bands from Sentinel-2 and Landsat 8/9 to distinguish snow from water surfaces ///////////
      water_s2_l89_postEvent = multiSensor_mndwi_Xu_postEvent.gt(0.1)

      if (s2Col_postEvent.size().getInfo() > 0) {
        water_s2_l89_postEvent = water_s2_l89_postEvent.updateMask(s2_b8_postEvent_unmasked.lt(0.5));
      }

      if (l89Col_postEvent.size().getInfo() > 0) {
        water_s2_l89_postEvent = water_s2_l89_postEvent.updateMask(l89_b5_postEvent_unmasked.lt(0.5));
      }


      water_s2_l89_preEvent = multiSensor_mndwi_Xu_preEvent.gt(0.1)

      if (s2Col_preEvent.size().getInfo() > 0) {
        water_s2_l89_preEvent = water_s2_l89_preEvent.updateMask(s2_b8_preEvent_unmasked.lt(0.5));
      }

      if (l89Col_preEvent.size().getInfo() > 0) {
        water_s2_l89_preEvent = water_s2_l89_preEvent.updateMask(l89_b5_preEvent_unmasked.lt(0.5));
      }


      var flood_s2_l89 = water_s2_l89_postEvent.subtract(water_s2_l89_preEvent).gt(0).where(swater_mask, 0);
      flood_s2_l89 = flood_s2_l89.updateMask(flood_s2_l89).clip(us_states);

      flood_s2_l89_lyr = flood_s2_l89.visualize({palette:"blue"});
      flood_s2_l89_lyr = ui.Map.Layer(flood_s2_l89_lyr).setName('Floods (multi-sensor MNDWI)');
      layers.add(flood_s2_l89_lyr);


      var flood_sar_optical = flood_sar_corrected_by_mndwi.unmask().or(flood_s2_l89.unmask());
      flood_final = flood_sar_optical.updateMask(flood_sar_optical);
      flood_sar_optical_lyr = flood_final.visualize({palette:"blue"});
      flood_sar_optical_lyr = ui.Map.Layer(flood_sar_optical_lyr).setName('Floods (SAR and multi-sensor MNDWI)');
      layers.add(flood_sar_optical_lyr);

    }


    /////////////////////////////    Impacted land cover   ///////////////////////////////////

    inundated_cropland = crop_img.updateMask(flood_final);
    inundated_cropland_lyr = ui.Map.Layer(inundated_cropland).setName(inundated_crop_layer_name);
    layers.add(inundated_cropland_lyr);


    ///////////////////  Choose if to include generation of flood depth layer /////////////////////

    if (checkbox_floodDepth.getValue() === true) {


      /////////////////////////////    Inundated terrain   ///////////////////////////////////

      inundated_terrain = dem.updateMask(flood_final).rename('flooded_dem');

      /////////////////////////////    Flood polygons for max-elevation lookup ///////////////////////////////////

      flood_polygons = flood_final.addBands(flood_final).reduceToVectors({
        geometry: AOI,
        scale: 90,
        geometryType: 'polygon',
        eightConnected: false,
        labelProperty: 'flood',
        maxPixels: 1e11,
        reducer: ee.Reducer.first()
      });

      var flood_polygon_update = flood_polygons.map(function(f) {

        var poly = f.geometry();

        var maxDictionary = inundated_terrain.reduceRegion({
          reducer: ee.Reducer.max(),
          geometry: poly,
          scale: 10,
          maxPixels: 1e8
        });
        return f.set('max_f_elev', maxDictionary.get('flooded_dem'));
      });

      var max_f_elev_img = flood_polygon_update.filter(ee.Filter.notNull(['max_f_elev']))
                                               .reduceToImage({properties: ['max_f_elev'],
                                                               reducer: ee.Reducer.first()
      }).rename('max_flood_elev');
      max_f_elev_img = max_f_elev_img.updateMask(flood_final);

      flood_depth = max_f_elev_img.subtract(inundated_terrain).rename('flood_depth');

      flood_depth_col = ee.ImageCollection(flood_depth);
      print('flood depth collection', flood_depth_col)

      var palette_floodDepth = ['F9E79F', 'F7DC6F', 'F4D03F', 'D98880', 'CD6155', 'A93226', '7B241C', '641E16'];

      fd_depth_lyr = flood_depth.visualize({min: 0, max: 6, palette: palette_floodDepth});
      fd_depth_lyr = ui.Map.Layer(fd_depth_lyr).setName('Flood depth (m)');
      layers.add(fd_depth_lyr);

      legend_floodDepth = createLegend('Flood depth (m)', palette_floodDepth, 0, 6);

      if (number_legend_called < 2) {
        mapPanel.add(legend_floodDepth);
      }
    }

  }

});

var Panel_generateFloodLayers = ui.Panel({
  widgets: [Button_Generate_flood, checkbox_floodDepth],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_generateFloodLayers);


////////////////////////////    Add more layers //////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
var Panel_add_more_layers = ui.Panel([
  ui.Label({
    value: 'Add more layers',
    style: {fontSize: '14px', fontWeight: 'bold', color: 'red'}
  }),
]);
Panel.add(Panel_add_more_layers);

////////////////////////////  JRC Global Surface Water ////////////////////////////

var checkbox_JRC_surfaceWater = ui.Checkbox({label: 'JRC Global Surface Water', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_JRC_surfaceWater);

checkbox_JRC_surfaceWater.onChange(function(callback) {
  if (callback === true){
      layers.add(swater_mask_lyr, 'JRC Global Surface Water');
  } else {
      layers.remove(swater_mask_lyr);
  }
});



/////////////////////////////WWF HydroSHEDS Free Flowing Rivers Network v1  (global; covers the Niger/Benue) ////////

var checkbox_river = ui.Checkbox({label: 'WWF HydroSHEDS River Network', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_river);

checkbox_river.onChange(function(callback) {
  if (callback === true){
    var river = rivers.style({color: "blue", width: 2.0,});
    river_lyr = ui.Map.Layer(river).setName('River Network');
    layers.add(river_lyr);
  } else {
    layers.remove(river_lyr);
  }
});


////////////////////////  LGA boundaries  /////////////////////////

var checkbox_counties = ui.Checkbox({label: 'LGAs', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_counties);

checkbox_counties.onChange(function(callback) {
  if (callback === true){

    var counties_outline = empty.paint({featureCollection: counties, color: 1, width: 1})
                             .visualize({palette: 'red'});
    counties_outline_lyr = ui.Map.Layer(counties_outline).setName('LGA boundaries');

    layers.add(counties_outline_lyr);

  } else {
    layers.remove(counties_outline_lyr);
  }
});

////////////////////////  State boundaries  /////////////////////////

var checkbox_states = ui.Checkbox({label: 'States', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_states);

checkbox_states.onChange(function(callback) {
  if (callback === true){

    var states_outline = empty.paint({featureCollection: us_states, color: 1, width: 2})
                             .visualize({palette: 'black'});
    states_outline_lyr = ui.Map.Layer(states_outline).setName('State boundaries');

    layers.add(states_outline_lyr);
  } else {
    layers.remove(states_outline_lyr);
  }
});


////////////////////////  AOI (national boundary)   /////////////////////////

var checkbox_aoi = ui.Checkbox({label: 'AOI (Nigeria)', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_aoi);

checkbox_aoi.onChange(function(callback) {
  if (callback === true){

    AOI = nigeria_boundary;
    var aoi_outline = empty.paint({featureCollection: nigeria_boundary, color: 1, width: 2})
                             .visualize({palette: 'cyan'});
    aoi_lyr = ui.Map.Layer(aoi_outline).setName('AOI (Nigeria)');

    layers.add(aoi_lyr);
  } else {
    layers.remove(aoi_lyr);
  }
});


/////////////////////////////////// DEM //////////////////////////////////

var checkbox_dem = ui.Checkbox({label: '30m SRTM DEM', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_dem);

checkbox_dem.onChange(function(callback) {
  if (callback === true){

    elev_lyr = dem.visualize({min: 10, max: 1000,
                              palette: ['3ae237', 'b5e22e', 'd6e21f', 'fff705', 'ffd611', 'ffb613', 'ff8b13', 'ff6e08', 'ff500d', 'ff0000', 'de0101', 'c21301', '0602ff', '235cb1', '307ef3', '269db1', '30c8e2', '32d3ef', '3be285', '3ff38f', '86e26f']});
    elev_lyr = ui.Map.Layer(elev_lyr).setName('SRTM 30m DEM');
    layers.add(elev_lyr);

  } else {
    layers.remove(elev_lyr);
  }
});

///////////////////////////////////////Sentinel-2///////////////////////////////
var checkbox_s2 = ui.Checkbox({label: 'Sentinel-2', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_s2);

checkbox_s2.onChange(function(callback) {
  if (callback === true){

    var before_start_date = Textbox_imageStartDate.getValue();
    var before_end_date = Textbox_imageEndDate.getValue();
    print('Pre-event start and end date', before_start_date, before_end_date);

    var after_start_date = Textbox_eventStartDate.getValue();
    var after_end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', after_start_date, after_end_date);

    var rgbVis = {min: 0, max: 0.3, bands: ['B8', 'B4', 'B3']};

    var s2_rgb_before = get_s2_sr_cloudMask_col (before_start_date, before_end_date, AOI).median();
    s2_rgb_before_lyr = s2_rgb_before.visualize(rgbVis);
    s2_rgb_before_lyr = ui.Map.Layer(s2_rgb_before_lyr).setName('Sentinel-2 SR ' +  before_start_date + ', ' + before_end_date);
    layers.add(s2_rgb_before_lyr);

    var s2_rgb_after = get_s2_sr_cloudMask_col (after_start_date, after_end_date, AOI).median();
    s2_rgb_after_lyr = s2_rgb_after.visualize(rgbVis);
    s2_rgb_after_lyr = ui.Map.Layer(s2_rgb_after_lyr).setName('Sentinel-2 SR ' +  after_start_date + ', ' + after_end_date);
    layers.add(s2_rgb_after_lyr);


  } else {
    layers.remove(s2_rgb_before_lyr);
    layers.remove(s2_rgb_after_lyr);
  }
});

///////////////////////////////////////Landsat-8/9////////////////////////////////
var checkbox_l89 = ui.Checkbox({label: 'Landsat 8/9', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_l89);

checkbox_l89.onChange(function(callback) {
  if (callback === true){

    var after_start_date = Textbox_eventStartDate.getValue();
    var after_end_date = Textbox_eventEndDate.getValue();
    print('Event start and end date', after_start_date, after_end_date);

    var before_start_date = Textbox_imageStartDate.getValue();
    var before_end_date = Textbox_imageEndDate.getValue();
    print('Pre-event start and end date', before_start_date, before_end_date);

    l89_rgb_before = ui.Map.Layer(get_l89_sr_cloudMask_col(before_start_date, before_end_date, AOI).median()
                                                                                  .visualize({min: 0.0, max: 0.3, bands: ['SR_B5','SR_B4','SR_B3']}))
                                                                                  .setName('Landsat 8/9 SR '  +  before_start_date + ', ' + before_end_date);
    layers.add(l89_rgb_before);

    l89_rgb_after = ui.Map.Layer(get_l89_sr_cloudMask_col(after_start_date, after_end_date, AOI).median()
                                                                               .visualize({min: 0.0, max: 0.3, bands: ['SR_B5','SR_B4','SR_B3']}))
                                                                               .setName('Landsat 8/9 SR ' +  after_start_date + ', ' + after_end_date);
    layers.add(l89_rgb_after);

    print('Landsat 8 and 9 merged collection', get_l89_sr_cloudMask_col(after_start_date, after_end_date, AOI));

  } else {
    layers.remove(l89_rgb_before);
    layers.remove(l89_rgb_after);
  }
});


/////////////////////////////////// Urbanization /////////////////////////////
var checkbox_urban = ui.Checkbox({label: 'Urbanization 2015', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_urban);

checkbox_urban.onChange(function(callback) {
  if (callback === true){

    var degreeOfUrbanization = settlement.filter(ee.Filter.date('2015-01-01', '2015-12-31'))
                                         .select('smod_code').max();
    degreeOfUrbanization_lyr = degreeOfUrbanization.visualize(settleVis);
    degreeOfUrbanization_lyr = ui.Map.Layer(degreeOfUrbanization_lyr).setName('Urbanization');

    layers.add(degreeOfUrbanization_lyr, 'Urbanization 2015');
  } else {
      layers.remove(degreeOfUrbanization_lyr);
  }
});

/////////////////////////////////// Built-up /////////////////////////////
var checkbox_built = ui.Checkbox({label: 'Built-Up 2015', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_built);

checkbox_built.onChange(function(callback) {
  if (callback === true){

    var builtUpMultitemporal = builtup.select('built');
    builtUpMultitemporal_lyr = builtUpMultitemporal.visualize(builtupVis);
    builtUpMultitemporal_lyr = ui.Map.Layer(builtUpMultitemporal_lyr).setName('Built-Up');
    layers.add(builtUpMultitemporal_lyr, 'Built-Up 2015');

  } else {
      layers.remove(builtUpMultitemporal_lyr);
  }
});

/////////////////////////////////// Population /////////////////////////////
var checkbox_pop = ui.Checkbox({label: 'Population 2015', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_pop);

checkbox_pop.onChange(function(callback) {
  if (callback === true){

    var population_Count = population.filter(ee.Filter.date('2015-01-01', '2015-12-31'))
                                    .select('population_count').max();
    population_lyr = population_Count.visualize(populationCountVis);
    population_lyr = ui.Map.Layer(population_lyr).setName('Population');

      layers.add(population_lyr, 'Population 2015');
  } else {
      layers.remove(population_lyr);
  }
});

/////////////////////////////////// ESA WorldCover 2021 /////////////////////////////
var checkbox_cdl = ui.Checkbox({label: 'ESA WorldCover 2021', value: false, style: {fontSize: '12px'}});
Panel.add(checkbox_cdl);

checkbox_cdl.onChange(function(callback) {
  if (callback === true){
      layers.add(crop_2023_lyr);
  } else {
      layers.remove(crop_2023_lyr);
  }
});


////////////////////////// Create a label of land cover impact assessment ///////////////////////////
var label_report = ui.Label();

var Label_assessment2 = ui.Panel([
  ui.Label({
    value: 'Land cover impact assessment',
    style: {fontSize: '14px', fontWeight: 'bold', color: 'red'}
  }),
]);
Panel.add(Label_assessment2);



////////////////////////////////  Menu of land cover impact assessment options  /////////////////////////////////////
var Label_cropAssessmentOpt = ui.Label({value: 'Assessment options:',
                                style: {fontSize: '12px'}
});

var cropAssessmentOpt =['Full flood extent',
                        'Flood depth > 0.5m',
                        'Flood depth > 1m',
                        'Flood depth > 2m'];

var dropdown_menu_cropAssessmentOpt = ui.Select({items: cropAssessmentOpt,
                                                        placeholder: 'Full flood extent',
                                                        value: 'Full flood extent',
                                                        style: {width: '190px'}
});

ee.List(cropAssessmentOpt).evaluate(function(option){
  dropdown_menu_cropAssessmentOpt.items().reset(option);
});

var Panel_cropAssessmentOpt = ui.Panel({
  widgets: [Label_cropAssessmentOpt, dropdown_menu_cropAssessmentOpt],
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: {stretch: 'horizontal'}
});
Panel.add(Panel_cropAssessmentOpt);

dropdown_menu_cropAssessmentOpt.onChange(function(callback) {
  assessment_option = dropdown_menu_cropAssessmentOpt.getValue();
  print('Assessment type', assessment_option);

  if (assessment_option === 'Full flood extent') {

    crops_for_assessment = inundated_cropland;

  } else if (assessment_option === 'Flood depth > 0.5m') {
    var flood_depth_gt_05m = flood_depth.gt(0.5);
    crops_for_assessment = crop_img.updateMask(flood_depth_gt_05m).rename('cropland');

  } else if (assessment_option === 'Flood depth > 1m') {
    var flood_depth_gt_1m = flood_depth.gt(1.0);
    crops_for_assessment = crop_img.updateMask(flood_depth_gt_1m).rename('cropland');

  } else {
    var flood_depth_gt_2m = flood_depth.gt(2.0);
    crops_for_assessment = crop_img.updateMask(flood_depth_gt_2m).rename('cropland');
  }

});



//////////////////--------------------- Click button to run assessment ------------------///////////////////////////

var Button_Run_assessment = ui.Button({
  label: 'Run land cover impact assessment',
  onClick: function() {

    assessmentPanel.remove(label_report);
    assessmentPanel.widgets().remove(Button_removeReport);
    mapPanel.widgets().remove(assessmentPanel);

    print('Assessment type', dropdown_menu_cropAssessmentOpt.getValue());

    var start_date = Textbox_eventStartDate.getValue();
    var end_date = Textbox_eventEndDate.getValue();

    if (dropdown_menu_cropAssessmentOpt.getValue() === 'Full flood extent') {
      crops_for_assessment = inundated_cropland;

    }


    var assessment = crops_for_assessment.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry: AOI,
      scale: resolution,
      maxPixels: 1e11,
    }).get('cropland');

    var crop_codes = ee.Dictionary(assessment).keys();

    var crop_names =  crop_codes.map(function (n) {
                        return lgd.get(n);
    });

    var summary_crops =  crop_codes.map(function (n) {
      var crop_count = ee.Dictionary(assessment).get(n);
      var crop_acre = ee.Number(crop_count).multiply(resolution).multiply(resolution).multiply(0.000247105); /// Convert pixel count to acres
      return crop_acre;
    });

    var joint_dict = ee.Dictionary.fromLists(crop_names, summary_crops);
    joint_dict = joint_dict.remove({selectors: ['Permanent water bodies',
                                                'Snow and ice'], ignoreMissing: true});

    var dict_sort = ee.Dictionary(joint_dict).values().sort();
    var sorted_keys = ee.Dictionary(joint_dict).keys().sort(ee.Dictionary(joint_dict).values());
    var dict_descending = dict_sort.reverse();
    var sorted_keys_dec = sorted_keys.reverse();


    var crop_list = ee.List.sequence(0, sorted_keys_dec.length().subtract(1));
    var display = function(n) {
      return ee.String(sorted_keys_dec.get(n)).cat(': ').cat('\t').cat(ee.Number(dict_descending.get(n)).format('%.2f')).cat('\n ');
    };

    label_report = ui.Label({

      value:  '*-*-*-*-*-*-*-*-* Land Cover Impact Assessment *-*-*-*-*-*-*-*-*' + '\n' +
              '--------------------------------------------------------------------------------------------' + '\n' +
              'Land cover data: ESA WorldCover ' +  cdl_year + '\n' +
              'State: ' + state_name + '\n' +
              'LGA: ' + county_name + '\n' +
              'Time period of assessment: ' + Textbox_eventStartDate.getValue() + ' - ' + Textbox_eventEndDate.getValue() + '\n' +
              'Time period of reference: ' + Textbox_imageStartDate.getValue() + ' - ' + Textbox_imageEndDate.getValue() + '\n' +
              'Assessment scope: ' + dropdown_menu_cropAssessmentOpt.getValue() + '\n' +
              '--------------------------------------------------------------------------------------------' + '\n' +
              'Land Cover Class' + '\t' + 'Acre' + '\n' +
              '--------------------------------------------------------------------------------------------' + '\n' +
              ',' + crop_list.map(display).getInfo(),

      style: {border: '2px solid black',
              textAlign: 'right',
              fontSize: '12px',
              whiteSpace: 'pre'
      }

    });
    label_report.style().set({
          position: 'middle-left',
          backgroundColor: 'faf0e6'
    });

    assessmentPanel = ui.Panel({
      style: {
        position: 'middle-left',
        height: '500px',
        stretch: 'vertical'
      }
    });

    assessmentPanel.add(label_report);

    Button_removeReport = ui.Button({
      label: 'Close',
      style: {position: 'bottom-center',},
      onClick: function() {
        assessmentPanel.widgets().remove(label_report);
        assessmentPanel.widgets().remove(Button_removeReport);
        mapPanel.widgets().remove(assessmentPanel);
      }
    });

    assessmentPanel.add(Button_removeReport);
    mapPanel.add(assessmentPanel);

  }
});
Panel.add(Button_Run_assessment);


var link = ui.Label('Li, Z. and Mueller, R., 2022, Near-real-time agricultural flood monitoring and crop damage ' +
           'assessment under Google Earth Engine, Pecora Conference 2022, Denver, Colorado, October 23 - 28, 2022.', {fontSize: '11px'},
           'https://pecora22.org/wp-content/uploads/2022/10/Pecora22-Final-Program.pdf');
var linkPanel = ui.Panel(
    [ui.Label('Citation', {fontWeight: 'bold'}), link]);
Panel.add(linkPanel);

var disclaimer = ui.Panel([
  ui.Label('Disclaimer: The author assumes no responsibility or liability for any errors or omissions in the content of this site. This app is currently under construction and the ' +
           'information contained in this site is provided on an "as is" basis with no guarantees of completeness, accuracy, usefulness or timeliness.'
           , {fontSize: '11px'})
]);
Panel.add(disclaimer);


// Create a panel and add it to the map.
var inspector = ui.Panel([ui.Label('Click map to get info')]);
inspector.style().set({
      position: 'top-right',
    });
mapPanel.add(inspector);

//////////////////------------------------------ Map click actions -----------------------///////////////////////////

mapPanel.onClick(function(coords) {

  inspector.widgets().remove(Button_removeDashboard);

  dashboardPanel.widgets().remove(Button_removeDashboard);
  mapPanel.widgets().remove(dashboardPanel);

  var point = ee.Geometry.Point(coords.lon, coords.lat);

  inspector.widgets().set(0, ui.Label({
    value: 'Loading...',
    style: {color: 'gray'}
  }));
  inspector.style().set({
        position: 'top-right',
  });

  //////////// Query states by name ////////////////////////
  var state_list = shp_us_states.reduceColumns(ee.Reducer.toList(), ['ADM1_NAME']).get('list');
  var shp_lst = shp_us_states.toList(shp_us_states.size());
  var retIdx = shp_lst.map(function (ele) {
    var idx = shp_lst.indexOf(ele);
    return ee.Algorithms.If(ee.Feature(ele).intersects(point), idx, 0);
  }).removeAll([0]);

  retIdx = retIdx.get(0).getInfo();
  var state_name_click = ee.List(state_list).get(retIdx);


  //////////// Query ADM1_CODE by state name ////////////////////////

  var shp_us_states_update = shp_us_states.filter(ee.Filter.eq('ADM1_NAME', state_name_click));
  print(shp_us_states_update);
  var statefp_list = shp_us_states_update.reduceColumns(ee.Reducer.toList(), ['ADM1_CODE']).get('list');
  var state_FP_click = ee.List(statefp_list).get(0);
  print('ADM1_CODE', state_FP_click);


  //////////// Query LGAs by name ////////////////////////
  shp_us_counties = counties.filter(ee.Filter.eq('ADM1_CODE', state_FP_click));
  var county_list = shp_us_counties.reduceColumns(ee.Reducer.toList(), ['ADM2_NAME']).get('list');
  var shp_lst2 = shp_us_counties.toList(shp_us_counties.size());
  var retIdx2 = shp_lst2.map(function (ele) {
    var idx = shp_lst2.indexOf(ele);
    return ee.Algorithms.If(ee.Feature(ele).intersects(point), idx, 0);
  }).removeAll([0]);

  retIdx2 = retIdx2.get(0).getInfo();
  var county_name_click = ee.List(county_list).get(retIdx2);


  var after_end_date = Textbox_eventEndDate.getValue();

  ///// ESA WorldCover has a single 2021 snapshot; no year-matching branch is needed. /////
  cdl_year = '2021 (ESA WorldCover v200)';
  crop_yyyy = worldcover_img;


  if (flood_depth_col.size().getInfo() > 0) {
    flood_depth_unmasked = flood_depth.unmask(-9999);
  }

  if (s2Col_postEvent.size().getInfo() > 0) {
    s2_mndwi_Xu_postEvent_unmasked = s2_mndwi_Xu_postEvent.unmask(9999);
    s2_b8_postEvent_unmasked = s2_b8_postEvent.unmask(-9999);
  }

  if (s2Col_preEvent.size().getInfo() > 0) {
    s2_mndwi_Xu_preEvent_unmasked = s2_mndwi_Xu_preEvent.unmask(9999);
  }

  if (l89Col_postEvent.size().getInfo() > 0) {
    l89_mndwi_Xu_postEvent_unmasked = l89_mndwi_Xu_postEvent.unmask(9999);
    l89_b5_postEvent_unmasked = l89_b5_postEvent.unmask(-9999);
  }

  if (l89Col_preEvent.size().getInfo() > 0) {
    l89_mndwi_Xu_preEvent_unmasked = l89_mndwi_Xu_preEvent.unmask(9999);
  }

  if (multiSensor_mndwi_Xu_postEvent_Col.size().getInfo() > 0) {
    multiSensor_mndwi_Xu_postEvent_unmasked = multiSensor_mndwi_Xu_postEvent.unmask(9999);
  }

  if (multiSensor_mndwi_Xu_preEvent_Col.size().getInfo() > 0) {
    multiSensor_mndwi_Xu_preEvent_unmasked = multiSensor_mndwi_Xu_preEvent.unmask(9999);
  }

/////////********* Code below that uses evaluate function is very fast and efficient for data querry ********* //////////
  var img_list = ee.List([dem, flood_depth_unmasked,
                          crop_yyyy, crop_2023,
                          s2_mndwi_Xu_postEvent_unmasked, s2_mndwi_Xu_preEvent_unmasked,
                          l89_mndwi_Xu_postEvent_unmasked, l89_mndwi_Xu_preEvent_unmasked,
                          multiSensor_mndwi_Xu_postEvent_unmasked, multiSensor_mndwi_Xu_preEvent_unmasked,
                          ]);

  var label_list = img_list.map(function(img) {
    var img_to_querry = ee.Image(img).reduce('first').rename('value');
    var sample = img_to_querry.sample(point, 30);
    return sample.first().get('value');
  });

  label_list.evaluate(function(result) {

    var label_dem = 'N/A';
    print('dem bands', dem.bandNames().size())
    if (dem.bandNames().size() > 0) {
      label_dem = ee.Number(ee.List(result).get(0)).format('%.2f').getInfo() + ' m';
    }

    var label_floodDepth = 'N/A';
    if (ee.Number(ee.List(result).get(1)).getInfo() !== -9999) {
      label_floodDepth = ee.Number(ee.List(result).get(1)).format('%.2f').getInfo() + ' m';
    }


    var label_crop_yyyy = lgd.get(ee.List(result).get(2)).getInfo();


    var label_postEventMNDWI_s2 = 'N/A';
    if (ee.Number(ee.List(result).get(4)).getInfo() !== 9999) {
      label_postEventMNDWI_s2 = ee.Number(ee.List(result).get(4)).format('%.2f').getInfo();
    }

    var label_preEventMNDWI_s2 = 'N/A';
    if (ee.Number(ee.List(result).get(5)).getInfo() !== 9999) {
      label_preEventMNDWI_s2 = ee.Number(ee.List(result).get(5)).format('%.2f').getInfo();
    }

    var label_postEventMNDWI_l89 = 'N/A';
    if (ee.Number(ee.List(result).get(6)).getInfo() !== 9999) {
      label_postEventMNDWI_l89 = ee.Number(ee.List(result).get(6)).format('%.2f').getInfo();
    }

    var label_preEventMNDWI_l89 = 'N/A';
    if (ee.Number(ee.List(result).get(7)).getInfo() !== 9999) {
      label_preEventMNDWI_l89 = ee.Number(ee.List(result).get(7)).format('%.2f').getInfo();
    }

    var label_postEventMNDWI_s2l89 = 'N/A';
    if (ee.Number(ee.List(result).get(8)).getInfo() !== 9999) {
      label_postEventMNDWI_s2l89 = ee.Number(ee.List(result).get(8)).format('%.2f').getInfo();
    }

    var label_preEventMNDWI_s2l89 = 'N/A';
    if (ee.Number(ee.List(result).get(9)).getInfo() !== 9999) {
      label_preEventMNDWI_s2l89 = ee.Number(ee.List(result).get(9)).format('%.2f').getInfo();
    }


    inspector.widgets().set(0, ui.Label({
      value:

            '*-*-*-*-*-*-*-* Dashboard *-*-*-*-*-*-*-*' + '\n' +
            'Lat: ' + coords.lat.toFixed(2) + '; Lon: ' + coords.lon.toFixed(2)  + '\n' +
            'State: ' + state_name_click.getInfo() + '\n' +
            'LGA: ' + county_name_click.getInfo() + '\n' +
            '---------------------------------------------------------' + '\n' +
            'Elevation: ' + ee.Number(ee.List(result).get(0)).format('%.2f').getInfo() + ' m' + '\n' +
            'Flood depth: ' + label_floodDepth + '\n' +
            'Land cover (ESA WorldCover 2021): ' + label_crop_yyyy + '\n' +
            'S2 post-event MNDWI (max): ' + label_postEventMNDWI_s2 + '\n' +
            'S2 pre-event MNDWI (median): ' + label_preEventMNDWI_s2 + '\n' +
            'L8/9 post-event MNDWI (max): ' + label_postEventMNDWI_l89 + '\n' +
            'L8/9 pre-event MNDWI (median): ' + label_preEventMNDWI_l89 + '\n' +
            'Multi-sensor post-event MNDWI (max): ' + label_postEventMNDWI_s2l89 + '\n' +
            'Multi-sensor pre-event MNDWI (median): ' + label_preEventMNDWI_s2l89,

      style: {border: '2px solid darkgray', whiteSpace: 'pre'}

    }));

  });

    Button_removeDashboard = ui.Button({
      label: 'Close',
      style: {position: 'bottom-center',},
      onClick: function() {
        inspector.widgets().remove(Button_removeDashboard);
        mapPanel.widgets().remove(inspector);
        inspector = ui.Panel([ui.Label('Click map to get info')]);
        mapPanel.add(inspector);
      }
    });

    inspector.add(Button_removeDashboard);


});
mapPanel.style().set('cursor', 'crosshair');


// Replace the root with a SplitPanel that contains the inspector and map.
ui.root.clear();
ui.root.add(ui.SplitPanel(Panel, mapPanel));
