import {
  matchesEndpoint,
  matchesOperationName,
  matchesQuery,
  matchesVariables,
  evaluateCondition,
  getNestedValue,
  findMatchingRule,
  parseGraphQLBody,
  findMatchingRulesForBatch,
  extractOperationNameFromQuery,
  deepMerge,
} from "../shared/matching-engine";
import { Rule, VariableCondition, createDefaultRule } from "../shared/types";

// ——— Helpers ———

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return createDefaultRule({
    id: "test-rule-1",
    name: "Test Rule",
    enabled: true,
    endpoint: "/graphql",
    operationName: "GetUser",
    operationMatchType: "exact",
    response: { data: { user: { id: "1", name: "Mock User" } } },
    statusCode: 200,
    priority: 0,
    variableConditions: [],
    ...overrides,
  });
}

// ——— matchesEndpoint ———

describe("matchesEndpoint", () => {
  it("should match exact path", () => {
    expect(matchesEndpoint("https://example.com/graphql", "/graphql")).toBe(
      true,
    );
  });

  it("should match full URL", () => {
    expect(
      matchesEndpoint("https://example.com/api", "https://example.com/api"),
    ).toBe(true);
  });

  it("should match substring", () => {
    expect(matchesEndpoint("https://example.com/api/graphql", "graphql")).toBe(
      true,
    );
  });

  it("should match wildcard", () => {
    expect(
      matchesEndpoint("https://example.com/api/v1/graphql", "/api/*/graphql"),
    ).toBe(true);
  });

  it("should not match different path", () => {
    expect(matchesEndpoint("https://example.com/rest", "/graphql")).toBe(false);
  });

  it("should match empty endpoint (any URL)", () => {
    expect(matchesEndpoint("https://example.com/anything", "")).toBe(true);
  });
});

// ——— matchesOperationName ———

describe("matchesOperationName", () => {
  it("should match exact operation name", () => {
    const rule = makeRule({
      operationName: "GetUser",
      operationMatchType: "exact",
    });
    expect(matchesOperationName("GetUser", rule)).toBe(true);
  });

  it("should not match different operation name", () => {
    const rule = makeRule({
      operationName: "GetUser",
      operationMatchType: "exact",
    });
    expect(matchesOperationName("CreateUser", rule)).toBe(false);
  });

  it("should match regex operation name", () => {
    const rule = makeRule({
      operationName: "Get.*",
      operationMatchType: "regex",
    });
    expect(matchesOperationName("GetUser", rule)).toBe(true);
    expect(matchesOperationName("GetPosts", rule)).toBe(true);
  });

  it("should not match regex when different", () => {
    const rule = makeRule({
      operationName: "^Create",
      operationMatchType: "regex",
    });
    expect(matchesOperationName("GetUser", rule)).toBe(false);
  });

  it("should match when rule has no operationName (wildcard)", () => {
    const rule = makeRule({ operationName: "" });
    expect(matchesOperationName("AnythingGoes", rule)).toBe(true);
  });

  it("should not match when request has no operationName", () => {
    const rule = makeRule({ operationName: "GetUser" });
    expect(matchesOperationName(undefined, rule)).toBe(false);
  });
});

// ——— matchesQuery ———

describe("matchesQuery", () => {
  it("should match query with regex", () => {
    const rule = makeRule({ queryRegex: "query.*GetUser" });
    expect(matchesQuery("query GetUser { user { id } }", rule)).toBe(true);
  });

  it("should not match different query", () => {
    const rule = makeRule({ queryRegex: "mutation.*CreateUser" });
    expect(matchesQuery("query GetUser { user { id } }", rule)).toBe(false);
  });

  it("should match when no queryRegex (wildcard)", () => {
    const rule = makeRule({ queryRegex: "" });
    expect(matchesQuery("anything", rule)).toBe(true);
  });
});

// ——— getNestedValue ———

describe("getNestedValue", () => {
  it("should get top-level value", () => {
    expect(getNestedValue({ id: "123" }, "id")).toBe("123");
  });

  it("should get nested value", () => {
    expect(getNestedValue({ user: { id: "123" } }, "user.id")).toBe("123");
  });

  it("should return undefined for missing path", () => {
    expect(getNestedValue({ user: {} }, "user.id")).toBeUndefined();
  });

  it("should return undefined for null in path", () => {
    expect(getNestedValue({ user: null } as any, "user.id")).toBeUndefined();
  });
});

// ——— evaluateCondition ———

