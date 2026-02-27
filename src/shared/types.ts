/**
 * Core type definitions for the GraphQL Request Override Extension.
 */

/** Condition operators for variable matching */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "regex"
  | "exists"
  | "not_exists"
  | "json_path";

/** A single variable condition */
export interface VariableCondition {
  /** The variable field path (dot notation, e.g. "user.id") */
  field: string;
  /** The matching operator */
  operator: ConditionOperator;
  /** The value to compare against */
  value: string;
}

/** Match type for operation name */
export type OperationMatchType = "exact" | "regex";

/** Response mode: mock = block & return fake data, override = passthrough & merge */
export type ResponseMode = "mock" | "override";

/** A single mock rule */
export interface Rule {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether this rule is active */
  enabled: boolean;
  /** The GraphQL endpoint URL pattern to match */
  endpoint: string;
  /** Operation name to match */
  operationName?: string;
  /** How to match the operation name */
  operationMatchType: OperationMatchType;
  /** Regex pattern to match against the query string */
  queryRegex?: string;
  /** Variable conditions for advanced matching */
  variableConditions: VariableCondition[];
  /**
   * The response body (JSON).
   * - In "mock" mode: returned as-is (replaces the real response entirely).
   * - In "override" mode: deep-merged on top of the real backend response.
   */
  response: object;
  /** Response mode — mock (default) blocks the request; override lets it through and merges */
  responseMode?: ResponseMode;
  /**
   * Optional clean query to send to the backend in override mode.
   * When set, the interceptor replaces the outgoing GraphQL query with this
   * string before forwarding the request, so that new fields in the app's
   * query (which don't exist on the backend yet) won't cause a schema error.
   * The override response JSON is then merged into the backend's response.
   */
  overrideQuery?: string;
  /** HTTP status code to return */
  statusCode: number;
  /** Rule priority (higher = matched first) */
  priority: number;
  /** Optional group ID */
  groupId?: string;
  /** Optional delay in milliseconds before responding */
  delay?: number;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/** A group of rules */
export interface RuleGroup {
  /** Unique identifier */
  id: string;
  /** Group name */
  name: string;
  /** Whether all rules in this group are enabled */
  enabled: boolean;
  /** Optional description */
  description?: string;
  /** Created timestamp */
  createdAt: number;
}

/** Domain-specific settings */
export interface DomainSettings {
  /** The domain (e.g., "example.com") */
  domain: string;
  /** Whether interception is enabled for this domain */
  enabled: boolean;
}

/** Global extension settings */
export interface ExtensionSettings {
  /** Master ON/OFF switch */
  enabled: boolean;
  /** Per-domain settings */
  domains: DomainSettings[];
}

/** Message types for communication between extension components */
export type MessageType =
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "GET_RULES"
  | "ADD_RULE"
  | "UPDATE_RULE"
  | "DELETE_RULE"
  | "GET_GROUPS"
  | "ADD_GROUP"
  | "UPDATE_GROUP"
  | "DELETE_GROUP"
  | "IMPORT_RULES"
  | "EXPORT_RULES"
  | "MATCH_REQUEST"
  | "INTERCEPT_REQUEST"
  | "INTERCEPT_RESPONSE"
  | "SETTINGS_CHANGED"
  | "RULES_CHANGED"
  | "REQUEST_INTERCEPTED"
  | "TOGGLE_EXTENSION"
  | "GET_STATS";

/** Message envelope for extension messaging */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

/** A parsed GraphQL request */
export interface ParsedGraphQLRequest {
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;
}

/** A log entry for an intercepted request */
export interface InterceptLog {
  id: string;
  timestamp: number;
  url: string;
  operationName?: string;
  ruleId: string;
  ruleName: string;
  statusCode: number;
}

/** Stats for the popup badge */
export interface InterceptStats {
  activeRuleCount: number;
  interceptedCount: number;
  domain: string;
}

/** Import/Export data format */
export interface ExportData {
  version: string;
  exportedAt: number;
  rules: Rule[];
  groups: RuleGroup[];
}

/** Default rule template */
export function createDefaultRule(partial?: Partial<Rule>): Rule {
  const now = Date.now();
  return {
    id: "",
    name: "New Rule",
    enabled: true,
    endpoint: "/graphql",
    operationName: "",
    operationMatchType: "exact",
    queryRegex: "",
    variableConditions: [],
    response: { data: {} },
    responseMode: "mock",
    statusCode: 200,
    priority: 0,
    groupId: undefined,
    delay: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Default settings */
export function createDefaultSettings(): ExtensionSettings {
  return {
    enabled: true,
    domains: [],
  };
}
