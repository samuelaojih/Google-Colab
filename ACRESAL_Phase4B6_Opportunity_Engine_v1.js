// ============================================================================
// ACReSAL NATIONAL GEOSPATIAL DECISION SUPPORT SYSTEM
// ============================================================================
// PHASE 4B.6 v1
// SUITABILITY × INTERVENTION-SPECIFIC INVESTMENT GAP
//
// PURPOSE
// -------
// Integrate the validated Phase 4B catchment-level MCDA suitability results
// with the validated Phase 4B.5 intervention-specific investment gaps.
//
// CORE FORMULA
// ------------
//
//     Opportunity = Suitability × Investment Gap
//
// where:
//
//     Suitability = technical/environmental MCDA score
//     Investment Gap = relative intervention-specific investment deficit
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
// IMPORTANT
// ---------
// This phase does NOT perform pixel-level suitability.
// This phase does NOT apply new AHP weights.
// This phase does NOT change the Phase 4B suitability results.
//
// It only integrates:
//
//     Phase 4B Suitability
//                 ×
//     Phase 4B.5 Investment Gap
//                 ↓
//     Strategic Opportunity
//
// GAP INTERPRETATION
// ------------------
// The investment gap is a RELATIVE index across the 20 catchments.
// It is NOT a percentage of unmet need.
//
// ============================================================================
//
// FIX (this revision)
// --------------------
// As run, this script failed with:
//
//   Collection.reduceColumns: Error in map(ID=null):
//   Number.multiply: Parameter 'left' is required and may not be null.
//
// The Suitability x Gap join itself succeeded (INTEGRATED had all 20
// records), but at least one Suitability or Gap FIELD value was null for
// at least one catchment (most likely the Suitability asset or the Gap
// asset being read hasn't been freshly re-exported since it was last
// fixed, or a catchment genuinely has no computed suitability). Number.
// multiply cannot accept a null operand.
//
// Two changes:
//
//   1. A NULL VALUE DIAGNOSTICS block (after INTEGRATED is built) reports,
//      per Suitability/Gap field, how many of the 20 catchments are null.
//      Use it to tell whether the problem is in SUITABILITY_ASSET or
//      GAP_ASSET, and re-export that asset if so.
//
//   2. Every Suitability/Gap value used in the Opportunity calculation is
//      now coerced through a safeNumber() helper (null -> 0), the same
//      null-to-zero convention already used in Phase 4B.5's SAFE_NUMERIC.
//      This makes the script resilient even if a null legitimately
//      belongs in the data (e.g. a catchment with no scored suitability),
//      matching the "relative index, zero baseline" semantics used
//      throughout this pipeline.
//
// ============================================================================


// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var VERSION =
  'ACReSAL_Phase_4B6_v1';

var OUTPUT_FOLDER =
  'ACRESAL_DSS';


// -----------------------------------------------------------------------------
// MASTER CATCHMENTS
// -----------------------------------------------------------------------------

var CATCHMENT_ASSET =
  'projects/ee-samuelaojih/assets/ACRESAL_Project_Catchments';


// -----------------------------------------------------------------------------
// PHASE 4B SUITABILITY ASSET
// -----------------------------------------------------------------------------
//
// IMPORTANT:
//
// Verify this path against the asset you created from Phase 4B.
//
// Only this line should need changing if your Phase 4B asset has a different
// name.
//
// Expected suitability fields:
//
//   Irrigation_Suitability
//   Wetland_Suitability
//   Erosion_Suitability
//   Reforestation_Suitability
//   Flood_Suitability
//   Agriculture_Suitability
//
// -----------------------------------------------------------------------------

var SUITABILITY_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4B_Catchment_MCDA_v3';


// -----------------------------------------------------------------------------
// PHASE 4B.5 INVESTMENT GAP ASSET
// -----------------------------------------------------------------------------

var GAP_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4B5_Intervention_Gaps_v7';


// -----------------------------------------------------------------------------
// FINAL OUTPUT ASSET
// -----------------------------------------------------------------------------

var OUTPUT_ASSET =
  'projects/ee-samuelaojih/assets/DSS_Phase4B6_Opportunity_v1';


// ============================================================================
// 2. LOAD DATA
// ============================================================================

var CATCHMENTS =
  ee.FeatureCollection(
    CATCHMENT_ASSET
  );