describe("evaluateCondition", () => {
  it("should evaluate equals", () => {
    const cond: VariableCondition = {
      field: "id",
      operator: "equals",
      value: "123",
    };
    expect(evaluateCondition({ id: "123" }, cond)).toBe(true);
    expect(evaluateCondition({ id: "456" }, cond)).toBe(false);
  });

  it("should evaluate not_equals", () => {
    const cond: VariableCondition = {
      field: "id",
      operator: "not_equals",
      value: "123",
    };
    expect(evaluateCondition({ id: "456" }, cond)).toBe(true);
    expect(evaluateCondition({ id: "123" }, cond)).toBe(false);
  });

  it("should evaluate contains", () => {
    const cond: VariableCondition = {
      field: "name",
      operator: "contains",
      value: "test",
    };
    expect(evaluateCondition({ name: "test-user" }, cond)).toBe(true);
    expect(evaluateCondition({ name: "admin" }, cond)).toBe(false);
  });

  it("should evaluate regex", () => {
    const cond: VariableCondition = {
      field: "email",
      operator: "regex",
      value: ".*@test\\.com$",
    };
    expect(evaluateCondition({ email: "user@test.com" }, cond)).toBe(true);
    expect(evaluateCondition({ email: "user@other.com" }, cond)).toBe(false);
  });

  it("should evaluate exists", () => {
    const cond: VariableCondition = {
      field: "id",
      operator: "exists",
      value: "",
    };
    expect(evaluateCondition({ id: "123" }, cond)).toBe(true);
    expect(evaluateCondition({}, cond)).toBe(false);
  });

  it("should evaluate not_exists", () => {
    const cond: VariableCondition = {
      field: "id",
      operator: "not_exists",
      value: "",
    };
    expect(evaluateCondition({}, cond)).toBe(true);
    expect(evaluateCondition({ id: "123" }, cond)).toBe(false);
  });

  it("should return false when variables is undefined", () => {
    const cond: VariableCondition = {
      field: "id",
      operator: "equals",
      value: "123",
    };
    expect(evaluateCondition(undefined, cond)).toBe(false);
  });
});

// ——— matchesVariables ———

describe("matchesVariables", () => {
  it("should match when no conditions", () => {
    expect(matchesVariables({ anything: true }, [])).toBe(true);
  });

  it("should match when all conditions pass", () => {
    const conditions: VariableCondition[] = [
      { field: "id", operator: "equals", value: "123" },
      { field: "type", operator: "equals", value: "admin" },
    ];
    expect(matchesVariables({ id: "123", type: "admin" }, conditions)).toBe(
      true,
    );
  });

  it("should not match when any condition fails", () => {
    const conditions: VariableCondition[] = [
      { field: "id", operator: "equals", value: "123" },
      { field: "type", operator: "equals", value: "admin" },
    ];
    expect(matchesVariables({ id: "123", type: "user" }, conditions)).toBe(
      false,
    );
  });
});

// ——— findMatchingRule ———

