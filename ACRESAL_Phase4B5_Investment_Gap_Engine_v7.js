// ============================================================================
// ACReSAL NATIONAL GEOSPATIAL DECISION SUPPORT SYSTEM
// ============================================================================
// PHASE 4B.5 v7
// INTERVENTION-SPECIFIC INVESTMENT GAP ENGINE
//
// FINAL MEMORY-OPTIMIZED VERSION
//
// PURPOSE
// -------
// Build intervention-specific relative investment gaps for the 20 strategic
// ACReSAL catchments.
//
// MAJOR ARCHITECTURAL FIX
// -----------------------
// v6 successfully performed:
//
//   1. One spatial intervention-to-catchment assignment
//   2. One intervention classification
//   3. Six grouped reductions
//
// However, the subsequent join-based family table construction retained only
// catchments having matching intervention records.
//
// v7 fixes this by:
//
//   1. Performing the six grouped reductions.
//   2. Converting each sparse result into a small server-side dictionary.
//   3. Rebuilding ALL 20 catchments for every intervention family.
//   4. Filling absent intervention-family records with ZERO.
//   5. Normalizing the completed 20-catchment family tables.
//   6. Creating a final 20-catchment gap master.
//
// ============================================================================
//
// CORE FAMILIES
// -------------
// Irrigation
// Wetland Restoration
// Erosion Control
// Reforestation
// Flood Mitigation
// Agricultural Productivity
//
// ============================================================================
//
// INVESTMENT INTENSITY
// --------------------
//
// 40% Project Density
// 40% Area Coverage
// 20% Beneficiary Density
//
// Investment Gap:
//
// Gap = 1 - Existing Investment Intensity
//
// IMPORTANT
// ---------
// The gap is a RELATIVE index across the 20 ACReSAL catchments.
// It is NOT a percentage of unmet need.
//
// ============================================================================


// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var VERSION =
  'ACReSAL_Phase_4B5_v7';

var OUTPUT_FOLDER =
  'ACRESAL_DSS';

var CATCHMENT_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_Project_Catchments';

var INTERVENTION_ASSET =
  'projects/ee-samuelcool28/assets/ACRESAL_Intervention_Sites';

var OUTPUT_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4B5_Intervention_Gaps_v7';


// ============================================================================
// 2. LOAD DATA
// ============================================================================

var CATCHMENTS =
  ee.FeatureCollection(
    CATCHMENT_ASSET
  );

var INTERVENTIONS =
  ee.FeatureCollection(
    INTERVENTION_ASSET
  );


// ============================================================================
// 3. CORE FAMILIES
// ============================================================================

var CORE_FAMILIES = [

  'Irrigation',
  'Wetland Restoration',
  'Erosion Control',
  'Reforestation',
  'Flood Mitigation',
  'Agricultural Productivity'

];


// ============================================================================
// 4. HEADER
// ============================================================================

print('============================================================');
print('ACReSAL PHASE 4B.5 v7');
print('INTERVENTION-SPECIFIC INVESTMENT GAP ENGINE');
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
  'Existing intervention records:',
  INTERVENTIONS.size()
);

print(
  'Output asset:',
  OUTPUT_ASSET
);


// ============================================================================
// 5. LIGHTWEIGHT INTERVENTION TABLE
// ============================================================================

var INTERVENTION_LITE =
  INTERVENTIONS.select([

    'ActivityID',

    'Interv_Typ',
    'Component',
    'Sub_compon',

    'Benefi_pop',

    'Area_Impac',
    'Area_Intev',
    'Ha',
    'Netsize_Ha',

    'No_Trees_',
    'No_Trees_P',

    'State',
    'LGA',

    'Stra_Catch',
    'Micr_Catch'

  ]);


// ============================================================================
// 6. CREATE INTERVENTION CENTROIDS
// ============================================================================

var INTERVENTION_POINTS =
  INTERVENTION_LITE.map(
    function(feature) {

      return feature.setGeometry(

        feature.geometry()
          .centroid({

            maxError:
              100

          })

      );

    }
  );


// ============================================================================
// 7. SINGLE SPATIAL ASSIGNMENT
// ============================================================================

print('============================================================');
print('ASSIGNING INTERVENTIONS TO STRATEGIC CATCHMENTS');
print('============================================================');

var JOIN_FILTER =
  ee.Filter.intersects({

    leftField:
      '.geo',

    rightField:
      '.geo',

    maxError:
      100

  });


var JOINED =
  ee.Join.saveFirst(
    'Matched_Catchment'
  )
  .apply(

    INTERVENTION_POINTS,

    CATCHMENTS,

    JOIN_FILTER

  );


// ============================================================================
// 8. KEEP ASSIGNED INTERVENTIONS ONLY
// ============================================================================

var ASSIGNED =
  ee.FeatureCollection(
    JOINED
  )
  .filter(
    ee.Filter.notNull(
      [
        'Matched_Catchment'
      ]
    )
  )
  .map(
    function(feature) {

      var matched =
        ee.Feature(
          feature.get(
            'Matched_Catchment'
          )
        );


      return feature.set({

        'Assigned_Catchment_Id':
          matched.get(
            'Id'
          ),

        'Assigned_Catchment_Name':
          matched.get(
            'NAME'
          )

      });

    }
  );


print('============================================================');
print('SPATIAL ASSIGNMENT VALIDATION');
print('============================================================');

print(
  'Original interventions:',
  INTERVENTIONS.size()
);

print(
  'Assigned interventions:',
  ASSIGNED.size()
);

print(
  'Unassigned interventions:',
  INTERVENTIONS.size()
    .subtract(
      ASSIGNED.size()
    )
);

print(
  'Distinct assigned catchments:',
  ASSIGNED
    .aggregate_array(
      'Assigned_Catchment_Id'
    )
    .distinct()
    .size()
);


// ============================================================================
// 9. SAFE TEXT STANDARDIZATION
// ============================================================================