var SUITABILITY =
  ee.FeatureCollection(
    SUITABILITY_ASSET
  );

var GAP =
  ee.FeatureCollection(
    GAP_ASSET
  );


// ============================================================================
// 3. CORE FIELD DEFINITIONS
// ============================================================================

var SUITABILITY_FIELDS = [

  'Irrigation_Suitability',
  'Wetland_Suitability',
  'Erosion_Suitability',
  'Reforestation_Suitability',
  'Flood_Suitability',
  'Agriculture_Suitability'

];


var GAP_FIELDS = [

  'Irrigation_Gap',
  'Wetland_Gap',
  'Erosion_Gap',
  'Reforestation_Gap',
  'Flood_Gap',
  'Agriculture_Gap'

];


var OPPORTUNITY_FIELDS = [

  'Irrigation_Opportunity',
  'Wetland_Opportunity',
  'Erosion_Opportunity',
  'Reforestation_Opportunity',
  'Flood_Opportunity',
  'Agriculture_Opportunity'

];


// ============================================================================
// 4. HEADER
// ============================================================================

print('============================================================');
print('ACReSAL PHASE 4B.6 v1');
print('SUITABILITY × INTERVENTION-SPECIFIC INVESTMENT GAP');
print('============================================================');

print(
  'Version:',
  VERSION
);

print(
  'Catchments:',
  CATCHMENTS.size()
);

print(
  'Phase 4B suitability records:',
  SUITABILITY.size()
);

print(
  'Phase 4B.5 gap records:',
  GAP.size()
);

print(
  'Suitability asset:',
  SUITABILITY_ASSET
);

print(
  'Gap asset:',
  GAP_ASSET
);


// ============================================================================
// 5. MASTER CATCHMENT IDS
// ============================================================================

print('============================================================');
print('CATCHMENT KEY DIAGNOSTICS');
print('============================================================');

print(
  'Master catchment IDs:',
  CATCHMENTS
    .aggregate_array(
      'Id'
    )
    .distinct()
    .size()
);

print(
  'Suitability catchment IDs:',
  SUITABILITY
    .aggregate_array(
      'Id'
    )
    .distinct()
    .size()
);

print(
  'Gap catchment IDs:',
  GAP
    .aggregate_array(
      'Id'
    )
    .distinct()
    .size()
);


// ============================================================================
// 6. FIELD VALIDATION
// ============================================================================

var SUITABILITY_PROPERTY_LIST =
  SUITABILITY.first()
    .propertyNames();


var GAP_PROPERTY_LIST =
  GAP.first()
    .propertyNames();


print('============================================================');
print('SUITABILITY FIELD VALIDATION');
print('============================================================');

print(
  'Suitability fields available:',
  SUITABILITY_PROPERTY_LIST
);

print('============================================================');
print('GAP FIELD VALIDATION');
print('============================================================');

print(
  'Gap fields available:',
  GAP_PROPERTY_LIST
);


// ============================================================================
// 7. CHECK REQUIRED SUITABILITY FIELDS
// ============================================================================

var SUITABILITY_STATUS =
  ee.FeatureCollection(

    SUITABILITY_FIELDS.map(
      function(field) {

        return ee.Feature(
          null,
          {

            'Field':
              field,

            'Available':
              SUITABILITY_PROPERTY_LIST
                .contains(
                  field
                )

          }

        );

      }
    )

  );


print('============================================================');
print('REQUIRED SUITABILITY FIELDS');
print('============================================================');

print(
  SUITABILITY_STATUS
);


// ============================================================================
// 8. CHECK REQUIRED GAP FIELDS
// ============================================================================

var GAP_STATUS =
  ee.FeatureCollection(

    GAP_FIELDS.map(
      function(field) {

        return ee.Feature(
          null,
          {

            'Field':
              field,

            'Available':
              GAP_PROPERTY_LIST
                .contains(
                  field
                )

          }

        );

      }
    )

  );


print('============================================================');
print('REQUIRED GAP FIELDS');
print('============================================================');

print(
  GAP_STATUS
);


// ============================================================================
// 9. CLEAN SUITABILITY TABLE
// ============================================================================
//
// Keep only the fields required for this integration.
//
// ============================================================================

