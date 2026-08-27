// ============================================================================
// ACReSAL NATIONAL GEOSPATIAL DECISION SUPPORT SYSTEM
// ============================================================================
// PHASE 4B.5 v6
// INTERVENTION-SPECIFIC INVESTMENT GAP ENGINE
//
// PERFORMANCE-OPTIMIZED / GROUPED-AGGREGATION VERSION
//
// ============================================================================
//
// KEY CHANGE FROM v5
// ------------------
// v5 repeatedly constructed catchment × intervention computations over the
// full intervention collection.
//
// v6 performs:
//
//   1. ONE spatial catchment assignment
//   2. ONE intervention classification
//   3. SIX grouped reductions, one per core intervention family
//   4. Six lightweight 20-catchment tables
//   5. Final 20-catchment gap master
//
// This substantially reduces the Earth Engine computation graph.
//
// ============================================================================
//
// FIX (this revision)
// --------------------
// The family-table construction (createFamilyTable) and the final gap-master
// assembly originally joined tables by doing a `.filter(eq Id)` call INSIDE
// a `CATCHMENTS.map(...)` / `GAP_MASTER.map(...)` callback. That pattern
// re-embeds the entire upstream computation graph for the right-hand table
// once per left-hand feature (20 catchments x 6 families x ~7 fields =
// hundreds of re-embeddings of an already-heavy classification chain), which
// is exactly what caused:
//
//   "User memory limit exceeded"
//
// when computing/printing GAP_COMPLETENESS and GAP_MASTER.
//
// This revision replaces every "filter-inside-map" join with a proper
// ee.Join.saveFirst equi-join on 'Id' (the same idiom already used
// correctly for the spatial intervention -> catchment join in Section 7).
// Equi-joins are evaluated once as a single join op instead of being
// unrolled and re-embedded per feature, which keeps the computation graph
// linear in the number of catchments/families instead of blowing up.
//
// ============================================================================
//
// CORE INTERVENTIONS
// ------------------
// 1. Irrigation
// 2. Wetland Restoration
// 3. Erosion Control
// 4. Reforestation
// 5. Flood Mitigation
// 6. Agricultural Productivity
//
// ============================================================================
//
// INVESTMENT INTENSITY
// --------------------
//
// Existing Investment Intensity:
//
//   40% Project Density
// + 40% Area Coverage
// + 20% Beneficiary Density
//
// Investment Gap:
//
//   Gap = 1 - Existing Investment Intensity
//
// IMPORTANT
// ---------
// This is a RELATIVE investment-gap index across the 20 catchments.
// It is NOT a percentage of unmet need.
//
// NO AHP
// NO ENVIRONMENTAL MCDA
// NO PIXEL-LEVEL SUITABILITY
//
// ============================================================================


// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var VERSION =
  'ACReSAL_Phase_4B5_v6';

var OUTPUT_FOLDER =
  'ACRESAL_DSS';

var CATCHMENT_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_Project_Catchments';

var INTERVENTION_ASSET =
  'projects/ee-samuelcool28/assets/ACRESAL_Intervention_Sites';

var OUTPUT_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4B5_Intervention_Gaps_v6';


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
// 3. HEADER
// ============================================================================

print('============================================================');
print('ACReSAL PHASE 4B.5 v6');
print('GROUPED-AGGREGATION INVESTMENT GAP ENGINE');
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
// 4. CORE FAMILIES
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
//
// Only the centroid is used for assigning each intervention to a strategic
// catchment.
//
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
//
// This is the only major spatial join in Phase 4B.5.
//
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
// 8. RETAIN ONLY SPATIALLY ASSIGNED RECORDS
// ============================================================================
//
// Some intervention records do not intersect the official strategic
// catchments. These are excluded from the investment-gap calculation.
//
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


      var text =
        type
          .cat(' | ')
          .cat(component)
          .cat(' | ')
          .cat(subcomponent);


      return feature.set({

        'Classification_Text':
          text

      });

    }
  );


