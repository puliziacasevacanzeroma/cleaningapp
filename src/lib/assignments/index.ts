/**
 * Modulo Assegnazioni Intelligenti
 * 
 * Sistema per calcolare il miglior operatore da assegnare a una pulizia
 * basandosi su prossimità, familiarità, carico di lavoro e performance.
 */

export {
  calculateAssignmentScore,
  getTopOperatorsForCleaning,
  loadTodayAssignmentsByOperator,
  getOperatorWorkloadForDate,
  type CleaningForAssignment,
  type OperatorForAssignment,
  type ExistingAssignment,
  type ScoreBreakdown,
  type AssignmentScore,
} from "./calculateAssignmentScore";