var SUITABILITY_LITE =
  SUITABILITY.select([

    'Id',
    'NAME',

    'Irrigation_Suitability',
    'Wetland_Suitability',
    'Erosion_Suitability',
    'Reforestation_Suitability',
    'Flood_Suitability',
    'Agriculture_Suitability'

  ]);


// ============================================================================
// 10. CLEAN GAP TABLE
// ============================================================================

var GAP_LITE =
  GAP.select([

    'Id',
    'NAME',

    'Irrigation_Gap',
    'Wetland_Gap',
    'Erosion_Gap',
    'Reforestation_Gap',
    'Flood_Gap',
    'Agriculture_Gap',

    'Irrigation_Investment_Intensity',
    'Wetland_Investment_Intensity',
    'Erosion_Investment_Intensity',
    'Reforestation_Investment_Intensity',
    'Flood_Investment_Intensity',
    'Agriculture_Investment_Intensity'

  ]);


// ============================================================================
// 11. PREPARE SUITABILITY JOIN
// ============================================================================

var SUITABILITY_JOIN =
  SUITABILITY_LITE.map(
    function(feature) {

      return feature.set(
        'Join_Id',
        ee.String(
          ee.Number(
            feature.get(
              'Id'
            )
          )
        )
      );

    }
  );


// ============================================================================
// 12. PREPARE GAP JOIN
// ============================================================================

var GAP_JOIN =
  GAP_LITE.map(
    function(feature) {

      return feature.set(
        'Join_Id',
        ee.String(
          ee.Number(
            feature.get(
              'Id'
            )
          )
        )
      );

    }
  );


// ============================================================================
// 13. PREPARE CATCHMENT JOIN
// ============================================================================

var CATCHMENT_JOIN =
  CATCHMENTS.map(
    function(feature) {

      return feature.set(
        'Join_Id',
        ee.String(
          ee.Number(
            feature.get(
              'Id'
            )
          )
        )
      );

    }
  );


// ============================================================================
// 14. JOIN SUITABILITY TO GAP
// ============================================================================
//
// One equi-join.
// No filter-inside-map.
//
// ============================================================================

print('============================================================');
print('INTEGRATING PHASE 4B + PHASE 4B.5');
print('============================================================');


var SUITABILITY_GAP_JOIN =
  ee.Join.saveFirst(
    'Gap_Record'
  )
  .apply(

    SUITABILITY_JOIN,

    GAP_JOIN,

    ee.Filter.equals({

      leftField:
        'Join_Id',

      rightField:
        'Join_Id'

    })

  );


// ============================================================================
// 15. BUILD INTEGRATED TABLE
// ============================================================================

var INTEGRATED =
  ee.FeatureCollection(
    SUITABILITY_GAP_JOIN
  )
  .filter(
    ee.Filter.notNull(
      [
        'Gap_Record'
      ]
    )
  )
  .map(
    function(feature) {

      var gap =
        ee.Feature(
          feature.get(
            'Gap_Record'
          )
        );


      return ee.Feature(
        feature.geometry(),
        {

          'Id':
            feature.get(
              'Id'
            ),

          'NAME':
            feature.get(
              'NAME'
            ),


          // -------------------------------------------------------------------
          // SUITABILITY
          // -------------------------------------------------------------------

          'Irrigation_Suitability':
            feature.get(
              'Irrigation_Suitability'
            ),

          'Wetland_Suitability':
            feature.get(
              'Wetland_Suitability'
            ),

          'Erosion_Suitability':
            feature.get(
              'Erosion_Suitability'
            ),

          'Reforestation_Suitability':
            feature.get(
              'Reforestation_Suitability'
            ),

          'Flood_Suitability':
            feature.get(
              'Flood_Suitability'
            ),

          'Agriculture_Suitability':
            feature.get(
              'Agriculture_Suitability'
            ),


          // -------------------------------------------------------------------
          // GAPS
          // -------------------------------------------------------------------

          'Irrigation_Gap':
            gap.get(
              'Irrigation_Gap'
            ),

          'Wetland_Gap':
            gap.get(
              'Wetland_Gap'
            ),

          'Erosion_Gap':
            gap.get(
              'Erosion_Gap'
            ),

          'Reforestation_Gap':
            gap.get(
              'Reforestation_Gap'
            ),

          'Flood_Gap':
            gap.get(
              'Flood_Gap'
            ),

          'Agriculture_Gap':
            gap.get(
              'Agriculture_Gap'
            ),


          // -------------------------------------------------------------------
          // EXISTING INVESTMENT INTENSITY
          // -------------------------------------------------------------------

          'Irrigation_Investment_Intensity':
            gap.get(
              'Irrigation_Investment_Intensity'
            ),

          'Wetland_Investment_Intensity':
            gap.get(
              'Wetland_Investment_Intensity'
            ),

          'Erosion_Investment_Intensity':
            gap.get(
              'Erosion_Investment_Intensity'
            ),

          'Reforestation_Investment_Intensity':
            gap.get(
              'Reforestation_Investment_Intensity'
            ),

          'Flood_Investment_Intensity':
            gap.get(
              'Flood_Investment_Intensity'
            ),

          'Agriculture_Investment_Intensity':
            gap.get(
              'Agriculture_Investment_Intensity'
            )

        }

      );

    }
  );


