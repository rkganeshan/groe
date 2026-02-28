import { parseCurl, parseCurlRaw } from "../shared/parseCurl";

describe("parseCurlRaw", () => {
    it("should parse a simple cURL with URL only", () => {
        const result = parseCurlRaw("curl https://api.example.com/graphql");
        expect(result.url).toBe("https://api.example.com/graphql");
        expect(result.method).toBe("GET");
        expect(result.rawBody).toBe("");
    });

    it("should parse a cURL with POST method and data", () => {
        const result = parseCurlRaw(
            `curl -X POST https://api.example.com/graphql -d '{"operationName":"GetUser","query":"query GetUser { user { name } }","variables":{"id":"123"}}'`,
        );
        expect(result.url).toBe("https://api.example.com/graphql");
        expect(result.method).toBe("POST");
        expect(result.operationName).toBe("GetUser");
        expect(result.query).toBe("query GetUser { user { name } }");
        expect(result.variables).toEqual({ id: "123" });
    });

    it("should parse cURL with --data-raw flag", () => {
        const result = parseCurlRaw(
            `curl 'https://api.example.com/graphql' --data-raw '{"operationName":"ListItems","variables":{},"query":"query ListItems { items { id } }"}'`,
        );
        expect(result.url).toBe("https://api.example.com/graphql");
        expect(result.method).toBe("POST");
        expect(result.operationName).toBe("ListItems");
        expect(result.query).toContain("query ListItems");
    });

    it("should parse headers", () => {
        const result = parseCurlRaw(
            `curl https://api.example.com/graphql -H 'Content-Type: application/json' -H 'Authorization: Bearer token123'`,
        );
        expect(result.headers["content-type"]).toBe("application/json");
        expect(result.headers["authorization"]).toBe("Bearer token123");
    });

    it("should handle line continuations", () => {
        const result = parseCurlRaw(
            `curl 'https://api.example.com/graphql' \\
       -H 'Content-Type: application/json' \\
       --data-raw '{"operationName":"Test","variables":{},"query":"query Test { test }"}'`,
        );
        expect(result.url).toBe("https://api.example.com/graphql");
        expect(result.operationName).toBe("Test");
    });

    it("should handle double-quoted strings", () => {
        const result = parseCurlRaw(
            `curl "https://api.example.com/graphql" -H "Content-Type: application/json"`,
        );
        expect(result.url).toBe("https://api.example.com/graphql");
        expect(result.headers["content-type"]).toBe("application/json");
    });

    it("should set method to POST when body is provided without explicit -X", () => {
        const result = parseCurlRaw(
            `curl https://api.example.com/graphql -d '{"query":"{ hello }"}'`,
        );
        expect(result.method).toBe("POST");
    });

    it("should handle --compressed and other flag-only options", () => {
        const result = parseCurlRaw(
            `curl 'https://api.example.com/graphql' --compressed -H 'Content-Type: application/json' --data-raw '{"operationName":"X","variables":{},"query":"query X { x }"}'`,
        );
        expect(result.url).toBe("https://api.example.com/graphql");
        expect(result.operationName).toBe("X");
    });

    it("should gracefully handle non-JSON body", () => {
        const result = parseCurlRaw(
            `curl https://example.com/api -d 'not json at all'`,
        );
        expect(result.body).toBeNull();
        expect(result.rawBody).toBe("not json at all");
    });

    it("should handle --url flag", () => {
        const result = parseCurlRaw(
            `curl --url https://api.example.com/graphql`,
        );
        expect(result.url).toBe("https://api.example.com/graphql");
    });
});

describe("parseCurl", () => {
    it("should return a partial Rule with endpoint and operation name", () => {
        const rule = parseCurl(
            `curl 'https://api.example.com/graphql' --data-raw '{"operationName":"GetUser","variables":{"userId":"abc"},"query":"query GetUser($userId: ID!) { user(id: $userId) { name } }"}'`,
        );
        expect(rule.endpoint).toBe("https://api.example.com/graphql");
        expect(rule.operationName).toBe("GetUser");
        expect(rule.name).toBe("Mock GetUser");
        expect(rule.responseMode).toBe("mock");
        expect(rule.statusCode).toBe(200);
    });

    it("should create variable conditions from variables", () => {
        const rule = parseCurl(
            `curl 'https://api.example.com/graphql' --data-raw '{"operationName":"GetItem","variables":{"id":"123","active":true},"query":"query GetItem { item { id } }"}'`,
        );
        expect(rule.variableConditions).toBeDefined();
        expect(rule.variableConditions!.length).toBe(2);
        expect(rule.variableConditions![0].field).toBe("id");
        expect(rule.variableConditions![0].operator).toBe("equals");
        expect(rule.variableConditions![0].value).toBe("123");
        expect(rule.variableConditions![1].field).toBe("active");
        expect(rule.variableConditions![1].value).toBe("true");
    });

    it("should use fallback name when no operationName is present", () => {
        const rule = parseCurl(
            `curl 'https://api.example.com/graphql' --data-raw '{"query":"{ hello }"}'`,
        );
        expect(rule.name).toBe("Mock hello");
    });

    it("should extract path from URL with query params", () => {
        const rule = parseCurl(
            `curl 'https://api.example.com/v2/graphql?region=us' --data-raw '{"operationName":"Test","variables":{},"query":"query Test { t }"}'`,
        );
        expect(rule.endpoint).toBe("https://api.example.com/v2/graphql?region=us");
    });

    it("should create default response", () => {
        const rule = parseCurl(
            `curl 'https://api.example.com/graphql' --data-raw '{"operationName":"Test","variables":{},"query":"query Test { t }"}'`,
        );
        expect(rule.response).toEqual({ data: {} });
    });

    it("should handle nested variable objects", () => {
        const rule = parseCurl(
            `curl 'https://api.example.com/graphql' --data-raw '{"operationName":"Search","variables":{"filter":{"status":"active","limit":10}},"query":"query Search { search { id } }"}'`,
        );
        expect(rule.variableConditions).toBeDefined();
        const filterCond = rule.variableConditions!.find(
            (c) => c.field === "filter",
        );
        expect(filterCond).toBeDefined();
        expect(filterCond!.value).toBe(
            JSON.stringify({ status: "active", limit: 10 }),
        );
    });
});