var TEXT_READY =
  ASSIGNED.map(
    function(feature) {

      var type =
        ee.String(
          ee.Algorithms.If(

            feature.get(
              'Interv_Typ'
            ),

            feature.get(
              'Interv_Typ'
            ),

            ''

          )
        )
        .toLowerCase();


      var component =
        ee.String(
          ee.Algorithms.If(

            feature.get(
              'Component'
            ),

            feature.get(
              'Component'
            ),

            ''

          )
        )
        .toLowerCase();


      var subcomponent =
        ee.String(
          ee.Algorithms.If(

            feature.get(
              'Sub_compon'
            ),

            feature.get(
              'Sub_compon'
            ),

            ''

          )
        )
        .toLowerCase();


      return feature.set({

        'Classification_Text':
          type
            .cat(' | ')
            .cat(component)
            .cat(' | ')
            .cat(subcomponent)

      });

    }
  );


// ============================================================================
// 10. SERVER-SIDE TEXT MATCH
// ============================================================================

function hasText(
  text,
  keyword
) {

  return ee.String(
    text
  )
  .index(
    keyword
  )
  .gte(
    0
  );

}


// ============================================================================
// 11. CLASSIFICATION
// ============================================================================

var CLASSIFIED =
  TEXT_READY.map(
    function(feature) {

      var text =
        ee.String(
          feature.get(
            'Classification_Text'
          )
        );


      // -----------------------------------------------------------------------
      // FLOOD
      // -----------------------------------------------------------------------

      var flood =
        hasText(
          text,
          'flood'
        )
        .or(
          hasText(
            text,
            'stormwater'
          )
        )
        .or(
          hasText(
            text,
            'drainage'
          )
        )
        .or(
          hasText(
            text,
            'dyke'
          )
        )
        .or(
          hasText(
            text,
            'dike'
          )
        )
        .or(
          hasText(
            text,
            'embankment'
          )
        );


      // -----------------------------------------------------------------------
      // EROSION
      // -----------------------------------------------------------------------

      var erosion =
        hasText(
          text,
          'erosion'
        )
        .or(
          hasText(
            text,
            'gully'
          )
        )
        .or(
          hasText(
            text,
            'ravine'
          )
        )
        .or(
          hasText(
            text,
            'sediment'
          )
        )
        .or(
          hasText(
            text,
            'riverbank'
          )
        )
        .or(
          hasText(
            text,
            'bank protection'
          )
        );


      // -----------------------------------------------------------------------
      // WETLAND
      // -----------------------------------------------------------------------

      var wetland =
        hasText(
          text,
          'wetland'
        )
        .or(
          hasText(
            text,
            'swamp'
          )
        )
        .or(
          hasText(
            text,
            'marsh'
          )
        )
        .or(
          hasText(
            text,
            'riparian'
          )
        );


      // -----------------------------------------------------------------------
      // IRRIGATION
      // -----------------------------------------------------------------------

      var irrigation =
        hasText(
          text,
          'irrigation'
        )
        .or(
          hasText(
            text,
            'irrigat'
          )
        )
        .or(
          hasText(
            text,
            'canal'
          )
        )
        .or(
          hasText(
            text,
            'water harvesting'
          )
        )
        .or(
          hasText(
            text,
            'water harv'
          )
        );


      // -----------------------------------------------------------------------
      // REFORESTATION
      // -----------------------------------------------------------------------

      var reforestation =
        hasText(
          text,
          'reforestation'
        )
        .or(
          hasText(
            text,
            'afforestation'
          )
        )
        .or(
          hasText(
            text,
            'tree planting'
          )
        )
        .or(
          hasText(
            text,
            'tree establishment'
          )
        )
        .or(
          hasText(
            text,
            'forest restoration'
          )
        )
        .or(
          hasText(
            text,
            'agroforestry'
          )
        )
        .or(
          hasText(
            text,
            'woodlot'
          )
        )
        .or(
          hasText(
            text,
            'shelterbelt'
          )
        )
        .or(
          hasText(
            text,
            'tree nursery'
          )
        );


      // -----------------------------------------------------------------------
      // AGRICULTURE
      // -----------------------------------------------------------------------

      var agriculture =
        hasText(
          text,
          'agriculture'
        )
        .or(
          hasText(
            text,
            'agricultural'
          )
        )
        .or(
          hasText(
            text,
            'crop'
          )
        )
        .or(
          hasText(
            text,
            'farm'
          )
        )
        .or(
          hasText(
            text,
            'farming'
          )
        )
        .or(
          hasText(
            text,
            'production'
          )
        )
        .or(
          hasText(
            text,
            'livelihood'
          )
        )
        .or(
          hasText(
            text,
            'smallholder'
          )
        );


      // -----------------------------------------------------------------------
      // FINAL FAMILY
      // -----------------------------------------------------------------------

      var family =
        ee.String(

          ee.Algorithms.If(

            flood,

            'Flood Mitigation',

            ee.Algorithms.If(

              erosion,

              'Erosion Control',

              ee.Algorithms.If(

                wetland,

                'Wetland Restoration',

                ee.Algorithms.If(

                  irrigation,

                  'Irrigation',

                  ee.Algorithms.If(

                    reforestation,

                    'Reforestation',

                    ee.Algorithms.If(

                      agriculture,

                      'Agricultural Productivity',

                      'Other / Unclassified'

                    )

                  )

                )

              )

            )

          )

        );


      return feature.set({

        'Core_Intervention':
          family

      });

    }
  );


// ============================================================================
// 12. CLASSIFICATION DIAGNOSTICS
// ============================================================================

print('============================================================');
print('CORE INTERVENTION FAMILY FREQUENCY');
print('============================================================');

print(
  CLASSIFIED.aggregate_histogram(
    'Core_Intervention'
  )
);


var UNCLASSIFIED =
  CLASSIFIED.filter(
    ee.Filter.eq(
      'Core_Intervention',
      'Other / Unclassified'
    )
  );


print('============================================================');
print('OTHER / UNCLASSIFIED');
print('============================================================');

print(
  'Unclassified assigned records:',
  UNCLASSIFIED.size()
);


// ============================================================================
// 13. INTERVENTION TYPE MAPPING
// ============================================================================

var UNIQUE_TYPES =
  CLASSIFIED
    .aggregate_array(
      'Interv_Typ'
    )
    .distinct()
    .sort();