// ============================================================================
// 16. INTEGRATION DIAGNOSTICS
// ============================================================================

print('============================================================');
print('INTEGRATED EVIDENCE');
print('============================================================');

print(
  'Integrated records:',
  INTEGRATED.size()
);


// ============================================================================
// 16B. NULL VALUE DIAGNOSTICS (FIX)
// ============================================================================
//
// The join succeeding (20 integrated records) does not guarantee every
// SUITABILITY_FIELDS / GAP_FIELDS value is non-null for every catchment.
// This reports, per field, how many of the 20 catchments have a null
// value. Any field with Null_Catchments > 0 tells you exactly which
// upstream asset (SUITABILITY_ASSET or GAP_ASSET) needs to be re-checked
// or re-exported.
//
// ============================================================================

var INPUT_FIELDS_TO_CHECK =
  SUITABILITY_FIELDS.concat(
    GAP_FIELDS
  );


print('============================================================');
print('NULL VALUE DIAGNOSTICS (SUITABILITY + GAP INPUTS)');
print('============================================================');

print(
  'Printed individually (not as one collapsed object) so the numbers are ' +
  'visible without clicking to expand. Null_Count > 0 or Mean = 0 for a ' +
  'field means it is missing/zero in SUITABILITY_ASSET or GAP_ASSET for ' +
  'one or more catchments -- re-check/re-export that upstream asset.'
);


INPUT_FIELDS_TO_CHECK.forEach(
  function(field) {

    var nonNullCount =
      INTEGRATED
        .filter(
          ee.Filter.notNull(
            [
              field
            ]
          )
        )
        .size();


    var nullCount =
      INTEGRATED.size()
        .subtract(
          nonNullCount
        );


    print(
      field + ' -- Null_Count:',
      nullCount,
      ' Mean:',
      INTEGRATED.aggregate_mean(
        field
      )
    );

  }
);


// ============================================================================
// 16C. NULL-SAFE NUMBER HELPER (FIX)
// ============================================================================
//
// Number.multiply requires both operands to be non-null. Every Suitability
// / Gap value pulled from INTEGRATED is coerced through this helper before
// use, so a missing value contributes 0 to Opportunity instead of crashing
// the whole computation graph. This mirrors the null-to-zero convention
// already used in Phase 4B.5 (SAFE_NUMERIC).
//
// ============================================================================

function safeNumber(
  value
) {

  return ee.Number(
    ee.Algorithms.If(
      value,
      value,
      0
    )
  );

}


// ============================================================================
// 17. CALCULATE OPPORTUNITY SCORES
// ============================================================================
//
// Opportunity = Suitability × Gap
//
// ============================================================================

