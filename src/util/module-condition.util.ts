/**
 * Shared helpers for cron `moduleConditions` (operator + value per field) used in SQL builders.
 */

/** Operators stored on `CronJobModuleCondition` and similar condition DTOs. */
export type ModuleConditionOperator = "eq" | "neq" | "lt" | "gt";

export function moduleConditionOperatorToSql(
  operator: ModuleConditionOperator,
): string {
  const map: Record<ModuleConditionOperator, string> = {
    eq: "=",
    neq: "!=",
    lt: "<",
    gt: ">",
  };
  return map[operator] ?? "=";
}

/**
 * Coerces string condition values to numbers when `propertyKey` is listed in `numericPropertyKeys`.
 */
export function coerceModuleConditionValue(
  value: string,
  propertyKey: string,
  numericPropertyKeys: ReadonlySet<string>,
): string | number {
  if (numericPropertyKeys.has(propertyKey)) {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

/**
 * Compare an actual value against an expected value using the given operator.
 * Works for both string and numeric comparisons; numeric coercion is attempted
 * automatically for relational operators.
 */
export function evaluateCondition(
  actual: unknown,
  operator: string,
  expected: string | null | undefined,
): boolean {
  let ev = expected ?? "";
  const av =
    actual === null || actual === undefined ? "" : String(actual).toLowerCase();

  if (typeof ev === "string") {
    ev = ev.toLowerCase();
  }
  switch (operator) {
    case "eq":
      return av === ev;
    case "neq":
      return av !== ev;
    case "lt":
      return Number(actual) < Number(ev);
    case "gt":
      return Number(actual) > Number(ev);
    case "lte":
      return Number(actual) <= Number(ev);
    case "gte":
      return Number(actual) >= Number(ev);
    case "contains":
      return av.includes(ev);
    case "not_contains":
      return !av.includes(ev);
    default:
      return av === ev;
  }
}

/** VehicleJob (and `location.*`) fields treated as numeric in module condition SQL params. */
export const VEHICLE_JOB_NUMERIC_MODULE_CONDITION_KEYS = new Set([
  "startDate",
  "endDate",
  "dueDate",
  "totalAmount",
  "tax",
  "discount",
  "latitude",
  "longitude",
]);