// ============================================================================
// 10. SERVER-SIDE SUBSTRING FUNCTION
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
// 11. CLASSIFY EXISTING INTERVENTIONS
// ============================================================================
//
// Priority:
//   Flood
//   Erosion
//   Wetland
//   Irrigation
//   Reforestation
//   Agriculture
//   Other
//
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
// 14. MAKE NUMERIC FIELDS SAFE
// ============================================================================
//
// All numerical fields required for grouped reduction are converted to
// numeric values. Nulls become zero.
//
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
// 15. GROUPED FAMILY REDUCTION
// ============================================================================
//
// One grouped reduction per core intervention.
//
// Six reductions are much cheaper than repeatedly performing spatial
// calculations for 20 x 6 combinations.
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
// 16. CREATE SIX GROUPED REDUCTIONS
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
// 17. CREATE COMPLETE 20-CATCHMENT FAMILY TABLE (JOIN-BASED)
// ============================================================================
//
// Even where no existing project exists for a family in a catchment,
// the catchment receives a zero baseline.
//
// FIX: this previously used CATCHMENTS.map() with a `groupedCollection
// .filter(eq Id)` call nested inside the callback. That re-embeds the
// groupedCollection computation graph once per catchment. Replaced with a
// single ee.Join.saveFirst equi-join on 'Id', which is evaluated once.
//
// ============================================================================

var ID_EQUALS_FILTER =
  ee.Filter.equals({

    leftField:
      'Id',

    rightField:
      'Id'

  });