var OPPORTUNITY =
  INTEGRATED.map(
    function(feature) {


      // -----------------------------------------------------------------------
      // IRRIGATION
      // -----------------------------------------------------------------------

      var irrSuit =
        safeNumber(
          feature.get(
            'Irrigation_Suitability'
          )
        );

      var irrGap =
        safeNumber(
          feature.get(
            'Irrigation_Gap'
          )
        );

      var irrOpportunity =
        irrSuit
          .multiply(
            irrGap
          );


      // -----------------------------------------------------------------------
      // WETLAND
      // -----------------------------------------------------------------------

      var wetSuit =
        safeNumber(
          feature.get(
            'Wetland_Suitability'
          )
        );

      var wetGap =
        safeNumber(
          feature.get(
            'Wetland_Gap'
          )
        );

      var wetOpportunity =
        wetSuit
          .multiply(
            wetGap
          );


      // -----------------------------------------------------------------------
      // EROSION
      // -----------------------------------------------------------------------

      var eroSuit =
        safeNumber(
          feature.get(
            'Erosion_Suitability'
          )
        );

      var eroGap =
        safeNumber(
          feature.get(
            'Erosion_Gap'
          )
        );

      var eroOpportunity =
        eroSuit
          .multiply(
            eroGap
          );


      // -----------------------------------------------------------------------
      // REFORESTATION
      // -----------------------------------------------------------------------

      var refSuit =
        safeNumber(
          feature.get(
            'Reforestation_Suitability'
          )
        );

      var refGap =
        safeNumber(
          feature.get(
            'Reforestation_Gap'
          )
        );

      var refOpportunity =
        refSuit
          .multiply(
            refGap
          );


      // -----------------------------------------------------------------------
      // FLOOD
      // -----------------------------------------------------------------------

      var floodSuit =
        safeNumber(
          feature.get(
            'Flood_Suitability'
          )
        );

      var floodGap =
        safeNumber(
          feature.get(
            'Flood_Gap'
          )
        );

      var floodOpportunity =
        floodSuit
          .multiply(
            floodGap
          );


      // -----------------------------------------------------------------------
      // AGRICULTURE
      // -----------------------------------------------------------------------

      var agrSuit =
        safeNumber(
          feature.get(
            'Agriculture_Suitability'
          )
        );

      var agrGap =
        safeNumber(
          feature.get(
            'Agriculture_Gap'
          )
        );

      var agrOpportunity =
        agrSuit
          .multiply(
            agrGap
          );


      // -----------------------------------------------------------------------
      // ADD OPPORTUNITY FIELDS
      // -----------------------------------------------------------------------

      return feature.set({

        'Irrigation_Opportunity':
          irrOpportunity,

        'Wetland_Opportunity':
          wetOpportunity,

        'Erosion_Opportunity':
          eroOpportunity,

        'Reforestation_Opportunity':
          refOpportunity,

        'Flood_Opportunity':
          floodOpportunity,

        'Agriculture_Opportunity':
          agrOpportunity

      });

    }
  );


// ============================================================================
// 18. OPPORTUNITY DIAGNOSTICS
// ============================================================================

print('============================================================');
print('OPPORTUNITY SCORE SUMMARY');
print('============================================================');

print(
  'Mean Irrigation Opportunity:',
  OPPORTUNITY.aggregate_mean(
    'Irrigation_Opportunity'
  )
);

print(
  'Mean Wetland Opportunity:',
  OPPORTUNITY.aggregate_mean(
    'Wetland_Opportunity'
  )
);

print(
  'Mean Erosion Opportunity:',
  OPPORTUNITY.aggregate_mean(
    'Erosion_Opportunity'
  )
);

print(
  'Mean Reforestation Opportunity:',
  OPPORTUNITY.aggregate_mean(
    'Reforestation_Opportunity'
  )
);

print(
  'Mean Flood Opportunity:',
  OPPORTUNITY.aggregate_mean(
    'Flood_Opportunity'
  )
);

print(
  'Mean Agriculture Opportunity:',
  OPPORTUNITY.aggregate_mean(
    'Agriculture_Opportunity'
  )
);


// ============================================================================
// 19. BEST INTERVENTION BY CATCHMENT
// ============================================================================
//
// We construct the maximum of the six opportunity scores.
//
// ============================================================================

var WITH_MAX =
  OPPORTUNITY.map(
    function(feature) {

      var irrigation =
        ee.Number(
          feature.get(
            'Irrigation_Opportunity'
          )
        );

      var wetland =
        ee.Number(
          feature.get(
            'Wetland_Opportunity'
          )
        );

      var erosion =
        ee.Number(
          feature.get(
            'Erosion_Opportunity'
          )
        );

      var reforestation =
        ee.Number(
          feature.get(
            'Reforestation_Opportunity'
          )
        );

      var flood =
        ee.Number(
          feature.get(
            'Flood_Opportunity'
          )
        );

      var agriculture =
        ee.Number(
          feature.get(
            'Agriculture_Opportunity'
          )
        );


      var maximum =
        irrigation
          .max(
            wetland
          )
          .max(
            erosion
          )
          .max(
            reforestation
          )
          .max(
            flood
          )
          .max(
            agriculture
          );


      return feature.set({

        'Maximum_Opportunity':
          maximum

      });

    }
  );