describe("findMatchingRule", () => {
  it("should find matching rule", () => {
    const rules = [makeRule()];
    const result = findMatchingRule(rules, "https://example.com/graphql", {
      operationName: "GetUser",
      query: "query GetUser { user { id } }",
      variables: {},
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("test-rule-1");
  });

  it("should return null when no match", () => {
    const rules = [makeRule()];
    const result = findMatchingRule(rules, "https://example.com/graphql", {
      operationName: "CreateUser",
    });
    expect(result).toBeNull();
  });

  it("should skip disabled rules", () => {
    const rules = [makeRule({ enabled: false })];
    const result = findMatchingRule(rules, "https://example.com/graphql", {
      operationName: "GetUser",
    });
    expect(result).toBeNull();
  });

  it("should return highest priority rule", () => {
    const rules = [
      makeRule({ id: "low", priority: 1, name: "Low Priority" }),
      makeRule({ id: "high", priority: 10, name: "High Priority" }),
      makeRule({ id: "mid", priority: 5, name: "Mid Priority" }),
    ];
    const result = findMatchingRule(rules, "https://example.com/graphql", {
      operationName: "GetUser",
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("high");
  });

  it("should match with variable conditions", () => {
    const rules = [
      makeRule({
        id: "with-var",
        variableConditions: [
          { field: "userId", operator: "equals", value: "1234" },
        ],
      }),
    ];
    const result = findMatchingRule(rules, "https://example.com/graphql", {
      operationName: "GetUser",
      variables: { userId: "1234" },
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("with-var");
  });

  it("should not match when variable condition fails", () => {
    const rules = [
      makeRule({
        variableConditions: [
          { field: "userId", operator: "equals", value: "1234" },
        ],
      }),
    ];
    const result = findMatchingRule(rules, "https://example.com/graphql", {
      operationName: "GetUser",
      variables: { userId: "9999" },
    });
    expect(result).toBeNull();
  });
});

// ——— parseGraphQLBody ———

describe("parseGraphQLBody", () => {
  it("should parse single request string", () => {
    const body = JSON.stringify({
      operationName: "GetUser",
      query: "query GetUser { user { id } }",
      variables: { id: "1" },
    });
    const result = parseGraphQLBody(body);
    expect(Array.isArray(result)).toBe(false);
    const single = result as {
      operationName: string;
      query: string;
      variables: object;
    };
    expect(single.operationName).toBe("GetUser");
    expect(single.query).toBe("query GetUser { user { id } }");
    expect(single.variables).toEqual({ id: "1" });
  });

  it("should parse batched request", () => {
    const body = JSON.stringify([
      { operationName: "GetUser", query: "q1", variables: {} },
      { operationName: "GetPosts", query: "q2", variables: {} },
    ]);
    const result = parseGraphQLBody(body);
    expect(Array.isArray(result)).toBe(true);
    const arr = result as Array<{ operationName: string }>;
    expect(arr.length).toBe(2);
    expect(arr[0].operationName).toBe("GetUser");
    expect(arr[1].operationName).toBe("GetPosts");
  });

  it("should handle invalid JSON", () => {
    const result = parseGraphQLBody("not json");
    expect(Array.isArray(result)).toBe(false);
    const single = result as { query: string };
    expect(single.query).toBe("not json");
  });

  it("should parse object body", () => {
    const result = parseGraphQLBody({
      operationName: "GetUser",
      query: "query",
      variables: {},
    });
    expect(Array.isArray(result)).toBe(false);
  });
});

// ——— findMatchingRulesForBatch ———

describe("findMatchingRulesForBatch", () => {
  it("should match individual operations in batch", () => {
    const rules = [
      makeRule({ id: "r1", operationName: "GetUser" }),
      makeRule({ id: "r2", operationName: "GetPosts" }),
    ];
    const operations = [
      { operationName: "GetUser" },
      { operationName: "GetPosts" },
      { operationName: "Unknown" },
    ];
    const results = findMatchingRulesForBatch(
      rules,
      "https://example.com/graphql",
      operations,
    );
    expect(results.length).toBe(3);
    expect(results[0]?.id).toBe("r1");
    expect(results[1]?.id).toBe("r2");
    expect(results[2]).toBeNull();
  });
});

// ——— extractOperationNameFromQuery ———

describe("extractOperationNameFromQuery", () => {
  it("should extract named query operation", () => {
    expect(
      extractOperationNameFromQuery("query GetUser($id: ID!) { user { id } }"),
    ).toBe("GetUser");
  });

  it("should extract named mutation operation", () => {
    expect(
      extractOperationNameFromQuery(
        "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }",
      ),
    ).toBe("CreateUser");
  });

  it("should extract named subscription operation", () => {
    expect(
      extractOperationNameFromQuery(
        "subscription OnMessage { messageAdded { id text } }",
      ),
    ).toBe("OnMessage");
  });

  it("should extract first root field from anonymous query", () => {
    expect(
      extractOperationNameFromQuery(
        "query ($assetId: ID!) { getAssetCPUDetailsV2(assetId: $assetId) { cpuName } }",
      ),
    ).toBe("getAssetCPUDetailsV2");
  });

  it("should extract first root field from anonymous mutation", () => {
    expect(
      extractOperationNameFromQuery(
        "mutation ($input: Input!) { updateSettings(input: $input) { ok } }",
      ),
    ).toBe("updateSettings");
  });

  it("should extract from shorthand query (no keyword)", () => {
    expect(extractOperationNameFromQuery("{ viewer { id name } }")).toBe(
      "viewer",
    );
  });

  it("should return undefined for empty/null query", () => {
    expect(extractOperationNameFromQuery(undefined)).toBeUndefined();
    expect(extractOperationNameFromQuery("")).toBeUndefined();
  });

  it("should handle multiline query", () => {
    const query = `query ($input: TimeseriesGraphInput) {
  getTimeseriesData(input: $input) {
    time
    metricSeries {
      metricId
    }
  }
}`;
    expect(extractOperationNameFromQuery(query)).toBe("getTimeseriesData");
  });
});

// ——— parseGraphQLBody — operationName inference ———

describe("parseGraphQLBody — operationName inference", () => {
  it("should infer operationName from query when not in body", () => {
    const body = JSON.stringify({
      query:
        "query ($assetId: ID!) { getAssetCPUDetailsV2(assetId: $assetId) { cpuName } }",
      variables: { assetId: "123" },
    });
    const result = parseGraphQLBody(body);
    expect(Array.isArray(result)).toBe(false);
    const single = result as { operationName: string };
    expect(single.operationName).toBe("getAssetCPUDetailsV2");
  });

  it("should prefer explicit operationName over inferred", () => {
    const body = JSON.stringify({
      operationName: "ExplicitName",
      query: "query { inferredName { id } }",
      variables: {},
    });
    const result = parseGraphQLBody(body);
    expect(Array.isArray(result)).toBe(false);
    const single = result as { operationName: string };
    expect(single.operationName).toBe("ExplicitName");
  });

  it("should infer operationName in batched requests", () => {
    const body = JSON.stringify([
      {
        query: "query ($id: ID!) { getUser(id: $id) { name } }",
        variables: { id: "1" },
      },
      {
        operationName: "GetPosts",
        query: "query GetPosts { posts { title } }",
        variables: {},
      },
    ]);
    const result = parseGraphQLBody(body);
    expect(Array.isArray(result)).toBe(true);
    const arr = result as Array<{ operationName: string }>;
    expect(arr[0].operationName).toBe("getUser");
    expect(arr[1].operationName).toBe("GetPosts");
  });

  it("should match a rule when operationName is inferred from anonymous query", () => {
    const rules = [
      makeRule({
        id: "cpu-rule",
        operationName: "getAssetCPUDetailsV2",
        response: { data: { getAssetCPUDetailsV2: { cpuName: "Mock CPU" } } },
      }),
    ];

    const body = JSON.stringify({
      query:
        "query ($assetId: ID!) { getAssetCPUDetailsV2(assetId: $assetId) { cpuName } }",
      variables: { assetId: "abc" },
    });

    const parsed = parseGraphQLBody(body);
    expect(Array.isArray(parsed)).toBe(false);
    const single = parsed as { operationName: string };
    expect(single.operationName).toBe("getAssetCPUDetailsV2");

    const match = findMatchingRule(
      rules,
      "https://example.com/graphql",
      single,
    );
    expect(match).not.toBeNull();
    expect(match!.id).toBe("cpu-rule");
  });
});

// ——— deepMerge ———

describe("deepMerge", () => {
  it("should override top-level primitive values", () => {
    const base = { a: 1, b: 2, c: 3 };
    const override = { b: 99 };
    expect(deepMerge(base, override)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("should add new keys", () => {
    const base = { a: 1 };
    const override = { b: 2 };
    expect(deepMerge(base, override)).toEqual({ a: 1, b: 2 });
  });

  it("should deep-merge nested objects", () => {
    const base = { data: { user: { id: "1", name: "Alice", role: "USER" } } };
    const override = { data: { user: { role: "ADMIN" } } };
    expect(deepMerge(base, override)).toEqual({
      data: { user: { id: "1", name: "Alice", role: "ADMIN" } },
    });
  });

  it("should remove keys set to null", () => {
    const base = {
      data: { user: { id: "1", name: "Alice", temp: "remove-me" } },
    };
    const override = { data: { user: { temp: null } } };
    expect(deepMerge(base, override)).toEqual({
      data: { user: { id: "1", name: "Alice" } },
    });
  });

  it("should replace arrays entirely", () => {
    const base = { data: { tags: ["a", "b", "c"] } };
    const override = { data: { tags: ["x"] } };
    expect(deepMerge(base, override)).toEqual({ data: { tags: ["x"] } });
  });

  it("should add nested keys that don't exist in base", () => {
    const base = { data: { user: { id: "1" } } };
    const override = {
      data: { user: { plan: "enterprise", features: ["sso"] } },
    };
    expect(deepMerge(base, override)).toEqual({
      data: { user: { id: "1", plan: "enterprise", features: ["sso"] } },
    });
  });

  it("should handle override being a primitive (non-object base)", () => {
    expect(deepMerge("old", "new")).toBe("new");
    expect(deepMerge(42, 99)).toBe(99);
  });

  it("should handle base being null", () => {
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
  });

  it("should handle override being null (explicit deletion)", () => {
    expect(deepMerge({ a: 1 }, null)).toBe(null);
  });

  it("should work with a realistic GraphQL response override", () => {
    const realResponse = {
      data: {
        getUser: {
          id: "u-123",
          name: "Jane Doe",
          email: "jane@example.com",
          role: "USER",
          plan: "free",
          status: "ACTIVE",
          settings: {
            theme: "light",
            notifications: true,
          },
        },
      },
    };

    const overridePatch = {
      data: {
        getUser: {
          role: "ADMIN",
          plan: "enterprise",
          settings: {
            theme: "dark",
          },
        },
      },
    };

    const result = deepMerge(realResponse, overridePatch) as Record<
      string,
      unknown
    >;
    const user = (result.data as Record<string, unknown>).getUser as Record<
      string,
      unknown
    >;

    expect(user.id).toBe("u-123"); // untouched
    expect(user.name).toBe("Jane Doe"); // untouched
    expect(user.email).toBe("jane@example.com"); // untouched
    expect(user.role).toBe("ADMIN"); // overridden
    expect(user.plan).toBe("enterprise"); // overridden
    expect(user.status).toBe("ACTIVE"); // untouched
    expect((user.settings as Record<string, unknown>).theme).toBe("dark"); // overridden
    expect((user.settings as Record<string, unknown>).notifications).toBe(true); // untouched
  });
});
