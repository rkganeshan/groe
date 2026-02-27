/**
 * Matching Engine — the core rule matching logic.
 *
 * For each incoming GraphQL request:
 * 1. Filter rules by endpoint match
 * 2. Filter by operationName match (exact or regex)
 * 3. Filter by query regex (if no operationName)
 * 4. Filter by variable conditions
 * 5. Sort by priority (higher first)
 * 6. Return the first (highest priority) match
 */

import {
  Rule,
  ParsedGraphQLRequest,
  VariableCondition,
  ConditionOperator,
} from "./types";

/**
 * Check if a URL matches a rule's endpoint pattern.
 * Supports:
 * - Exact path match (e.g., "/graphql")
 * - Substring match (e.g., the URL contains the endpoint string)
 * - Glob-like matching with * wildcards
 */
export function matchesEndpoint(requestUrl: string, endpoint: string): boolean {
  if (!endpoint) return true;

  try {
    const url = new URL(requestUrl);
    const path = url.pathname + url.search;

    // Exact match on full URL
    if (requestUrl === endpoint) return true;

    // Path match
    if (path === endpoint) return true;

    // Substring match
    if (requestUrl.includes(endpoint)) return true;

    // Wildcard match
    if (endpoint.includes("*")) {
      const regex = new RegExp(
        "^" +
          endpoint.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
          "$",
      );
      return regex.test(requestUrl) || regex.test(path);
    }
  } catch {
    // If URL parsing fails, fall back to substring match
    return requestUrl.includes(endpoint);
  }

  return false;
}

/**
 * Check if an operation name matches a rule.
 */
export function matchesOperationName(
  requestOpName: string | undefined,
  rule: Rule,
): boolean {
  if (!rule.operationName) return true; // No constraint = match all
  if (!requestOpName) return false;

  if (rule.operationMatchType === "regex") {
    try {
      const regex = new RegExp(rule.operationName);
      return regex.test(requestOpName);
    } catch {
      return false;
    }
  }

  // Exact match
  return requestOpName === rule.operationName;
}

/**
 * Check if a query string matches a rule's queryRegex.
 */
export function matchesQuery(query: string | undefined, rule: Rule): boolean {
  if (!rule.queryRegex) return true; // No constraint
  if (!query) return false;

  try {
    const regex = new RegExp(rule.queryRegex);
    return regex.test(query);
  } catch {
    return false;
  }
}

/**
 * Resolve a dot-notation path on an object.
 * e.g., getNestedValue({ a: { b: 1 } }, "a.b") => 1
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a single variable condition.
 */