// ============================================================================
// 20. BEST INTERVENTION LABEL
// ============================================================================

var BEST_INTERVENTION =
  WITH_MAX.map(
    function(feature) {

      var maximum =
        ee.Number(
          feature.get(
            'Maximum_Opportunity'
          )
        );


      var irrigation =
        ee.Number(
          feature.get(
            'Irrigation_Opportunity'
          )
        );

      var wetland =
        ee.Number(
          feature.get(
            'Wetland_Opportunity'
          )
        );

      var erosion =
        ee.Number(
          feature.get(
            'Erosion_Opportunity'
          )
        );

      var reforestation =
        ee.Number(
          feature.get(
            'Reforestation_Opportunity'
          )
        );

      var flood =
        ee.Number(
          feature.get(
            'Flood_Opportunity'
          )
        );

      var agriculture =
        ee.Number(
          feature.get(
            'Agriculture_Opportunity'
          )
        );


      var best =
        ee.String(

          ee.Algorithms.If(

            irrigation.eq(
              maximum
            ),

            'Irrigation',

            ee.Algorithms.If(

              wetland.eq(
                maximum
              ),

              'Wetland Restoration',

              ee.Algorithms.If(

                erosion.eq(
                  maximum
                ),

                'Erosion Control',

                ee.Algorithms.If(

                  reforestation.eq(
                    maximum
                  ),

                  'Reforestation',

                  ee.Algorithms.If(

                    flood.eq(
                      maximum
                    ),

                    'Flood Mitigation',

                    'Agricultural Productivity'

                  )

                )

              )

            )

          )

        );


      return feature.set({

        'Best_Intervention':
          best,

        'Best_Opportunity_Score':
          maximum

      });

    }
  );


// ============================================================================
// 21. OVERALL STRATEGIC OPPORTUNITY
// ============================================================================
//
// Mean of the six intervention opportunity scores.
//
// This should NOT replace the intervention-specific scores.
// It is a supplementary cross-intervention indicator.
//
// ============================================================================

var FINAL_OPPORTUNITY =
  BEST_INTERVENTION.map(
    function(feature) {

      var irrigation =
        ee.Number(
          feature.get(
            'Irrigation_Opportunity'
          )
        );

      var wetland =
        ee.Number(
          feature.get(
            'Wetland_Opportunity'
          )
        );

      var erosion =
        ee.Number(
          feature.get(
            'Erosion_Opportunity'
          )
        );

      var reforestation =
        ee.Number(
          feature.get(
            'Reforestation_Opportunity'
          )
        );

      var flood =
        ee.Number(
          feature.get(
            'Flood_Opportunity'
          )
        );

      var agriculture =
        ee.Number(
          feature.get(
            'Agriculture_Opportunity'
          )
        );


      var overall =
        irrigation
          .add(
            wetland
          )
          .add(
            erosion
          )
          .add(
            reforestation
          )
          .add(
            flood
          )
          .add(
            agriculture
          )
          .divide(
            6
          );


      return feature.set({

        'Overall_Strategic_Opportunity':
          overall

      });

    }
  );


// ============================================================================
// 22. OPPORTUNITY RANK
// ============================================================================
//
// Rank based on Overall Strategic Opportunity.
//
// ============================================================================

var OPPORTUNITY_VALUES =
  ee.List(
    FINAL_OPPORTUNITY
      .aggregate_array(
        'Overall_Strategic_Opportunity'
      )
  )
  .sort()
  .reverse();


var RANKED =
  FINAL_OPPORTUNITY.map(
    function(feature) {

      var value =
        feature.get(
          'Overall_Strategic_Opportunity'
        );


      var rank =
        ee.Number(
          OPPORTUNITY_VALUES.indexOf(
            value
          )
        )
        .add(
          1
        );


      return feature.set({

        'Overall_Opportunity_Rank':
          rank

      });

    }
  );


// ============================================================================
// 23. BEST INTERVENTION OPPORTUNITY TABLE
// ============================================================================

print('============================================================');
print('BEST INTERVENTION BY CATCHMENT');
print('============================================================');

print(
  RANKED
    .sort(
      'Overall_Opportunity_Rank'
    )
    .select([

      'Id',
      'NAME',

      'Best_Intervention',
      'Best_Opportunity_Score',

      'Overall_Strategic_Opportunity',
      'Overall_Opportunity_Rank'

    ])
);