function createFamilyTable(
  family,
  groupedCollection
) {

  var joined =
    ee.Join.saveFirst(
      'Family_Match'
    )
    .apply(

      CATCHMENTS,

      groupedCollection,

      ID_EQUALS_FILTER

    );


  return ee.FeatureCollection(
    joined
  )
  .map(
    function(catchment) {

      var zeroDefaults =
        ee.Feature(
          null,
          {

            'Existing_Ha':
              0,

            'Existing_Impact_Area':
              0,

            'Existing_Intervention_Area':
              0,

            'Existing_Net_Area':
              0,

            'Existing_Beneficiaries':
              0,

            'Existing_Project_Count':
              0

          }
        );


      var match =
        ee.Feature(

          ee.Algorithms.If(

            catchment.get(
              'Family_Match'
            ),

            catchment.get(
              'Family_Match'
            ),

            zeroDefaults

          )

        );


      var id =
        catchment.get(
          'Id'
        );


      var existingHa =
        ee.Number(
          match.get(
            'Existing_Ha'
          )
        );


      var impactArea =
        ee.Number(
          match.get(
            'Existing_Impact_Area'
          )
        );


      var interventionArea =
        ee.Number(
          match.get(
            'Existing_Intervention_Area'
          )
        );


      var netArea =
        ee.Number(
          match.get(
            'Existing_Net_Area'
          )
        );


      var beneficiaries =
        ee.Number(
          match.get(
            'Existing_Beneficiaries'
          )
        );


      var projectCount =
        ee.Number(
          match.get(
            'Existing_Project_Count'
          )
        );


      var areaKm2 =
        catchment.geometry()
          .area({
            maxError:
              100
          })
          .divide(
            1000000
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
        catchment.geometry(),
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
// 18. SIX COMPLETE FAMILY TABLES
// ============================================================================

var IRRIGATION_TABLE =
  createFamilyTable(
    'Irrigation',
    IRRIGATION_GROUP
  );


var WETLAND_TABLE =
  createFamilyTable(
    'Wetland Restoration',
    WETLAND_GROUP
  );


var EROSION_TABLE =
  createFamilyTable(
    'Erosion Control',
    EROSION_GROUP
  );


var REFORESTATION_TABLE =
  createFamilyTable(
    'Reforestation',
    REFORESTATION_GROUP
  );


var FLOOD_TABLE =
  createFamilyTable(
    'Flood Mitigation',
    FLOOD_GROUP
  );


var AGRICULTURE_TABLE =
  createFamilyTable(
    'Agricultural Productivity',
    AGRICULTURE_GROUP
  );


// ============================================================================
// 19. FAMILY TABLE VALIDATION
// ============================================================================

print('============================================================');
print('FAMILY TABLE COUNTS');
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
// 20. FAMILY NORMALIZATION FUNCTION
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
// 21. NORMALIZE IRRIGATION
// ============================================================================

var I1 =
  normalizeFamily(
    IRRIGATION_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

I1 =
  normalizeFamily(
    I1,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

I1 =
  normalizeFamily(
    I1,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 22. NORMALIZE WETLAND
// ============================================================================

var W1 =
  normalizeFamily(
    WETLAND_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

W1 =
  normalizeFamily(
    W1,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

W1 =
  normalizeFamily(
    W1,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 23. NORMALIZE EROSION
// ============================================================================

var E1 =
  normalizeFamily(
    EROSION_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

E1 =
  normalizeFamily(
    E1,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

E1 =
  normalizeFamily(
    E1,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 24. NORMALIZE REFORESTATION
// ============================================================================

var R1 =
  normalizeFamily(
    REFORESTATION_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

R1 =
  normalizeFamily(
    R1,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

R1 =
  normalizeFamily(
    R1,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 25. NORMALIZE FLOOD
// ============================================================================

var F1 =
  normalizeFamily(
    FLOOD_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

F1 =
  normalizeFamily(
    F1,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

F1 =
  normalizeFamily(
    F1,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 26. NORMALIZE AGRICULTURE
// ============================================================================

var A1 =
  normalizeFamily(
    AGRICULTURE_TABLE,
    'Project_Density_per_km2',
    'Project_Density_N'
  );

A1 =
  normalizeFamily(
    A1,
    'Area_Coverage_pct',
    'Area_Coverage_N'
  );

A1 =
  normalizeFamily(
    A1,
    'Beneficiary_Density_per_km2',
    'Beneficiary_Density_N'
  );


// ============================================================================
// 27. ADD INVESTMENT INTENSITY
// ============================================================================

function addIntensity(
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


I1 =
  addIntensity(
    I1
  );

W1 =
  addIntensity(
    W1
  );

E1 =
  addIntensity(
    E1
  );

R1 =
  addIntensity(
    R1
  );

F1 =
  addIntensity(
    F1
  );

A1 =
  addIntensity(
    A1
  );


// ============================================================================
// 28. BUILD OFFICIAL 20-CATCHMENT GAP MASTER
// ============================================================================
//
// Starts from official catchments, so geometry is guaranteed.
//
// ============================================================================

var GAP_MASTER =
  CATCHMENTS.map(
    function(feature) {

      return feature.set({

        'Gap_Version':
          VERSION,

        'Gap_Method':
          'Relative intervention-specific investment gap',

        'Investment_Intensity_Method':
          '40% project density + 40% area coverage + 20% beneficiary density'

      });

    }
  );


// ============================================================================
// 29. ADD PER-FAMILY GAPS (JOIN-BASED)
// ============================================================================
//
// FIX: sections 29-34 of the original script rebuilt GAP_MASTER six times,
// each time doing `GAP_MASTER.map(...){ subset = X1.filter(eq Id); ...
// subset.aggregate_first(...) x 7 }`. That nested filter+aggregate_first
// pattern re-embeds the full upstream family-table graph (classification +
// grouping + normalization + intensity) once per catchment per family
// (20 x 6 = 120 re-embeddings), which is what produced the
// "User memory limit exceeded" error on GAP_COMPLETENESS / GAP_MASTER.
//
// Replaced with a single ee.Join.saveFirst equi-join on 'Id' per family,
// which is evaluated once per family instead of once per catchment.
//
// ============================================================================

function joinFamilyGap(
  master,
  familyTable,
  prefix
) {

  var joined =
    ee.Join.saveFirst(
      prefix + '_Match'
    )
    .apply(

      master,

      familyTable,

      ID_EQUALS_FILTER

    );


  return ee.FeatureCollection(
    joined
  )
  .map(
    function(feature) {

      var match =
        ee.Feature(
          feature.get(
            prefix + '_Match'
          )
        );


      var props =
        {};

      props[prefix + '_Gap'] =
        match.get(
          'Investment_Gap'
        );

      props[prefix + '_Investment_Intensity'] =
        match.get(
          'Existing_Investment_Intensity'
        );

      props[prefix + '_Existing_Project_Count'] =
        match.get(
          'Existing_Project_Count'
        );

      props[prefix + '_Existing_Ha'] =
        match.get(
          'Existing_Ha'
        );

      props[prefix + '_Existing_Beneficiaries'] =
        match.get(
          'Existing_Beneficiaries'
        );

      props[prefix + '_Project_Density'] =
        match.get(
          'Project_Density_per_km2'
        );

      props[prefix + '_Area_Coverage_pct'] =
        match.get(
          'Area_Coverage_pct'
        );


      return feature.set(
        props
      );

    }
  );

}


GAP_MASTER =
  joinFamilyGap(
    GAP_MASTER,
    I1,
    'Irrigation'
  );

GAP_MASTER =
  joinFamilyGap(
    GAP_MASTER,
    W1,
    'Wetland'
  );

GAP_MASTER =
  joinFamilyGap(
    GAP_MASTER,
    E1,
    'Erosion'
  );

GAP_MASTER =
  joinFamilyGap(
    GAP_MASTER,
    R1,
    'Reforestation'
  );

GAP_MASTER =
  joinFamilyGap(
    GAP_MASTER,
    F1,
    'Flood'
  );

GAP_MASTER =
  joinFamilyGap(
    GAP_MASTER,
    A1,
    'Agriculture'
  );


// ============================================================================
// 35. GAP COMPLETENESS
// ============================================================================

var GAP_FIELDS = [

  'Irrigation_Gap',
  'Wetland_Gap',
  'Erosion_Gap',
  'Reforestation_Gap',
  'Flood_Gap',
  'Agriculture_Gap'

];


var GAP_COMPLETENESS =
  ee.FeatureCollection(

    GAP_FIELDS.map(
      function(field) {

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


        var completeness =
          ee.Number(
            valid
          )
          .divide(
            GAP_MASTER.size()
          )
          .multiply(
            100
          );


        return ee.Feature(
          null,
          {

            'Gap_Field':
              field,

            'Valid_Catchments':
              valid,

            'Total_Catchments':
              GAP_MASTER.size(),

            'Completeness_pct':
              completeness,

            'Status':
              ee.String(

                ee.Algorithms.If(

                  completeness.eq(100),

                  'COMPLETE',

                  'INCOMPLETE'

                )

              )

          }

        );

      }
    )

  );


// ============================================================================
// 36. FINAL GAP VALIDATION
// ============================================================================

print('============================================================');
print('INTERVENTION-SPECIFIC INVESTMENT GAP MASTER');
print('============================================================');

print(
  'Gap records:',
  GAP_MASTER.size()
);

print(
  'Gap completeness:',
  GAP_COMPLETENESS
);

print(
  GAP_MASTER.select([

    'Id',
    'NAME',

    'Irrigation_Gap',
    'Wetland_Gap',
    'Erosion_Gap',
    'Reforestation_Gap',
    'Flood_Gap',
    'Agriculture_Gap'

  ])
);


// ============================================================================
// 37. NATIONAL SUMMARY
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
// 38. TOP GAP CATCHMENTS
// ============================================================================

print('============================================================');
print('TOP INVESTMENT GAP CATCHMENTS');
print('============================================================');

print(
  'Top Irrigation Gaps:',
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
  'Top Wetland Gaps:',
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
  'Top Erosion Gaps:',
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
  'Top Reforestation Gaps:',
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
  'Top Flood Gaps:',
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
  'Top Agriculture Gaps:',
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
// 39. EXPORT TYPE MAPPING
// ============================================================================

Export.table.toDrive({

  collection:
    TYPE_MAPPING,

  description:
    'ACRESAL_Phase4B5_Intervention_Type_Mapping_v6',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Intervention_Type_Mapping_v6',

  fileFormat:
    'CSV'

});


// ============================================================================
// 40. EXPORT SIX-FAMILY BASELINE
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
    'ACRESAL_Phase4B5_Catchment_Family_Baseline_v6',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Catchment_Family_Baseline_v6',

  fileFormat:
    'CSV'

});


// ============================================================================
// 41. EXPORT FINAL GAP MASTER
// ============================================================================

Export.table.toDrive({

  collection:
    GAP_MASTER,

  description:
    'ACRESAL_Phase4B5_Intervention_Specific_Gaps_v6',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Intervention_Specific_Gaps_v6',

  fileFormat:
    'CSV'

});


// ============================================================================
// 42. EXPORT GAP MASTER TO GEE ASSET
// ============================================================================

Export.table.toAsset({

  collection:
    GAP_MASTER,

  description:
    'DSS_Phase4B5_Intervention_Gaps_v6',

  assetId:
    OUTPUT_ASSET

});


// ============================================================================
// 43. EXPORT GAP COMPLETENESS
// ============================================================================

Export.table.toDrive({

  collection:
    GAP_COMPLETENESS,

  description:
    'ACRESAL_Phase4B5_Gap_Completeness_v6',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B5_Gap_Completeness_v6',

  fileFormat:
    'CSV'

});


// ============================================================================
// 44. MAP
// ============================================================================

Map.centerObject(
  CATCHMENTS,
  6
);


Map.addLayer(

  GAP_MASTER.style({

    color:
      '000000',

    fillColor:
      '00000000',

    width:
      2

  }),

  {},

  'ACReSAL Investment Gap Master'

);


// ============================================================================
// 45. FINAL STATUS
// ============================================================================

print('============================================================');
print('PHASE 4B.5 v6 COMPLETE');
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
  'Family records:',
  ALL_FAMILY_TABLES.size()
);

print(
  'Final gap records:',
  GAP_MASTER.size()
);

print(
  'Spatial operation:',
  'ONE INTERVENTION-CATCHMENT ASSIGNMENT'
);

print(
  'Family aggregation:',
  'GROUPED REDUCTION + JOIN-BASED ASSEMBLY'
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
  'PHASE 4B.6 - INTEGRATE SUITABILITY WITH INTERVENTION-SPECIFIC GAP'
);

print('============================================================');