export function evaluateCondition(
  variables: Record<string, unknown> | undefined,
  condition: VariableCondition,
): boolean {
  if (!variables) return false;

  const value = getNestedValue(variables, condition.field);

  switch (condition.operator) {
    case "equals":
      return String(value) === condition.value;

    case "not_equals":
      return String(value) !== condition.value;

    case "contains":
      return String(value).includes(condition.value);

    case "regex":
      try {
        return new RegExp(condition.value).test(String(value));
      } catch {
        return false;
      }

    case "exists":
      return value !== undefined && value !== null;

    case "not_exists":
      return value === undefined || value === null;

    case "json_path":
      // JSON path matching — for Phase 2, simple implementation
      try {
        return String(value) === condition.value;
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Check if all variable conditions in a rule are satisfied.
 */
export function matchesVariables(
  variables: Record<string, unknown> | undefined,
  conditions: VariableCondition[],
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(variables, c));
}

/**
 * Find the best matching rule for a given request.
 *
 * @param rules - All enabled rules (pre-filtered)
 * @param requestUrl - The full request URL
 * @param parsed - Parsed GraphQL request body
 * @returns The matched rule, or null
 */
export function findMatchingRule(
  rules: Rule[],
  requestUrl: string,
  parsed: ParsedGraphQLRequest,
): Rule | null {
  const candidates = rules
    .filter((r) => r.enabled)
    .filter((r) => matchesEndpoint(requestUrl, r.endpoint))
    .filter((r) => matchesOperationName(parsed.operationName, r))
    .filter((r) => matchesQuery(parsed.query, r))
    .filter((r) => matchesVariables(parsed.variables, r.variableConditions));

  if (candidates.length === 0) return null;

  // Sort by priority descending (higher priority first)
  candidates.sort((a, b) => b.priority - a.priority);

  return candidates[0];
}

/**
 * Handle batched GraphQL requests (array of operations).
 * Returns an array of matched rules (one per operation, null if no match).
 */
export function findMatchingRulesForBatch(
  rules: Rule[],
  requestUrl: string,
  operations: ParsedGraphQLRequest[],
): (Rule | null)[] {
  return operations.map((op) => findMatchingRule(rules, requestUrl, op));
}

/**
 * Deep-merge `override` into `base`.
 *
 * - Plain objects are recursively merged.
 * - Arrays in `override` replace the base array entirely.
 * - Setting a key to `null` in the override removes it from the result.
 * - All other primitive values in `override` replace the base value.
 *
 * Used in "override" response mode to patch a real API response.
 */
export function deepMerge(base: unknown, override: unknown): unknown {
  // If override is null, treat as explicit deletion
  if (override === null) return null;

  // If override is not an object (or base isn't), override wins
  if (
    typeof override !== "object" ||
    typeof base !== "object" ||
    base === null ||
    Array.isArray(override) ||
    Array.isArray(base)
  ) {
    return override;
  }

  const result: Record<string, unknown> = {
    ...(base as Record<string, unknown>),
  };
  const overrideObj = override as Record<string, unknown>;

  for (const key of Object.keys(overrideObj)) {
    if (overrideObj[key] === null) {
      // Explicit null → remove the key
      delete result[key];
    } else if (
      typeof overrideObj[key] === "object" &&
      !Array.isArray(overrideObj[key]) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // Both sides are plain objects → recurse
      result[key] = deepMerge(result[key], overrideObj[key]);
    } else {
      // Override replaces
      result[key] = overrideObj[key];
    }
  }

  return result;
}

/**
 * Extract an operation name from a GraphQL query string.
 *
 * Handles two cases:
 * 1. Named operation:  `query GetUser($id: ID!) { ... }` → "GetUser"
 * 2. Anonymous operation with a root field: `query ($id: ID!) { getUser(...) { ... } }` → "getUser"
 *
 * Returns undefined if nothing can be extracted.
 */
export function extractOperationNameFromQuery(
  query: string | undefined,
): string | undefined {
  if (!query) return undefined;

  // Try to match a named operation: query/mutation/subscription OperationName
  const namedMatch = query.match(
    /(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/,
  );
  if (namedMatch) return namedMatch[1];

  // Anonymous operation — extract the first root-level field name.
  // Look for the first `{` then the first identifier after it.
  const braceIdx = query.indexOf("{");
  if (braceIdx !== -1) {
    const afterBrace = query.slice(braceIdx + 1).trimStart();
    const fieldMatch = afterBrace.match(/^([A-Za-z_]\w*)/);
    if (fieldMatch) return fieldMatch[1];
  }

  return undefined;
}

/**
 * Parse a request body into ParsedGraphQLRequest(s).
 * Handles both single and batched requests.
 *
 * When `operationName` is not present in the request body, we attempt
 * to infer it from the query string (named operation or first root field).
 */
export function parseGraphQLBody(
  body: string | object,
): ParsedGraphQLRequest | ParsedGraphQLRequest[] {
  let parsed: unknown;

  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return { query: typeof body === "string" ? body : undefined };
    }
  } else {
    parsed = body;
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item) => ({
      operationName:
        item.operationName || extractOperationNameFromQuery(item.query),
      query: item.query,
      variables: item.variables,
    }));
  }

  const obj = parsed as Record<string, unknown>;
  const operationName =
    (obj.operationName as string | undefined) ||
    extractOperationNameFromQuery(obj.query as string | undefined);

  return {
    operationName,
    query: obj.query as string | undefined,
    variables: obj.variables as Record<string, unknown> | undefined,
  };
}