// ============================================================================
// 24. TOP IRRIGATION OPPORTUNITIES
// ============================================================================

print('============================================================');
print('TOP IRRIGATION OPPORTUNITIES');
print('============================================================');

print(
  RANKED
    .sort(
      'Irrigation_Opportunity',
      false
    )
    .limit(
      10
    )
    .select([

      'Id',
      'NAME',

      'Irrigation_Suitability',
      'Irrigation_Gap',
      'Irrigation_Opportunity'

    ])
);


// ============================================================================
// 25. TOP WETLAND OPPORTUNITIES
// ============================================================================

print('============================================================');
print('TOP WETLAND RESTORATION OPPORTUNITIES');
print('============================================================');

print(
  RANKED
    .sort(
      'Wetland_Opportunity',
      false
    )
    .limit(
      10
    )
    .select([

      'Id',
      'NAME',

      'Wetland_Suitability',
      'Wetland_Gap',
      'Wetland_Opportunity'

    ])
);


// ============================================================================
// 26. TOP EROSION OPPORTUNITIES
// ============================================================================

print('============================================================');
print('TOP EROSION CONTROL OPPORTUNITIES');
print('============================================================');

print(
  RANKED
    .sort(
      'Erosion_Opportunity',
      false
    )
    .limit(
      10
    )
    .select([

      'Id',
      'NAME',

      'Erosion_Suitability',
      'Erosion_Gap',
      'Erosion_Opportunity'

    ])
);


// ============================================================================
// 27. TOP REFORESTATION OPPORTUNITIES
// ============================================================================

print('============================================================');
print('TOP REFORESTATION OPPORTUNITIES');
print('============================================================');

print(
  RANKED
    .sort(
      'Reforestation_Opportunity',
      false
    )
    .limit(
      10
    )
    .select([

      'Id',
      'NAME',

      'Reforestation_Suitability',
      'Reforestation_Gap',
      'Reforestation_Opportunity'

    ])
);


// ============================================================================
// 28. TOP FLOOD OPPORTUNITIES
// ============================================================================

print('============================================================');
print('TOP FLOOD MITIGATION OPPORTUNITIES');
print('============================================================');

print(
  RANKED
    .sort(
      'Flood_Opportunity',
      false
    )
    .limit(
      10
    )
    .select([

      'Id',
      'NAME',

      'Flood_Suitability',
      'Flood_Gap',
      'Flood_Opportunity'

    ])
);


// ============================================================================
// 29. TOP AGRICULTURAL OPPORTUNITIES
// ============================================================================

print('============================================================');
print('TOP AGRICULTURAL PRODUCTIVITY OPPORTUNITIES');
print('============================================================');

print(
  RANKED
    .sort(
      'Agriculture_Opportunity',
      false
    )
    .limit(
      10
    )
    .select([

      'Id',
      'NAME',

      'Agriculture_Suitability',
      'Agriculture_Gap',
      'Agriculture_Opportunity'

    ])
);


// ============================================================================
// 30. FINAL OUTPUT TABLE
// ============================================================================

var FINAL_TABLE =
  RANKED.select([

    'Id',
    'NAME',

    // -------------------------------------------------------------------------
    // SUITABILITY
    // -------------------------------------------------------------------------

    'Irrigation_Suitability',
    'Wetland_Suitability',
    'Erosion_Suitability',
    'Reforestation_Suitability',
    'Flood_Suitability',
    'Agriculture_Suitability',

    // -------------------------------------------------------------------------
    // INVESTMENT GAPS
    // -------------------------------------------------------------------------

    'Irrigation_Gap',
    'Wetland_Gap',
    'Erosion_Gap',
    'Reforestation_Gap',
    'Flood_Gap',
    'Agriculture_Gap',

    // -------------------------------------------------------------------------
    // OPPORTUNITY
    // -------------------------------------------------------------------------

    'Irrigation_Opportunity',
    'Wetland_Opportunity',
    'Erosion_Opportunity',
    'Reforestation_Opportunity',
    'Flood_Opportunity',
    'Agriculture_Opportunity',

    // -------------------------------------------------------------------------
    // OVERALL
    // -------------------------------------------------------------------------

    'Best_Intervention',
    'Best_Opportunity_Score',

    'Overall_Strategic_Opportunity',
    'Overall_Opportunity_Rank',

    'Maximum_Opportunity'

  ]);