var TYPE_MAPPING =
  ee.FeatureCollection(

    UNIQUE_TYPES.map(
      function(type) {

        var subset =
          CLASSIFIED.filter(
            ee.Filter.eq(
              'Interv_Typ',
              type
            )
          );


        return ee.Feature(
          null,
          {

            'Intervention_Type':
              type,

            'Mapped_Core_Intervention':
              subset.aggregate_first(
                'Core_Intervention'
              ),

            'Project_Count':
              subset.size(),

            'Components':
              subset
                .aggregate_array(
                  'Component'
                )
                .distinct()
                .join('; '),

            'Subcomponents':
              subset
                .aggregate_array(
                  'Sub_compon'
                )
                .distinct()
                .join('; ')

          }

        );

      }
    )

  );


print('============================================================');
print('INTERVENTION TYPE MAPPING');
print('============================================================');

print(
  TYPE_MAPPING
);


// ============================================================================
// 14. MAKE NUMERIC VARIABLES SAFE
// ============================================================================

var SAFE_NUMERIC =
  CLASSIFIED.map(
    function(feature) {

      var beneficiaries =
        ee.Number(
          ee.Algorithms.If(

            feature.get(
              'Benefi_pop'
            ),

            feature.get(
              'Benefi_pop'
            ),

            0

          )
        );


      var ha =
        ee.Number(
          ee.Algorithms.If(

            feature.get(
              'Ha'
            ),

            feature.get(
              'Ha'
            ),

            0

          )
        );


      var impactArea =
        ee.Number(
          ee.Algorithms.If(

            feature.get(
              'Area_Impac'
            ),

            feature.get(
              'Area_Impac'
            ),

            0

          )
        );


      var interventionArea =
        ee.Number(
          ee.Algorithms.If(

            feature.get(
              'Area_Intev'
            ),

            feature.get(
              'Area_Intev'
            ),

            0

          )
        );


      var netArea =
        ee.Number(
          ee.Algorithms.If(

            feature.get(
              'Netsize_Ha'
            ),

            feature.get(
              'Netsize_Ha'
            ),

            0

          )
        );


      return feature.set({

        'Gap_Beneficiaries':
          beneficiaries,

        'Gap_Ha':
          ha,

        'Gap_Impact_Area':
          impactArea,

        'Gap_Intervention_Area':
          interventionArea,

        'Gap_Net_Area':
          netArea,

        'Gap_Record':
          1

      });

    }
  );


// ============================================================================
// 15. GROUPED REDUCTION FUNCTION
// ============================================================================
//
// Six numeric values are summed and grouped by catchment ID.
//
// ============================================================================

function groupedFamilyReduction(
  family
) {

  var subset =
    SAFE_NUMERIC.filter(
      ee.Filter.eq(
        'Core_Intervention',
        family
      )
    );


  var reduction =
    subset.reduceColumns({

      selectors: [

        'Gap_Ha',
        'Gap_Impact_Area',
        'Gap_Intervention_Area',
        'Gap_Net_Area',
        'Gap_Beneficiaries',
        'Gap_Record',
        'Assigned_Catchment_Id'

      ],

      reducer:

        ee.Reducer.sum()
          .repeat(
            6
          )
          .group({

            groupField:
              6,

            groupName:
              'Catchment_Id'

          })

    });


  var groups =
    ee.List(
      reduction.get(
        'groups'
      )
    );


  return ee.FeatureCollection(

    groups.map(
      function(item) {

        var group =
          ee.Dictionary(
            item
          );


        var sums =
          ee.List(
            group.get(
              'sum'
            )
          );


        return ee.Feature(
          null,
          {

            'Id':
              group.get(
                'Catchment_Id'
              ),

            'Core_Intervention':
              family,

            'Existing_Ha':
              sums.get(
                0
              ),

            'Existing_Impact_Area':
              sums.get(
                1
              ),

            'Existing_Intervention_Area':
              sums.get(
                2
              ),

            'Existing_Net_Area':
              sums.get(
                3
              ),

            'Existing_Beneficiaries':
              sums.get(
                4
              ),

            'Existing_Project_Count':
              sums.get(
                5
              )

          }

        );

      }
    )

  );

}


// ============================================================================
// 16. SIX SPARSE FAMILY TABLES
// ============================================================================

print('============================================================');
print('CREATING GROUPED INTERVENTION SUMMARIES');
print('============================================================');

var IRRIGATION_GROUP =
  groupedFamilyReduction(
    'Irrigation'
  );

var WETLAND_GROUP =
  groupedFamilyReduction(
    'Wetland Restoration'
  );

var EROSION_GROUP =
  groupedFamilyReduction(
    'Erosion Control'
  );

var REFORESTATION_GROUP =
  groupedFamilyReduction(
    'Reforestation'
  );

var FLOOD_GROUP =
  groupedFamilyReduction(
    'Flood Mitigation'
  );

var AGRICULTURE_GROUP =
  groupedFamilyReduction(
    'Agricultural Productivity'
  );


// ============================================================================
// 17. SPARSE GROUP DIAGNOSTICS
// ============================================================================

print('============================================================');
print('SPARSE GROUP COUNTS');
print('============================================================');

print(
  'Irrigation grouped catchments:',
  IRRIGATION_GROUP.size()
);

print(
  'Wetland grouped catchments:',
  WETLAND_GROUP.size()
);

print(
  'Erosion grouped catchments:',
  EROSION_GROUP.size()
);

print(
  'Reforestation grouped catchments:',
  REFORESTATION_GROUP.size()
);

print(
  'Flood grouped catchments:',
  FLOOD_GROUP.size()
);

print(
  'Agriculture grouped catchments:',
  AGRICULTURE_GROUP.size()
);


// ============================================================================
// 18. BUILD LOOKUP DICTIONARIES
// ============================================================================
//
// Each sparse family table is converted to dictionaries keyed by catchment ID.
//
// This is the critical performance optimization.
//
// ============================================================================

