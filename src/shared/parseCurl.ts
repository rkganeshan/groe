/**
 * cURL command parser — extracts GraphQL rule data from a pasted cURL string.
 *
 * Handles common flags: -X, -H, -d, --data, --data-raw, --data-binary,
 * --compressed, --url, line continuations (\), single/double quotes.
 */

import { Rule, VariableCondition, createDefaultRule } from "./types";

/** Result of parsing a cURL command */
export interface ParsedCurl {
    /** The full URL from the cURL */
    url: string;
    /** HTTP method (GET, POST, etc.) */
    method: string;
    /** Request headers as key-value pairs */
    headers: Record<string, string>;
    /** Parsed request body (if JSON) */
    body: unknown | null;
    /** Raw body string */
    rawBody: string;
    /** Extracted GraphQL operation name */
    operationName: string;
    /** Extracted GraphQL query string */
    query: string;
    /** Extracted GraphQL variables */
    variables: Record<string, unknown>;
}

/**
 * Remove surrounding quotes (single or double) from a string.
 */
function unquote(s: string): string {
    if (s.length >= 2) {
        if (
            (s.startsWith("'") && s.endsWith("'")) ||
            (s.startsWith('"') && s.endsWith('"'))
        ) {
            return s.slice(1, -1);
        }
    }
    return s;
}

/**
 * Tokenise a cURL command string into an array of arguments,
 * handling single quotes, double quotes (with backslash escapes),
 * and backslash-newline line continuations.
 */
function tokenise(input: string): string[] {
    // Normalise line continuations (backslash + newline)
    const normalised = input.replace(/\\\s*\n\s*/g, " ");

    const tokens: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;
    let escape = false;

    for (let i = 0; i < normalised.length; i++) {
        const ch = normalised[i];

        if (escape) {
            current += ch;
            escape = false;
            continue;
        }

        if (ch === "\\" && !inSingle) {
            escape = true;
            continue;
        }

        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }

        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }

        if ((ch === " " || ch === "\t") && !inSingle && !inDouble) {
            if (current.length > 0) {
                tokens.push(current);
                current = "";
            }
            continue;
        }

        current += ch;
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
}

/**
 * Extract the operation name from a GraphQL query string.
 * Handles:
 *   - Named operations:   "query GetUser($id: ID!) { ... }" → "GetUser"
 *   - Anonymous queries:  "query ($id: ID!) { getUser(...) { ... } }" → "getUser"
 *   - Shorthand queries:  "{ getUser { name } }" → "getUser"
 */