// ============================================================================
// 31. FINAL FIELD COUNT
// ============================================================================

print('============================================================');
print('FINAL PHASE 4B.6 TABLE');
print('============================================================');

print(
  'Final records:',
  FINAL_TABLE.size()
);

print(
  'Final fields:',
  FINAL_TABLE.first()
    .propertyNames()
);


// ============================================================================
// 32. NATIONAL OPPORTUNITY SUMMARY
// ============================================================================

print('============================================================');
print('NATIONAL STRATEGIC OPPORTUNITY SUMMARY');
print('============================================================');

print(
  'Mean irrigation opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Irrigation_Opportunity'
  )
);

print(
  'Mean wetland opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Wetland_Opportunity'
  )
);

print(
  'Mean erosion opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Erosion_Opportunity'
  )
);

print(
  'Mean reforestation opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Reforestation_Opportunity'
  )
);

print(
  'Mean flood opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Flood_Opportunity'
  )
);

print(
  'Mean agricultural opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Agriculture_Opportunity'
  )
);

print(
  'Mean overall strategic opportunity:',
  FINAL_TABLE.aggregate_mean(
    'Overall_Strategic_Opportunity'
  )
);


// ============================================================================
// 33. OPPORTUNITY RANKING
// ============================================================================

print('============================================================');
print('OVERALL STRATEGIC OPPORTUNITY RANKING');
print('============================================================');

print(
  FINAL_TABLE
    .sort(
      'Overall_Opportunity_Rank'
    )
    .select([

      'Overall_Opportunity_Rank',
      'Id',
      'NAME',

      'Best_Intervention',
      'Best_Opportunity_Score',

      'Overall_Strategic_Opportunity'

    ])
);


// ============================================================================
// 34. MAP
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
// 35. EXPORT FULL OPPORTUNITY TABLE
// ============================================================================

Export.table.toDrive({

  collection:
    FINAL_TABLE,

  description:
    'ACRESAL_Phase4B6_Opportunity_v1',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B6_Opportunity_v1',

  fileFormat:
    'CSV'

});


// ============================================================================
// 36. EXPORT AS GEE ASSET
// ============================================================================

Export.table.toAsset({

  collection:
    FINAL_TABLE,

  description:
    'DSS_Phase4B6_Opportunity_v1',

  assetId:
    OUTPUT_ASSET

});


// ============================================================================
// 37. EXPORT TOP OPPORTUNITIES
// ============================================================================

var TOP_OPPORTUNITIES =
  FINAL_TABLE
    .sort(
      'Overall_Opportunity_Rank'
    )
    .limit(
      10
    );


Export.table.toDrive({

  collection:
    TOP_OPPORTUNITIES,

  description:
    'ACRESAL_Phase4B6_Top10_Opportunity_v1',

  folder:
    OUTPUT_FOLDER,

  fileNamePrefix:
    'ACRESAL_Phase4B6_Top10_Opportunity_v1',

  fileFormat:
    'CSV'

});


// ============================================================================
// 38. FINAL STATUS
// ============================================================================

print('============================================================');
print('PHASE 4B.6 v1 COMPLETE');
print('============================================================');

print(
  'Phase:',
  'Suitability × Intervention-Specific Investment Gap'
);

print(
  'Catchments:',
  FINAL_TABLE.size()
);

print(
  'Core interventions:',
  6
);

print(
  'Integration method:',
  'Suitability × Relative Investment Gap'
);

print(
  'Spatial level:',
  'Catchment'
);

print(
  'AHP:',
  'Consumed from Phase 4B'
);

print(
  'Normalization:',
  'Consumed from Phase 4A'
);

print(
  'Investment gap:',
  'Consumed from Phase 4B.5 v7'
);

print(
  'Pixel-level suitability:',
  'NOT YET APPLIED'
);

print(
  'Hard constraints:',
  'NOT YET APPLIED'
);

print(
  'Final investment priority:',
  'NOT YET APPLIED'
);

print(
  'Output asset:',
  OUTPUT_ASSET
);

print(
  'Next:',
  'PHASE 4C - PIXEL-LEVEL SUITABILITY + HARD CONSTRAINTS'
);

print('============================================================');