function makeDictionary(
  collection,
  idField,
  valueField
) {

  var lists =
    collection.reduceColumns({

      reducer:
        ee.Reducer.toList()
          .repeat(
            2
          ),

      selectors: [

        idField,
        valueField

      ]

    });


  var listValues =
    ee.List(
      lists.get(
        'list'
      )
    );


  var idList =
    ee.List(
      listValues.get(
        0
      )
    )
    .map(
      function(id) {

        return ee.Number(
          id
        )
        .format(
          '%d'
        );

      }
    );


  var valueList =
    ee.List(
      listValues.get(
        1
      )
    );


  return ee.Dictionary.fromLists(
    idList,
    valueList
  );

}


// ============================================================================
// 19. FAMILY DICTIONARIES
// ============================================================================

var IRR_HA =
  makeDictionary(
    IRRIGATION_GROUP,
    'Id',
    'Existing_Ha'
  );

var IRR_IMPACT =
  makeDictionary(
    IRRIGATION_GROUP,
    'Id',
    'Existing_Impact_Area'
  );

var IRR_AREA =
  makeDictionary(
    IRRIGATION_GROUP,
    'Id',
    'Existing_Intervention_Area'
  );

var IRR_NET =
  makeDictionary(
    IRRIGATION_GROUP,
    'Id',
    'Existing_Net_Area'
  );

var IRR_BEN =
  makeDictionary(
    IRRIGATION_GROUP,
    'Id',
    'Existing_Beneficiaries'
  );

var IRR_COUNT =
  makeDictionary(
    IRRIGATION_GROUP,
    'Id',
    'Existing_Project_Count'
  );


var WET_HA =
  makeDictionary(
    WETLAND_GROUP,
    'Id',
    'Existing_Ha'
  );

var WET_IMPACT =
  makeDictionary(
    WETLAND_GROUP,
    'Id',
    'Existing_Impact_Area'
  );

var WET_AREA =
  makeDictionary(
    WETLAND_GROUP,
    'Id',
    'Existing_Intervention_Area'
  );

var WET_NET =
  makeDictionary(
    WETLAND_GROUP,
    'Id',
    'Existing_Net_Area'
  );

var WET_BEN =
  makeDictionary(
    WETLAND_GROUP,
    'Id',
    'Existing_Beneficiaries'
  );

var WET_COUNT =
  makeDictionary(
    WETLAND_GROUP,
    'Id',
    'Existing_Project_Count'
  );


var ERO_HA =
  makeDictionary(
    EROSION_GROUP,
    'Id',
    'Existing_Ha'
  );

var ERO_IMPACT =
  makeDictionary(
    EROSION_GROUP,
    'Id',
    'Existing_Impact_Area'
  );

var ERO_AREA =
  makeDictionary(
    EROSION_GROUP,
    'Id',
    'Existing_Intervention_Area'
  );

var ERO_NET =
  makeDictionary(
    EROSION_GROUP,
    'Id',
    'Existing_Net_Area'
  );

var ERO_BEN =
  makeDictionary(
    EROSION_GROUP,
    'Id',
    'Existing_Beneficiaries'
  );

var ERO_COUNT =
  makeDictionary(
    EROSION_GROUP,
    'Id',
    'Existing_Project_Count'
  );


var REF_HA =
  makeDictionary(
    REFORESTATION_GROUP,
    'Id',
    'Existing_Ha'
  );

var REF_IMPACT =
  makeDictionary(
    REFORESTATION_GROUP,
    'Id',
    'Existing_Impact_Area'
  );

var REF_AREA =
  makeDictionary(
    REFORESTATION_GROUP,
    'Id',
    'Existing_Intervention_Area'
  );

var REF_NET =
  makeDictionary(
    REFORESTATION_GROUP,
    'Id',
    'Existing_Net_Area'
  );

var REF_BEN =
  makeDictionary(
    REFORESTATION_GROUP,
    'Id',
    'Existing_Beneficiaries'
  );

var REF_COUNT =
  makeDictionary(
    REFORESTATION_GROUP,
    'Id',
    'Existing_Project_Count'
  );


var FLOOD_HA =
  makeDictionary(
    FLOOD_GROUP,
    'Id',
    'Existing_Ha'
  );

var FLOOD_IMPACT =
  makeDictionary(
    FLOOD_GROUP,
    'Id',
    'Existing_Impact_Area'
  );

var FLOOD_AREA =
  makeDictionary(
    FLOOD_GROUP,
    'Id',
    'Existing_Intervention_Area'
  );

var FLOOD_NET =
  makeDictionary(
    FLOOD_GROUP,
    'Id',
    'Existing_Net_Area'
  );

var FLOOD_BEN =
  makeDictionary(
    FLOOD_GROUP,
    'Id',
    'Existing_Beneficiaries'
  );

var FLOOD_COUNT =
  makeDictionary(
    FLOOD_GROUP,
    'Id',
    'Existing_Project_Count'
  );


var AGR_HA =
  makeDictionary(
    AGRICULTURE_GROUP,
    'Id',
    'Existing_Ha'
  );

var AGR_IMPACT =
  makeDictionary(
    AGRICULTURE_GROUP,
    'Id',
    'Existing_Impact_Area'
  );

var AGR_AREA =
  makeDictionary(
    AGRICULTURE_GROUP,
    'Id',
    'Existing_Intervention_Area'
  );

var AGR_NET =
  makeDictionary(
    AGRICULTURE_GROUP,
    'Id',
    'Existing_Net_Area'
  );

var AGR_BEN =
  makeDictionary(
    AGRICULTURE_GROUP,
    'Id',
    'Existing_Beneficiaries'
  );

var AGR_COUNT =
  makeDictionary(
    AGRICULTURE_GROUP,
    'Id',
    'Existing_Project_Count'
  );


// ============================================================================
// 20. CATCHMENT AREA TABLE
// ============================================================================

var CATCHMENT_BASE =
  CATCHMENTS.map(
    function(catchment) {

      var areaKm2 =
        catchment.geometry()
          .area({
            maxError:
              100
          })
          .divide(
            1000000
          );


      return catchment.set({

        'Catchment_Area_km2':
          areaKm2

      });

    }
  );


// ============================================================================
// 21. COMPLETE FAMILY TABLE BUILDER
// ============================================================================
//
// IMPORTANT:
//
// Every official catchment is returned.
//
// Missing family records are assigned zero.
//
// ============================================================================