function extractOperationNameFromQuery(query: string): string {
    const trimmed = query.trim();

    // 1. Try named operation: query/mutation/subscription OperationName
    const namedMatch = trimmed.match(
        /^(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/,
    );
    if (namedMatch) return namedMatch[1];

    // 2. Try first field name inside the selection set { fieldName ... }
    //    Works for anonymous ops like `query (...) { getUser(...) { ... } }`
    //    and shorthand `{ getUser { ... } }`
    const fieldMatch = trimmed.match(/\{\s*([A-Za-z_]\w*)/);
    if (fieldMatch) return fieldMatch[1];

    return "";
}

/**
 * Parse a raw cURL command string into structured data.
 */
export function parseCurlRaw(curl: string): ParsedCurl {
    const result: ParsedCurl = {
        url: "",
        method: "GET",
        headers: {},
        body: null,
        rawBody: "",
        operationName: "",
        query: "",
        variables: {},
    };

    // Strip leading "curl" if present
    let input = curl.trim();
    if (input.toLowerCase().startsWith("curl")) {
        input = input.slice(4).trim();
    }

    const tokens = tokenise(input);
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];

        switch (token) {
            case "-X":
            case "--request":
                i++;
                if (i < tokens.length) {
                    result.method = tokens[i].toUpperCase();
                }
                break;

            case "-H":
            case "--header": {
                i++;
                if (i < tokens.length) {
                    const headerStr = tokens[i];
                    const colonIdx = headerStr.indexOf(":");
                    if (colonIdx > 0) {
                        const key = headerStr.slice(0, colonIdx).trim();
                        const value = headerStr.slice(colonIdx + 1).trim();
                        result.headers[key.toLowerCase()] = value;
                    }
                }
                break;
            }

            case "-d":
            case "--data":
            case "--data-raw":
            case "--data-binary":
            case "--data-urlencode": {
                i++;
                if (i < tokens.length) {
                    result.rawBody = tokens[i];
                    result.method = result.method === "GET" ? "POST" : result.method;
                }
                break;
            }

            case "--url": {
                i++;
                if (i < tokens.length) {
                    result.url = tokens[i];
                }
                break;
            }

            case "--compressed":
            case "--location":
            case "-L":
            case "-k":
            case "--insecure":
            case "-s":
            case "--silent":
            case "-v":
            case "--verbose":
                // Flag-only options, skip
                break;

            default:
                // If it looks like a URL or is the first positional argument
                if (
                    !result.url &&
                    (token.startsWith("http://") ||
                        token.startsWith("https://") ||
                        token.startsWith("'") ||
                        token.startsWith('"'))
                ) {
                    result.url = unquote(token);
                } else if (!result.url && !token.startsWith("-")) {
                    result.url = token;
                }
                break;
        }

        i++;
    }

    // Clean up URL
    result.url = unquote(result.url);

    // Try to parse the body as JSON
    if (result.rawBody) {
        try {
            const parsed = JSON.parse(result.rawBody);
            result.body = parsed;

            // Extract GraphQL fields
            if (parsed && typeof parsed === "object") {
                if (typeof parsed.query === "string") {
                    result.query = parsed.query;
                }
                if (typeof parsed.operationName === "string") {
                    result.operationName = parsed.operationName;
                } else if (result.query) {
                    // Fallback: extract name from query string itself
                    result.operationName = extractOperationNameFromQuery(result.query);
                }
                if (parsed.variables && typeof parsed.variables === "object") {
                    result.variables = parsed.variables as Record<string, unknown>;
                }
            }
        } catch {
            // Body is not valid JSON, keep rawBody only
        }
    }

    return result;
}

/**
 * Extract the path portion from a URL string.
 * e.g. "https://api.example.com/graphql?v=1" → "/graphql"
 */
function extractPath(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.pathname;
    } catch {
        // If it's already a path or URL parsing fails
        const match = url.match(/^https?:\/\/[^/]+(\/[^?#]*)/);
        return match ? match[1] : url;
    }
}

/**
 * Build variable conditions from a GraphQL variables object.
 * Creates an "equals" condition for each top-level key with a primitive value.
 */
function buildVariableConditions(
    variables: Record<string, unknown>,
): VariableCondition[] {
    const conditions: VariableCondition[] = [];

    for (const [key, value] of Object.entries(variables)) {
        if (value === null || value === undefined) continue;

        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            conditions.push({
                field: key,
                operator: "equals",
                value: String(value),
            });
        } else if (typeof value === "object") {
            // For nested objects, stringify them for the condition value
            conditions.push({
                field: key,
                operator: "equals",
                value: JSON.stringify(value),
            });
        }
    }

    return conditions;
}

/**
 * Detect whether a GraphQL query string is a mutation.
 */
function isMutation(query: string): boolean {
    const trimmed = query.trim();
    return trimmed.startsWith("mutation");
}

/**
 * Parse a cURL command and return a partial Rule suitable for pre-filling the Rule Editor.
 */
export function parseCurl(curlString: string): Partial<Rule> {
    const parsed = parseCurlRaw(curlString);

    const ruleName = parsed.operationName
        ? `${isMutation(parsed.query) ? "Mock" : "Mock"} ${parsed.operationName}`
        : "Imported Rule";

    const endpoint = parsed.url || "/graphql";

    const variableConditions = buildVariableConditions(parsed.variables);

    return {
        name: ruleName,
        endpoint,
        operationName: parsed.operationName || undefined,
        operationMatchType: "exact",
        variableConditions,
        response: { data: {} },
        responseMode: "mock",
        statusCode: 200,
    };
}
