/**
 * Injected Interceptor Script
 *
 * This script is injected into the page context and overrides
 * window.fetch and XMLHttpRequest to intercept GraphQL requests.
 *
 * It communicates with the content script via window.postMessage.
 *
 * NOTE: This file is NOT bundled by webpack — it's a standalone JS file
 * that gets copied to the dist as-is. Keep it vanilla JS.
 */

(function () {
  "use strict";

  // ——— State ———
  let groeState = {
    settings: { enabled: true, domains: [] },
    rules: [],
    groups: [],
  };

  // ——— Matching Engine (inline, since we can't import modules) ———

  function matchesEndpoint(requestUrl, endpoint) {
    if (!endpoint) return true;
    try {
      const url = new URL(requestUrl, window.location.origin);
      const path = url.pathname + url.search;
      if (requestUrl === endpoint) return true;
      if (path === endpoint) return true;
      if (requestUrl.includes(endpoint)) return true;
      if (endpoint.includes("*")) {
        const regex = new RegExp(
          "^" +
            endpoint.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
            "$",
        );
        return regex.test(requestUrl) || regex.test(path);
      }
    } catch (e) {
      return requestUrl.includes(endpoint);
    }
    return false;
  }

  function matchesOperationName(requestOpName, rule) {
    if (!rule.operationName) return true;
    if (!requestOpName) return false;
    if (rule.operationMatchType === "regex") {
      try {
        return new RegExp(rule.operationName).test(requestOpName);
      } catch (e) {
        return false;
      }
    }
    return requestOpName === rule.operationName;
  }

  function matchesQuery(query, rule) {
    if (!rule.queryRegex) return true;
    if (!query) return false;
    try {
      return new RegExp(rule.queryRegex).test(query);
    } catch (e) {
      return false;
    }
  }

  function getNestedValue(obj, path) {
    var parts = path.split(".");
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  function evaluateCondition(variables, condition) {
    if (!variables) return false;
    var value = getNestedValue(variables, condition.field);

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
        } catch (e) {
          return false;
        }
      case "exists":
        return value !== undefined && value !== null;
      case "not_exists":
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  function matchesVariables(variables, conditions) {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(function (c) {
      return evaluateCondition(variables, c);
    });
  }

  function findMatchingRule(rules, requestUrl, parsed) {
    var candidates = rules
      .filter(function (r) {
        return r.enabled;
      })
      .filter(function (r) {
        return matchesEndpoint(requestUrl, r.endpoint);
      })
      .filter(function (r) {
        return matchesOperationName(parsed.operationName, r);
      })
      .filter(function (r) {
        return matchesQuery(parsed.query, r);
      })
      .filter(function (r) {
        return matchesVariables(parsed.variables, r.variableConditions);
      });

    if (candidates.length === 0) return null;

    candidates.sort(function (a, b) {
      return b.priority - a.priority;
    });
    return candidates[0];
  }

  /**
   * Deep-merge override into base (used for "override" response mode).
   * - Objects are recursively merged.
   * - Arrays in override replace the base array entirely.
   * - null in override removes the key.
   */
  function deepMerge(base, override) {
    if (override === null) return null;
    if (
      typeof override !== "object" ||
      typeof base !== "object" ||
      base === null ||
      Array.isArray(override) ||
      Array.isArray(base)
    ) {
      return override;
    }

    var result = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        result[key] = base[key];
      }
    }
    for (key in override) {
      if (!Object.prototype.hasOwnProperty.call(override, key)) continue;
      if (override[key] === null) {
        delete result[key];
      } else if (
        typeof override[key] === "object" &&
        !Array.isArray(override[key]) &&
        typeof result[key] === "object" &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  /**
   * Extract operation name from a GraphQL query string when operationName
   * is not provided in the request body.
   */
  function extractOperationNameFromQuery(query) {
    if (!query) return undefined;

    // Named operation
    var namedMatch = query.match(
      /(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/,
    );
    if (namedMatch) return namedMatch[1];

    // Anonymous — first root field after the opening brace
    var braceIdx = query.indexOf("{");
    if (braceIdx !== -1) {
      var afterBrace = query.slice(braceIdx + 1).replace(/^\s+/, "");
      var fieldMatch = afterBrace.match(/^([A-Za-z_]\w*)/);
      if (fieldMatch) return fieldMatch[1];
    }

    return undefined;
  }

  function parseGraphQLBody(body) {
    var parsed;
    if (typeof body === "string") {
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        return { query: body };
      }
    } else {
      parsed = body;
    }

    if (Array.isArray(parsed)) {
      return parsed.map(function (item) {
        return {
          operationName:
            item.operationName || extractOperationNameFromQuery(item.query),
          query: item.query,
          variables: item.variables,
        };
      });
    }

    return {
      operationName:
        parsed.operationName || extractOperationNameFromQuery(parsed.query),
      query: parsed.query,
      variables: parsed.variables,
    };
  }

  // ——— Domain check ———

  function isDomainEnabled() {
    var settings = groeState.settings;
    if (!settings.enabled) return false;

    var hostname = window.location.hostname;
    if (!settings.domains || settings.domains.length === 0) return true;

    var domainSetting = settings.domains.find(function (d) {
      return d.domain === hostname;
    });

    if (domainSetting) return domainSetting.enabled;
    return true;
  }

  // ——— Group check ———

  function isGroupEnabled(groupId) {
    if (!groupId) return true;
    var group = groeState.groups.find(function (g) {
      return g.id === groupId;
    });
    if (!group) return true;
    return group.enabled;
  }

  function getEnabledRules() {
    return groeState.rules.filter(function (r) {
      return r.enabled && isGroupEnabled(r.groupId);
    });
  }

  // ——— Notification helper ———

  function notifyIntercepted(operationName, ruleId) {
    window.postMessage(
      {
        source: "groe-page",
        type: "REQUEST_INTERCEPTED",
        payload: { operationName: operationName, ruleId: ruleId },
      },
      "*",
    );
  }

  // ——— Create a mock Response ———

  function createMockResponse(rule, isBatch, batchResults) {
    var body;
    if (isBatch && batchResults) {
      body = JSON.stringify(batchResults);
    } else {
      body = JSON.stringify(rule.response);
    }

    return new Response(body, {
      status: rule.statusCode || 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json",
        "X-GROE-Mocked": "true",
        "X-GROE-Rule": rule.name || rule.id,
      },
    });
  }

  // ——— Create an overridden Response preserving original metadata ———

  function createOverrideResponse(mergedStr, realResponse) {
    return new Response(mergedStr, {
      status: realResponse.status,
      statusText: realResponse.statusText,
      headers: realResponse.headers,
    });
  }

  // ——— Delay helper ———

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms || 0);
    });
  }

  // ——— Override query rewrite helper ———

  /**
   * Build new fetch arguments that replace the GraphQL query in the request
   * body with the rule's overrideQuery. This lets the backend receive a
   * schema-valid query (without fields that only exist in the override
   * response) while the app's Apollo Client still expects those fields.
   */
  function buildOverrideArgs(input, init, bodyStr, overrideQuery) {
    var bodyObj;
    try {
      bodyObj = JSON.parse(bodyStr);
    } catch (e) {
      return [input, init]; // can't parse — send as-is
    }

    if (Array.isArray(bodyObj)) {
      // For batch requests we don't rewrite individual queries here;
      // that's handled in the batch path.
      return [input, init];
    }

    bodyObj.query = overrideQuery;
    var newBody = JSON.stringify(bodyObj);

    // Clone init and set the new body
    var newInit = Object.assign({}, init, { body: newBody });

    // If input is a Request object, we need to create a new one
    if (typeof input === "object" && input instanceof Request) {
      var newRequest = new Request(input.url, {
        method: input.method,
        headers: input.headers,
        body: newBody,
        mode: input.mode,
        credentials: input.credentials,
        cache: input.cache,
        redirect: input.redirect,
        referrer: input.referrer,
        integrity: input.integrity,
      });
      return [newRequest, undefined];
    }

    return [input, newInit];
  }

  // ——— Fetch Override ———

  var originalFetch = window.fetch;

  window.fetch = function (input, init) {
    if (!isDomainEnabled()) {
      return originalFetch.apply(this, arguments);
    }

    // Only intercept POST requests
    var method = (init && init.method) || "GET";
    if (typeof input === "object" && input instanceof Request) {
      method = input.method || method;
    }
    if (method.toUpperCase() !== "POST") {
      return originalFetch.apply(this, arguments);
    }

    var url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    // Try to read the body
    var bodyContent = init && init.body;
    if (!bodyContent) {
      return originalFetch.apply(this, arguments);
    }

    var bodyStr;
    if (typeof bodyContent === "string") {
      bodyStr = bodyContent;
    } else if (bodyContent instanceof ArrayBuffer) {
      bodyStr = new TextDecoder().decode(bodyContent);
    } else if (bodyContent instanceof Uint8Array) {
      bodyStr = new TextDecoder().decode(bodyContent);
    } else {
      return originalFetch.apply(this, arguments);
    }

    // Capture references before entering async/callback territory
    var fetchThis = this;
    var fetchArgs = arguments;

    try {
      var parsed = parseGraphQLBody(bodyStr);
      var enabledRules = getEnabledRules();

      if (Array.isArray(parsed)) {
        // Batched request
        var anyMatch = false;
        var anyOverride = false;
        var batchMatches = parsed.map(function (op) {
          var match = findMatchingRule(enabledRules, url, op);
          if (match) {
            anyMatch = true;
            if ((match.responseMode || "mock") === "override")
              anyOverride = true;
            notifyIntercepted(op.operationName, match.id);
          }
          return match;
        });

        if (anyMatch) {
          if (anyOverride) {
            // Rewrite batch body if any override rule has overrideQuery
            var batchFetchArgs = fetchArgs;
            var batchFetchThis = fetchThis;
            var anyQueryRewrite = batchMatches.some(function (m) {
              return m && m.overrideQuery;
            });
            if (anyQueryRewrite) {
              try {
                var batchBody = JSON.parse(bodyStr);
                if (Array.isArray(batchBody)) {
                  batchBody.forEach(function (item, i) {
                    var m = batchMatches[i];
                    if (m && m.overrideQuery) {
                      item.query = m.overrideQuery;
                    }
                  });
                  var newInit = Object.assign({}, init, {
                    body: JSON.stringify(batchBody),
                  });
                  if (typeof input === "object" && input instanceof Request) {
                    var newReq = new Request(input.url, {
                      method: input.method,
                      headers: input.headers,
                      body: newInit.body,
                      mode: input.mode,
                      credentials: input.credentials,
                      cache: input.cache,
                      redirect: input.redirect,
                      referrer: input.referrer,
                      integrity: input.integrity,
                    });
                    batchFetchArgs = [newReq];
                  } else {
                    batchFetchArgs = [input, newInit];
                  }
                  batchFetchThis = undefined;
                }
              } catch (e) {
                // parse failed — send original
              }
            }
            return originalFetch
              .apply(batchFetchThis, batchFetchArgs)
              .then(function (realResponse) {
                return realResponse.text().then(function (text) {
                  var realBatch;
                  try {
                    realBatch = JSON.parse(text);
                  } catch (e) {
                    realBatch = [];
                  }
                  if (!Array.isArray(realBatch)) realBatch = [realBatch];

                  var mergedBatch = parsed.map(function (op, i) {
                    var match = batchMatches[i];
                    var realItem = realBatch[i] || { data: null };
                    if (!match) return realItem;
                    var mode = match.responseMode || "mock";
                    if (mode === "override") {
                      return deepMerge(realItem, match.response);
                    }
                    return match.response;
                  });

                  return createOverrideResponse(
                    JSON.stringify(mergedBatch),
                    realResponse,
                  );
                });
              });
          }

          // All matched rules are mock mode
          var batchResults = parsed.map(function (op, i) {
            return batchMatches[i] ? batchMatches[i].response : null;
          });
          var maxDelay = 0;
          parsed.forEach(function (op, i) {
            var match = batchMatches[i];
            if (match && match.delay) {
              maxDelay = Math.max(maxDelay, match.delay);
            }
            if (!batchResults[i]) {
              batchResults[i] = {
                data: null,
                errors: [
                  {
                    message:
                      "Not mocked - passthrough unavailable in batch mode",
                  },
                ],
              };
            }
          });

          var firstMatch = batchMatches.find(function (m) {
            return m;
          });

          return delay(maxDelay).then(function () {
            return createMockResponse(
              firstMatch || { statusCode: 200, response: {}, name: "batch" },
              true,
              batchResults,
            );
          });
        }
      } else {
        // Single request
        var match = findMatchingRule(enabledRules, url, parsed);
        if (match) {
          var mode = match.responseMode || "mock";
          console.log(
            "[GROE] Intercepted:",
            parsed.operationName,
            "| mode:",
            mode,
            "| rule:",
            match.name,
            match.overrideQuery ? "| query rewritten" : "",
          );
          notifyIntercepted(parsed.operationName, match.id);

          if (mode === "override") {
            // Override mode: let the request go through, then deep-merge
            // If the rule has an overrideQuery, rewrite the outgoing query
            // so that new fields (not yet in the backend schema) don't
            // cause a server error.
            var overrideFetchArgs = fetchArgs;
            var overrideFetchThis = fetchThis;
            if (match.overrideQuery) {
              var rewritten = buildOverrideArgs(
                input,
                init,
                bodyStr,
                match.overrideQuery,
              );
              // rewritten is [newInput, newInit]
              overrideFetchArgs = rewritten;
              overrideFetchThis = undefined; // use default this
            }
            return originalFetch
              .apply(overrideFetchThis, overrideFetchArgs)
              .then(function (realResponse) {
                return realResponse
                  .clone()
                  .text()
                  .then(function (text) {
                    var realBody;
                    try {
                      realBody = JSON.parse(text);
                    } catch (e) {
                      realBody = {};
                    }
                    var merged = deepMerge(realBody, match.response);
                    var mergedStr = JSON.stringify(merged);
                    console.log(
                      "[GROE] Override applied for:",
                      parsed.operationName,
                    );
                    return createOverrideResponse(mergedStr, realResponse);
                  });
              })
              .catch(function (err) {
                console.error("[GROE] Override fetch failed:", err);
                return originalFetch.apply(fetchThis, fetchArgs);
              });
          }

          // Mock mode (default): block and return fake data
          return delay(match.delay || 0).then(function () {
            return createMockResponse(match, false);
          });
        }
      }
    } catch (e) {
      console.error("[GROE] Error in fetch interceptor:", e);
    }

    return originalFetch.apply(this, arguments);
  };

  // ——— XMLHttpRequest Override ———

  var OriginalXHR = window.XMLHttpRequest;
  var XHRProto = OriginalXHR.prototype;

  var originalOpen = XHRProto.open;
  var originalSend = XHRProto.send;
  var originalSetRequestHeader = XHRProto.setRequestHeader;

  XHRProto.open = function (method, url, async, user, password) {
    this._groeMethod = method;
    this._groeUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XHRProto.send = function (body) {
    var self = this;

    if (!isDomainEnabled()) {
      return originalSend.apply(this, arguments);
    }

    if (!this._groeMethod || this._groeMethod.toUpperCase() !== "POST") {
      return originalSend.apply(this, arguments);
    }

    if (!body || typeof body !== "string") {
      return originalSend.apply(this, arguments);
    }

    try {
      var parsed = parseGraphQLBody(body);
      var enabledRules = getEnabledRules();

      if (!Array.isArray(parsed)) {
        var match = findMatchingRule(enabledRules, this._groeUrl, parsed);
        if (match) {
          var mode = match.responseMode || "mock";
          notifyIntercepted(parsed.operationName, match.id);

          if (mode === "override") {
            // Override mode for XHR: intercept response via getters
            var xhrMerged = false;
            var mergedResponseText = null;

            // If overrideQuery is set, rewrite the outgoing body
            var xhrSendBody = body;
            if (match.overrideQuery) {
              try {
                var bodyObj = JSON.parse(body);
                bodyObj.query = match.overrideQuery;
                xhrSendBody = JSON.stringify(bodyObj);
              } catch (e) {
                // parse failed — send original body
              }
            }

            var origResponseTextDesc = Object.getOwnPropertyDescriptor(
              XMLHttpRequest.prototype,
              "responseText",
            );
            var origResponseDesc = Object.getOwnPropertyDescriptor(
              XMLHttpRequest.prototype,
              "response",
            );

            function doMerge() {
              if (xhrMerged) return mergedResponseText;
              xhrMerged = true;
              try {
                var realText = origResponseTextDesc
                  ? origResponseTextDesc.get.call(self)
                  : self.responseText;
                var realBody;
                try {
                  realBody = JSON.parse(realText);
                } catch (e) {
                  realBody = {};
                }
                var merged = deepMerge(realBody, match.response);
                mergedResponseText = JSON.stringify(merged);
              } catch (e) {
                console.error("[GROE] XHR override merge error:", e);
                mergedResponseText = origResponseTextDesc
                  ? origResponseTextDesc.get.call(self)
                  : "";
              }
              return mergedResponseText;
            }

            Object.defineProperty(self, "responseText", {
              get: function () {
                if (self.readyState === 4) return doMerge();
                return origResponseTextDesc
                  ? origResponseTextDesc.get.call(self)
                  : "";
              },
              configurable: true,
            });

            Object.defineProperty(self, "response", {
              get: function () {
                if (self.readyState === 4) return doMerge();
                return origResponseDesc ? origResponseDesc.get.call(self) : "";
              },
              configurable: true,
            });

            return originalSend.call(self, xhrSendBody);
          }

          // Mock mode: block entirely
          var responseBody = JSON.stringify(match.response);

          setTimeout(function () {
            Object.defineProperty(self, "readyState", { writable: true });
            Object.defineProperty(self, "status", { writable: true });
            Object.defineProperty(self, "statusText", { writable: true });
            Object.defineProperty(self, "responseText", { writable: true });
            Object.defineProperty(self, "response", { writable: true });

            self.readyState = 4;
            self.status = match.statusCode || 200;
            self.statusText = "OK";
            self.responseText = responseBody;
            self.response = responseBody;

            self.getAllResponseHeaders = function () {
              return "content-type: application/json\r\nx-groe-mocked: true\r\n";
            };
            self.getResponseHeader = function (name) {
              var headers = {
                "content-type": "application/json",
                "x-groe-mocked": "true",
                "x-groe-rule": match.name || match.id,
              };
              return headers[name.toLowerCase()] || null;
            };

            if (typeof self.onreadystatechange === "function") {
              self.onreadystatechange(new Event("readystatechange"));
            }
            self.dispatchEvent(new Event("readystatechange"));

            if (typeof self.onload === "function") {
              self.onload(new ProgressEvent("load"));
            }
            self.dispatchEvent(new ProgressEvent("load"));

            if (typeof self.onloadend === "function") {
              self.onloadend(new ProgressEvent("loadend"));
            }
            self.dispatchEvent(new ProgressEvent("loadend"));
          }, match.delay || 0);

          return;
        }
      }
    } catch (e) {
      console.error("[GROE] Error in XHR interceptor:", e);
    }

    return originalSend.apply(this, arguments);
  };

  // ——— Message Listener ———

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "groe-content") return;

    var type = event.data.type;
    var payload = event.data.payload;

    switch (type) {
      case "INIT_STATE":
        groeState.settings = payload.settings || groeState.settings;
        groeState.rules = payload.rules || groeState.rules;
        groeState.groups = payload.groups || groeState.groups;
        console.log("[GROE] Initialized with", groeState.rules.length, "rules");
        break;

      case "SETTINGS_CHANGED":
        if (payload) {
          groeState.settings = payload;
        }
        break;

      case "RULES_CHANGED":
        if (Array.isArray(payload)) {
          groeState.rules = payload;
        }
        break;
    }
  });

  console.log("[GROE] GraphQL Request Override Extension interceptor loaded");
})();