function completeFamilyTable(
  family,
  haDict,
  impactDict,
  areaDict,
  netDict,
  beneficiaryDict,
  countDict
) {

  return CATCHMENT_BASE.map(
    function(catchment) {

      var id =
        catchment.get(
          'Id'
        );


      var idKey =
        ee.Number(
          id
        )
        .format(
          '%d'
        );


      var areaKm2 =
        ee.Number(
          catchment.get(
            'Catchment_Area_km2'
          )
        );


      // -----------------------------------------------------------------------
      // Defaults
      // -----------------------------------------------------------------------

      var existingHa =
        ee.Number(
          haDict.get(
            idKey,
            0
          )
        );


      var impactArea =
        ee.Number(
          impactDict.get(
            idKey,
            0
          )
        );


      var interventionArea =
        ee.Number(
          areaDict.get(
            idKey,
            0
          )
        );


      var netArea =
        ee.Number(
          netDict.get(
            idKey,
            0
          )
        );


      var beneficiaries =
        ee.Number(
          beneficiaryDict.get(
            idKey,
            0
          )
        );


      var projectCount =
        ee.Number(
          countDict.get(
            idKey,
            0
          )
        );


      var safeArea =
        ee.Number(
          ee.Algorithms.If(

            areaKm2.gt(0),

            areaKm2,

            1

          )
        );


      var projectDensity =
        projectCount
          .divide(
            safeArea
          );


      var areaCoverage =
        existingHa
          .divide(
            safeArea
              .multiply(
                100
              )
          )
          .multiply(
            100
          );


      var beneficiaryDensity =
        beneficiaries
          .divide(
            safeArea
          );


      return ee.Feature(
        null,
        {

          'Id':
            id,

          'NAME':
            catchment.get(
              'NAME'
            ),

          'Core_Intervention':
            family,

          'Catchment_Area_km2':
            areaKm2,

          'Existing_Project_Count':
            projectCount,

          'Existing_Ha':
            existingHa,

          'Existing_Impact_Area':
            impactArea,

          'Existing_Intervention_Area':
            interventionArea,

          'Existing_Net_Area':
            netArea,

          'Existing_Beneficiaries':
            beneficiaries,

          'Project_Density_per_km2':
            projectDensity,

          'Area_Coverage_pct':
            areaCoverage,

          'Beneficiary_Density_per_km2':
            beneficiaryDensity

        }

      );

    }
  );

}


// ============================================================================
// 22. COMPLETE SIX FAMILY TABLES
// ============================================================================

print('============================================================');
print('CREATING COMPLETE 20-CATCHMENT FAMILY TABLES');
print('============================================================');


var IRRIGATION_TABLE =
  completeFamilyTable(
    'Irrigation',
    IRR_HA,
    IRR_IMPACT,
    IRR_AREA,
    IRR_NET,
    IRR_BEN,
    IRR_COUNT
  );


var WETLAND_TABLE =
  completeFamilyTable(
    'Wetland Restoration',
    WET_HA,
    WET_IMPACT,
    WET_AREA,
    WET_NET,
    WET_BEN,
    WET_COUNT
  );


var EROSION_TABLE =
  completeFamilyTable(
    'Erosion Control',
    ERO_HA,
    ERO_IMPACT,
    ERO_AREA,
    ERO_NET,
    ERO_BEN,
    ERO_COUNT
  );


var REFORESTATION_TABLE =
  completeFamilyTable(
    'Reforestation',
    REF_HA,
    REF_IMPACT,
    REF_AREA,
    REF_NET,
    REF_BEN,
    REF_COUNT
  );


var FLOOD_TABLE =
  completeFamilyTable(
    'Flood Mitigation',
    FLOOD_HA,
    FLOOD_IMPACT,
    FLOOD_AREA,
    FLOOD_NET,
    FLOOD_BEN,
    FLOOD_COUNT
  );


var AGRICULTURE_TABLE =
  completeFamilyTable(
    'Agricultural Productivity',
    AGR_HA,
    AGR_IMPACT,
    AGR_AREA,
    AGR_NET,
    AGR_BEN,
    AGR_COUNT
  );


// ============================================================================
// 23. FAMILY TABLE VALIDATION
// ============================================================================

print('============================================================');
print('COMPLETE FAMILY TABLE COUNTS');
print('============================================================');

print(
  'Irrigation:',
  IRRIGATION_TABLE.size()
);

print(
  'Wetland:',
  WETLAND_TABLE.size()
);

print(
  'Erosion:',
  EROSION_TABLE.size()
);

print(
  'Reforestation:',
  REFORESTATION_TABLE.size()
);

print(
  'Flood:',
  FLOOD_TABLE.size()
);

print(
  'Agriculture:',
  AGRICULTURE_TABLE.size()
);


// ============================================================================
// 24. NORMALIZATION FUNCTION
// ============================================================================

function normalizeFamily(
  collection,
  inputField,
  outputField
) {

  var stats =
    collection.reduceColumns({

      reducer:
        ee.Reducer.minMax(),

      selectors:
        [
          inputField
        ]

    });


  var minimum =
    ee.Number(
      stats.get(
        'min'
      )
    );


  var maximum =
    ee.Number(
      stats.get(
        'max'
      )
    );


  var range =
    maximum
      .subtract(
        minimum
      );


  return collection.map(
    function(feature) {

      var value =
        ee.Number(
          feature.get(
            inputField
          )
        );


      var normalized =
        ee.Number(

          ee.Algorithms.If(

            range.gt(0),

            value
              .subtract(
                minimum
              )
              .divide(
                range
              )
              .clamp(
                0,
                1
              ),

            0

          )

        );


      return feature.set(
        outputField,
        normalized
      );

    }
  );

}


// ============================================================================
// 25. NORMALIZE SIX FAMILY TABLES
// ============================================================================

// IRRIGATION

