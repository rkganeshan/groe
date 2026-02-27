import React, { useState, useEffect } from "react";
import {
  Rule,
  RuleGroup,
  VariableCondition,
  ConditionOperator,
  ResponseMode,
  createDefaultRule,
} from "../../shared/types";

interface RuleEditorProps {
  rule: Rule | null;
  groups: RuleGroup[];
  onSave: (rule: Rule) => void;
  onCancel: () => void;
}

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "regex", label: "Regex" },
  { value: "exists", label: "Exists" },
  { value: "not_exists", label: "Not Exists" },
  { value: "json_path", label: "JSON Path" },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const RuleEditor: React.FC<RuleEditorProps> = ({
  rule,
  groups,
  onSave,
  onCancel,
}) => {
  const isNew = !rule;
  const [form, setForm] = useState<Rule>(() => {
    if (rule) return { ...rule };
    return createDefaultRule({ id: generateId() });
  });
  const [responseText, setResponseText] = useState("");
  const [responseError, setResponseError] = useState("");

  useEffect(() => {
    setResponseText(JSON.stringify(form.response, null, 2));
  }, []);

  function updateField<K extends keyof Rule>(key: K, value: Rule[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addCondition() {
    setForm((prev) => ({
      ...prev,
      variableConditions: [
        ...prev.variableConditions,
        { field: "", operator: "equals" as ConditionOperator, value: "" },
      ],
    }));
  }

  function updateCondition(idx: number, partial: Partial<VariableCondition>) {
    setForm((prev) => {
      const updated = [...prev.variableConditions];
      updated[idx] = { ...updated[idx], ...partial };
      return { ...prev, variableConditions: updated };
    });
  }

  function removeCondition(idx: number) {
    setForm((prev) => ({
      ...prev,
      variableConditions: prev.variableConditions.filter((_, i) => i !== idx),
    }));
  }

  function handleResponseChange(text: string) {
    setResponseText(text);
    try {
      const parsed = JSON.parse(text);
      setForm((prev) => ({ ...prev, response: parsed }));
      setResponseError("");
    } catch {
      setResponseError("Invalid JSON");
    }
  }

  function handleSave() {
    if (responseError) return;
    if (!form.name.trim()) return;
    onSave({
      ...form,
      updatedAt: Date.now(),
      createdAt: form.createdAt || Date.now(),
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? "Create Rule" : "Edit Rule"}</h2>
          <button className="btn-icon" data-tooltip="Close" onClick={onCancel}>
            {"\u2715"}
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Rule Name</label>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g. Mock GetUser"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Group</label>
              <select
                className="form-select"
                value={form.groupId || ""}
                onChange={(e) =>
                  updateField("groupId", e.target.value || undefined)
                }
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Endpoint Pattern</label>
            <span className="form-sublabel">
              Matches if the request URL contains this string
            </span>
            <input
              className="form-input"
              value={form.endpoint}
              onChange={(e) => updateField("endpoint", e.target.value)}
              placeholder="/graphql"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Operation Name</label>
              <input
                className="form-input"
                value={form.operationName || ""}
                onChange={(e) => updateField("operationName", e.target.value)}
                placeholder="GetUser"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Match Type</label>
              <select
                className="form-select"
                value={form.operationMatchType}
                onChange={(e) =>
                  updateField(
                    "operationMatchType",
                    e.target.value as "exact" | "regex",
                  )
                }
              >
                <option value="exact">Exact</option>
                <option value="regex">Regex</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Query Regex</label>
            <span className="form-sublabel">
              Optional regex to match against the query body
            </span>
            <input
              className="form-input"
              value={form.queryRegex || ""}
              onChange={(e) => updateField("queryRegex", e.target.value)}
              placeholder="mutation\\s+CreateUser"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Status Code</label>
              <input
                className="form-input"
                type="number"
                value={form.statusCode}
                onChange={(e) =>
                  updateField("statusCode", parseInt(e.target.value, 10) || 200)
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <span className="form-sublabel">Higher = matched first</span>
              <input
                className="form-input"
                type="number"
                value={form.priority}
                onChange={(e) =>
                  updateField("priority", parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Delay (ms)</label>
              <input
                className="form-input"
                type="number"
                value={form.delay || 0}
                onChange={(e) =>
                  updateField("delay", parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Variable Conditions
              <button
                className="btn btn-sm"
                style={{ marginLeft: 12 }}
                onClick={addCondition}
              >
                + Add
              </button>
            </label>
            <div className="conditions-list">
              {form.variableConditions.map((cond, idx) => (
                <div key={idx} className="condition-row">
                  <input
                    className="form-input"
                    placeholder="field.path"
                    value={cond.field}
                    onChange={(e) =>
                      updateCondition(idx, { field: e.target.value })
                    }
                  />
                  <select
                    className="form-select"
                    value={cond.operator}
                    onChange={(e) =>
                      updateCondition(idx, {
                        operator: e.target.value as ConditionOperator,
                      })
                    }
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="form-input"
                    placeholder="value"
                    value={cond.value}
                    onChange={(e) =>
                      updateCondition(idx, { value: e.target.value })
                    }
                  />
                  <button
                    className="btn-icon"
                    data-tooltip="Remove condition"
                    onClick={() => removeCondition(idx)}
                  >
                    {"\u2715"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Response Mode</label>
            <span className="form-sublabel">
              {(form.responseMode || "mock") === "mock"
                ? "Block the request and return the JSON below as the full response"
                : "Let the request go to the backend, then deep-merge the JSON below into the real response"}
            </span>
            <div className="response-mode-toggle">
              <button
                type="button"
                className={`mode-btn ${(form.responseMode || "mock") === "mock" ? "active" : ""}`}
                onClick={() => updateField("responseMode", "mock")}
              >
                Mock
              </button>
              <button
                type="button"
                className={`mode-btn ${form.responseMode === "override" ? "active" : ""}`}
                onClick={() => updateField("responseMode", "override")}
              >
                Override
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              {(form.responseMode || "mock") === "mock"
                ? "Mock Response Body (JSON)"
                : "Override Patch (JSON — merged into real response)"}
            </label>
            {form.responseMode === "override" && (
              <span className="form-sublabel">
                Only include the keys you want to add or change. Use null to
                remove a key. Nested objects are deep-merged.
              </span>
            )}
            <textarea
              className={`form-textarea ${responseError ? "error" : ""}`}
              value={responseText}
              onChange={(e) => handleResponseChange(e.target.value)}
              spellCheck={false}
            />
            {responseError && <div className="form-error">{responseError}</div>}
          </div>

          {form.responseMode === "override" && (
            <div className="form-group">
              <label className="form-label">Override Query (optional)</label>
              <span className="form-sublabel">
                If your app&apos;s GraphQL query includes new fields that
                don&apos;t exist on the backend yet, paste a clean version of
                the query here (without those fields). GROE will send this query
                to the backend instead, then merge your override response on
                top. Leave empty to forward the original query as-is.
              </span>
              <textarea
                className="form-textarea"
                style={{ minHeight: 100 }}
                value={form.overrideQuery || ""}
                onChange={(e) =>
                  updateField("overrideQuery", e.target.value || undefined)
                }
                placeholder={`query GetAssetCPUDetailsV2($input: AssetCPUDetailsInput!) {\n  getAssetCPUDetailsV2(input: $input) {\n    cpuName\n    cpuSpeed\n    ...\n  }\n}`}
                spellCheck={false}
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!!responseError || !form.name.trim()}
          >
            {isNew ? "Create Rule" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RuleEditor;
