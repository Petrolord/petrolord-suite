/**
 * Input provenance: the per-input source model, its saved form, the report
 * wording and the PVT provenance contract. Design and status:
 * docs/scope/ReportKit-DESIGN-AND-STATUS.md.
 *
 * This index is pure (no React). The shared control is imported from its
 * own file: '@/lib/inputProvenance/InputSourceControl'.
 */
export {
  PROVENANCE_KEY, INPUT_SOURCES, SOURCE_KINDS, PROVENANCE_FIELDS, isSourceKind, normalizeMeta, isStated,
  countStated, setProvenanceField, serializeProvenance, deserializeProvenance, provenanceFromPayload,
} from './model.js';
export {
  SOURCE_NOT_STATED, NOT_PROVIDED, sourceText, assumedDefaultText, computedText, inputRow,
} from './wording.js';
export {
  PVT_CONTRACT_VERSION, PVT_HANDOFF_STATE_KEY, PVT_PRODUCER, PVT_SOURCES, PVT_PROPERTIES,
  pvtMethod, pvtPropertyProvenance, describePvtHandoff, validatePvtHandoff, pvtIntake, intakeSourceText,
  PVT1_SCHEMA, PVT_PROJECT_PARAM, PVT_CONTRACT_PAYLOAD_KEY, PVT1_PROPERTIES, PVT1_UNITS, PVT1_PB_SOURCES, PVT1_TUNING_STATES,
  buildPvtContract, pvtContractOf, validatePvtContract, pvtContractOrigin, pvtContractTuningText, pvtContractSourceText,
  describePvtContract, pvtContractCsvHeader, pvtContractSummary, editedAfterHandoffText,
} from './pvtContract.js';