IRRIGATION_TABLE =
  normalizeFamily(
    IRRIGATION_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

IRRIGATION_TABLE =
  normalizeFamily(
    IRRIGATION_TABLE,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

IRRIGATION_TABLE =
  normalizeFamily(
    IRRIGATION_TABLE,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// WETLAND

WETLAND_TABLE =
  normalizeFamily(
    WETLAND_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

WETLAND_TABLE =
  normalizeFamily(
    WETLAND_TABLE,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

WETLAND_TABLE =
  normalizeFamily(
    WETLAND_TABLE,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// EROSION

EROSION_TABLE =
  normalizeFamily(
    EROSION_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

EROSION_TABLE =
  normalizeFamily(
    EROSION_TABLE,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

EROSION_TABLE =
  normalizeFamily(
    EROSION_TABLE,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// REFORESTATION

REFORESTATION_TABLE =
  normalizeFamily(
    REFORESTATION_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

REFORESTATION_TABLE =
  normalizeFamily(
    REFORESTATION_TABLE,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

REFORESTATION_TABLE =
  normalizeFamily(
    REFORESTATION_TABLE,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// FLOOD

FLOOD_TABLE =
  normalizeFamily(
    FLOOD_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

FLOOD_TABLE =
  normalizeFamily(
    FLOOD_TABLE,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

FLOOD_TABLE =
  normalizeFamily(
    FLOOD_TABLE,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// AGRICULTURE

AGRICULTURE_TABLE =
  normalizeFamily(
    AGRICULTURE_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

AGRICULTURE_TABLE =
  normalizeFamily(
    AGRICULTURE_TABLE,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

AGRICULTURE_TABLE =
  normalizeFamily(
    AGRICULTURE_TABLE,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 26. ADD INVESTMENT INTENSITY + GAP
// ============================================================================

function addIntensityAndGap(
  collection
) {

  return collection.map(
    function(feature) {

      var projectScore =
        ee.Number(
          feature.get(
            'Project_Density_N'
          )
        );


      var areaScore =
        ee.Number(
          feature.get(
            'Area_Coverage_N'
          )
        );


      var beneficiaryScore =
        ee.Number(
          feature.get(
            'Beneficiary_Density_N'
          )
        );


      var intensity =
        projectScore
          .multiply(
            0.40
          )
          .add(
            areaScore
              .multiply(
                0.40
              )
          )
          .add(
            beneficiaryScore
              .multiply(
                0.20
              )
          )
          .clamp(
            0,
            1
          );


      var gap =
        ee.Number(
          1
        )
        .subtract(
          intensity
        )
        .clamp(
          0,
          1
        );


      return feature.set({

        'Existing_Investment_Intensity':
          intensity,

        'Investment_Gap':
          gap

      });

    }
  );

}


IRRIGATION_TABLE =
  addIntensityAndGap(
    IRRIGATION_TABLE
  );

WETLAND_TABLE =
  addIntensityAndGap(
    WETLAND_TABLE
  );

EROSION_TABLE =
  addIntensityAndGap(
    EROSION_TABLE
  );

REFORESTATION_TABLE =
  addIntensityAndGap(
    REFORESTATION_TABLE
  );

FLOOD_TABLE =
  addIntensityAndGap(
    FLOOD_TABLE
  );

AGRICULTURE_TABLE =
  addIntensityAndGap(
    AGRICULTURE_TABLE
  );


// ============================================================================
// 27. FINAL 20-CATCHMENT GAP MASTER
// ============================================================================
//
// Use lookup dictionaries again.
//
// This avoids repeated filter-inside-map operations.
//
// ============================================================================

function propertyDictionary(
  collection,
  field
) {

  var lists =
    collection.reduceColumns({

      reducer:
        ee.Reducer.toList()
          .repeat(
            2
          ),

      selectors: [

        'Id',
        field

      ]

    });


  var values =
    ee.List(
      lists.get(
        'list'
      )
    );


  return ee.Dictionary.fromLists(

    ee.List(
      values.get(
        0
      )
    )
    .map(
      function(id) {

        return ee.Number(
          id
        )
        .format(
          '%d'
        );

      }
    ),

    ee.List(
      values.get(
        1
      )
    )

  );

}


// ============================================================================
// 28. GAP DICTIONARIES
// ============================================================================

var D_IRR =
  propertyDictionary(
    IRRIGATION_TABLE,
    'Investment_Gap'
  );

var D_WET =
  propertyDictionary(
    WETLAND_TABLE,
    'Investment_Gap'
  );

var D_ERO =
  propertyDictionary(
    EROSION_TABLE,
    'Investment_Gap'
  );

var D_REF =
  propertyDictionary(
    REFORESTATION_TABLE,
    'Investment_Gap'
  );

var D_FLOOD =
  propertyDictionary(
    FLOOD_TABLE,
    'Investment_Gap'
  );

var D_AGR =
  propertyDictionary(
    AGRICULTURE_TABLE,
    'Investment_Gap'
  );


// ============================================================================
// 29. INTENSITY DICTIONARIES
// ============================================================================

var I_IRR =
  propertyDictionary(
    IRRIGATION_TABLE,
    'Existing_Investment_Intensity'
  );

var I_WET =
  propertyDictionary(
    WETLAND_TABLE,
    'Existing_Investment_Intensity'
  );

var I_ERO =
  propertyDictionary(
    EROSION_TABLE,
    'Existing_Investment_Intensity'
  );

var I_REF =
  propertyDictionary(
    REFORESTATION_TABLE,
    'Existing_Investment_Intensity'
  );

var I_FLOOD =
  propertyDictionary(
    FLOOD_TABLE,
    'Existing_Investment_Intensity'
  );

var I_AGR =
  propertyDictionary(
    AGRICULTURE_TABLE,
    'Existing_Investment_Intensity'
  );


// ============================================================================
// 30. BUILD FINAL MASTER
// ============================================================================

var GAP_MASTER =
  CATCHMENTS.map(
    function(feature) {

      var id =
        feature.get(
          'Id'
        );


      var idKey =
        ee.Number(
          id
        )
        .format(
          '%d'
        );


      return feature.set({

        // ---------------------------------------------------------------------
        // Metadata
        // ---------------------------------------------------------------------

        'Gap_Version':
          VERSION,

        'Gap_Method':
          'Relative intervention-specific investment gap',

        'Investment_Intensity_Method':
          '40% project density + 40% area coverage + 20% beneficiary density',


        // ---------------------------------------------------------------------
        // Irrigation
        // ---------------------------------------------------------------------

        'Irrigation_Gap':
          ee.Number(
            D_IRR.get(
              idKey,
              1
            )
          ),

        'Irrigation_Investment_Intensity':
          ee.Number(
            I_IRR.get(
              idKey,
              0
            )
          ),


        // ---------------------------------------------------------------------
        // Wetland
        // ---------------------------------------------------------------------

        'Wetland_Gap':
          ee.Number(
            D_WET.get(
              idKey,
              1
            )
          ),

        'Wetland_Investment_Intensity':
          ee.Number(
            I_WET.get(
              idKey,
              0
            )
          ),


        // ---------------------------------------------------------------------
        // Erosion
        // ---------------------------------------------------------------------

        'Erosion_Gap':
          ee.Number(
            D_ERO.get(
              idKey,
              1
            )
          ),

        'Erosion_Investment_Intensity':
          ee.Number(
            I_ERO.get(
              idKey,
              0
            )
          ),


        // ---------------------------------------------------------------------
        // Reforestation
        // ---------------------------------------------------------------------

        'Reforestation_Gap':
          ee.Number(
            D_REF.get(
              idKey,
              1
            )
          ),

        'Reforestation_Investment_Intensity':
          ee.Number(
            I_REF.get(
              idKey,
              0
            )
          ),


        // ---------------------------------------------------------------------
        // Flood
        // ---------------------------------------------------------------------

        'Flood_Gap':
          ee.Number(
            D_FLOOD.get(
              idKey,
              1
            )
          ),

        'Flood_Investment_Intensity':
          ee.Number(
            I_FLOOD.get(
              idKey,
              0
            )
          ),


        // ---------------------------------------------------------------------
        // Agriculture
        // ---------------------------------------------------------------------

        'Agriculture_Gap':
          ee.Number(
            D_AGR.get(
              idKey,
              1
            )
          ),

        'Agriculture_Investment_Intensity':
          ee.Number(
            I_AGR.get(
              idKey,
              0
            )
          )

      });

    }
  );


// ============================================================================
// 31. FINAL MASTER VALIDATION
// ============================================================================

print('============================================================');
print('FINAL INTERVENTION-SPECIFIC GAP MASTER');
print('============================================================');

print(
  'Final catchment records:',
  GAP_MASTER.size()
);

print(
  'Final fields:',
  GAP_MASTER.first()
    .propertyNames()
);


// ============================================================================
// 32. GAP TABLE
// ============================================================================

print(
  GAP_MASTER.select([

    'Id',
    'NAME',

    'Irrigation_Gap',
    'Irrigation_Investment_Intensity',

    'Wetland_Gap',
    'Wetland_Investment_Intensity',

    'Erosion_Gap',
    'Erosion_Investment_Intensity',

    'Reforestation_Gap',
    'Reforestation_Investment_Intensity',

    'Flood_Gap',
    'Flood_Investment_Intensity',

    'Agriculture_Gap',
    'Agriculture_Investment_Intensity'

  ])
);


// ============================================================================
// 33. GAP COMPLETENESS
// ============================================================================

function completeness(
  field
) {

  var valid =
    GAP_MASTER
      .filter(
        ee.Filter.notNull(
          [
            field
          ]
        )
      )
      .size();


  return ee.Number(
    valid
  )
  .divide(
    GAP_MASTER.size()
  )
  .multiply(
    100
  );

}


print('============================================================');
print('GAP COMPLETENESS');
print('============================================================');

print(
  'Irrigation:',
  completeness(
    'Irrigation_Gap'
  )
);

print(
  'Wetland:',
  completeness(
    'Wetland_Gap'
  )
);

print(
  'Erosion:',
  completeness(
    'Erosion_Gap'
  )
);

print(
  'Reforestation:',
  completeness(
    'Reforestation_Gap'
  )
);

print(
  'Flood:',
  completeness(
    'Flood_Gap'
  )
);

print(
  'Agriculture:',
  completeness(
    'Agriculture_Gap'
  )
);


// ============================================================================
// 34. NATIONAL GAP SUMMARY
// ============================================================================

print('============================================================');
print('NATIONAL INVESTMENT GAP SUMMARY');
print('============================================================');

print(
  'Mean Irrigation Gap:',
  GAP_MASTER.aggregate_mean(
    'Irrigation_Gap'
  )
);

print(
  'Mean Wetland Gap:',
  GAP_MASTER.aggregate_mean(
    'Wetland_Gap'
  )
);

print(
  'Mean Erosion Gap:',
  GAP_MASTER.aggregate_mean(
    'Erosion_Gap'
  )
);

print(
  'Mean Reforestation Gap:',
  GAP_MASTER.aggregate_mean(
    'Reforestation_Gap'
  )
);

print(
  'Mean Flood Gap:',
  GAP_MASTER.aggregate_mean(
    'Flood_Gap'
  )
);

print(
  'Mean Agriculture Gap:',
  GAP_MASTER.aggregate_mean(
    'Agriculture_Gap'
  )
);


// ============================================================================
// 35. TOP GAP CATCHMENTS
// ============================================================================

print('============================================================');
print('TOP INVESTMENT GAP CATCHMENTS');
print('============================================================');


print(
  'Irrigation:',
  GAP_MASTER
    .sort(
      'Irrigation_Gap',
      false
    )
    .limit(
      10
    )
    .select([
      'Id',
      'NAME',
      'Irrigation_Gap',
      'Irrigation_Investment_Intensity'
    ])
);


print(
  'Wetland:',
  GAP_MASTER
    .sort(
      'Wetland_Gap',
      false
    )
    .limit(
      10
    )
    .select([
      'Id',
      'NAME',
      'Wetland_Gap',
      'Wetland_Investment_Intensity'
    ])
);


print(
  'Erosion:',
  GAP_MASTER
    .sort(
      'Erosion_Gap',
      false
    )
    .limit(
      10
    )
    .select([
      'Id',
      'NAME',
      'Erosion_Gap',
      'Erosion_Investment_Intensity'
    ])
);


print(
  'Reforestation:',
  GAP_MASTER
    .sort(
      'Reforestation_Gap',
      false
    )
    .limit(
      10
    )
    .select([
      'Id',
      'NAME',
      'Reforestation_Gap',
      'Reforestation_Investment_Intensity'
    ])
);


print(
  'Flood:',
  GAP_MASTER
    .sort(
      'Flood_Gap',
      false
    )
    .limit(
      10
    )
    .select([
      'Id',
      'NAME',
      'Flood_Gap',
      'Flood_Investment_Intensity'
    ])
);


print(
  'Agriculture:',
  GAP_MASTER
    .sort(
      'Agriculture_Gap',
      false
    )
    .limit(
      10
    )
    .select([
      'Id',
      'NAME',
      'Agriculture_Gap',
      'Agriculture_Investment_Intensity'
    ])
);


// ============================================================================
// 36. EXPORT TYPE MAPPING
// ============================================================================

Export.table.toDrive({

  collection:
    TYPE_MAPPING,

  description:
    'ACRESAL_Phase4B5_Intervention_Type_Mapping_v7',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Intervention_Type_Mapping_v7',

  fileFormat:
    'CSV'

});


// ============================================================================
// 37. EXPORT COMPLETE FAMILY TABLES
// ============================================================================

var ALL_FAMILY_TABLES =
  IRRIGATION_TABLE
    .merge(
      WETLAND_TABLE
    )
    .merge(
      EROSION_TABLE
    )
    .merge(
      REFORESTATION_TABLE
    )
    .merge(
      FLOOD_TABLE
    )
    .merge(
      AGRICULTURE_TABLE
    );


Export.table.toDrive({

  collection:
    ALL_FAMILY_TABLES,

  description:
    'ACRESAL_Phase4B5_Complete_Catchment_Family_Baseline_v7',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Complete_Catchment_Family_Baseline_v7',

  fileFormat:
    'CSV'

});


// ============================================================================
// 38. EXPORT FINAL GAP MASTER
// ============================================================================

Export.table.toDrive({

  collection:
    GAP_MASTER,

  description:
    'ACRESAL_Phase4B5_Intervention_Specific_Gaps_v7',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Intervention_Specific_Gaps_v7',

  fileFormat:
    'CSV'

});


// ============================================================================
// 39. EXPORT FINAL GAP MASTER TO GEE ASSET
// ============================================================================

Export.table.toAsset({

  collection:
    GAP_MASTER,

  description:
    'DSS_Phase4B5_Intervention_Gaps_v7',

  assetId:
    OUTPUT_ASSET

});


// ============================================================================
// 40. EXPORT GAP COMPLETENESS
// ============================================================================

var GAP_COMPLETENESS =
  ee.FeatureCollection([

    ee.Feature(
      null,
      {
        'Gap_Field':
          'Irrigation_Gap',

        'Completeness_pct':
          completeness(
            'Irrigation_Gap'
          )
      }
    ),

    ee.Feature(
      null,
      {
        'Gap_Field':
          'Wetland_Gap',

        'Completeness_pct':
          completeness(
            'Wetland_Gap'
          )
      }
    ),

    ee.Feature(
      null,
      {
        'Gap_Field':
          'Erosion_Gap',

        'Completeness_pct':
          completeness(
            'Erosion_Gap'
          )
      }
    ),

    ee.Feature(
      null,
      {
        'Gap_Field':
          'Reforestation_Gap',

        'Completeness_pct':
          completeness(
            'Reforestation_Gap'
          )
      }
    ),

    ee.Feature(
      null,
      {
        'Gap_Field':
          'Flood_Gap',

        'Completeness_pct':
          completeness(
            'Flood_Gap'
          )
      }
    ),

    ee.Feature(
      null,
      {
        'Gap_Field':
          'Agriculture_Gap',

        'Completeness_pct':
          completeness(
            'Agriculture_Gap'
          )
      }
    )

  ]);


Export.table.toDrive({

  collection:
    GAP_COMPLETENESS,

  description:
    'ACRESAL_Phase4B5_Gap_Completeness_v7',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Gap_Completeness_v7',

  fileFormat:
    'CSV'

});


// ============================================================================
// 41. MAP
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


// ============================================================================
// 42. FINAL STATUS
// ============================================================================

print('============================================================');
print('PHASE 4B.5 v7 COMPLETE');
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
  'Original intervention records:',
  INTERVENTIONS.size()
);

print(
  'Spatially assigned records:',
  ASSIGNED.size()
);

print(
  'Unassigned records:',
  INTERVENTIONS.size()
    .subtract(
      ASSIGNED.size()
    )
);

print(
  'Unclassified assigned records:',
  UNCLASSIFIED.size()
);

print(
  'Core intervention families:',
  CORE_FAMILIES.length
);

print(
  'Irrigation family table:',
  IRRIGATION_TABLE.size()
);

print(
  'Wetland family table:',
  WETLAND_TABLE.size()
);

print(
  'Erosion family table:',
  EROSION_TABLE.size()
);

print(
  'Reforestation family table:',
  REFORESTATION_TABLE.size()
);

print(
  'Flood family table:',
  FLOOD_TABLE.size()
);

print(
  'Agriculture family table:',
  AGRICULTURE_TABLE.size()
);

print(
  'Final gap master records:',
  GAP_MASTER.size()
);

print(
  'Spatial assignment:',
  'ONE CENTROID-TO-CATCHMENT OPERATION'
);

print(
  'Family aggregation:',
  'GROUPED REDUCTION'
);

print(
  'Family completion:',
  'DICTIONARY-BASED ZERO FILL'
);

print(
  'Normalization:',
  'FAMILY-SPECIFIC MIN-MAX'
);

print(
  'Investment intensity:',
  '40% project density + 40% area coverage + 20% beneficiary density'
);

print(
  'Investment gap:',
  '1 - relative investment intensity'
);

print(
  'Gap interpretation:',
  'RELATIVE, NOT PERCENTAGE OF UNMET NEED'
);

print(
  'AHP:',
  'NOT APPLIED'
);

print(
  'Environmental MCDA:',
  'NOT APPLIED'
);

print(
  'Pixel suitability:',
  'NOT APPLIED'
);

print(
  'Output asset:',
  OUTPUT_ASSET
);

print(
  'Next:',
  'PHASE 4B.6 - SUITABILITY × INTERVENTION-SPECIFIC GAP'
);

print('============================================================');
