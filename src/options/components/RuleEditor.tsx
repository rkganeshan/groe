import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Rule,
  RuleGroup,
  VariableCondition,
  ConditionOperator,
  ResponseMode,
  createDefaultRule,
} from "../../shared/types";
import Tooltip from "./Tooltip";
import CodeEditor from "./CodeEditor";
import Modal from "./Modal";

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

const VALID_OPERATORS = new Set(OPERATORS.map((o) => o.value));

/** Expand stringified JSON in value for readable display in the editor */
function expandConditionsForDisplay(
  conditions: VariableCondition[],
): Array<{ field: string; operator: string; value: unknown }> {
  return conditions.map((c) => {
    let val: unknown = c.value;
    if (typeof c.value === "string" && c.value.trim().length > 0) {
      const trimmed = c.value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(c.value);
          if (typeof parsed === "object" && parsed !== null) {
            val = parsed;
          }
        } catch {
          // Keep as string if parse fails
        }
      }
    }
    return { field: c.field, operator: c.operator, value: val };
  });
}

/** Collapse object/array values back to string for storage */
function collapseValueForStorage(val: unknown): string {
  if (typeof val === "string") return val;
  if (val !== null && typeof val === "object") return JSON.stringify(val);
  return String(val ?? "");
}

function parseConditionsJson(
  text: string,
): { conditions: VariableCondition[] } | { error: string } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { error: "Must be a JSON array" };
    }
    const conditions: VariableCondition[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== "object") {
        return { error: `Item ${i + 1}: must be an object` };
      }
      const field = typeof item.field === "string" ? item.field : "";
      const operator = VALID_OPERATORS.has(item.operator)
        ? item.operator
        : "equals";
      const value = collapseValueForStorage(item.value);
      conditions.push({ field, operator, value });
    }
    return { conditions };
  } catch (e) {
    return { error: "Invalid JSON" };
  }
}

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
  const [conditionsViewMode, setConditionsViewMode] = useState<"list" | "json">(
    "list",
  );
  const [conditionsJson, setConditionsJson] = useState(() =>
    JSON.stringify(
      expandConditionsForDisplay(
        rule?.variableConditions ?? createDefaultRule().variableConditions,
      ),
      null,
      2,
    ),
  );
  const [conditionsJsonError, setConditionsJsonError] = useState<string | null>(
    null,
  );
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  const MIN_PANEL_WIDTH = 300;

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!layoutRef.current || !isResizing) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = (x / rect.width) * 100;
      const minPercent = (MIN_PANEL_WIDTH / rect.width) * 100;
      const maxPercent = 100 - minPercent;
      setLeftPanelWidth(Math.min(Math.max(percent, minPercent), maxPercent));
    },
    [isResizing],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeEnd);
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    setResponseText(JSON.stringify(form.response, null, 2));
  }, []);

  useEffect(() => {
    if (!conditionsJsonError) {
      setConditionsJson(
        JSON.stringify(
          expandConditionsForDisplay(form.variableConditions),
          null,
          2,
        ),
      );
    }
  }, [form.variableConditions, conditionsJsonError]);

  function updateField<K extends keyof Rule>(key: K, value: Rule[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addCondition() {
    setConditionsJsonError(null);
    setForm((prev) => ({
      ...prev,
      variableConditions: [
        ...prev.variableConditions,
        { field: "", operator: "equals" as ConditionOperator, value: "" },
      ],
    }));
  }

  function updateCondition(idx: number, partial: Partial<VariableCondition>) {
    setConditionsJsonError(null);
    setForm((prev) => {
      const updated = [...prev.variableConditions];
      updated[idx] = { ...updated[idx], ...partial };
      return { ...prev, variableConditions: updated };
    });
  }

  function removeCondition(idx: number) {
    setConditionsJsonError(null);
    setForm((prev) => ({
      ...prev,
      variableConditions: prev.variableConditions.filter((_, i) => i !== idx),
    }));
  }

  function handleConditionsJsonChange(text: string) {
    setConditionsJson(text);
    const result = parseConditionsJson(text);
    if ("error" in result) {
      setConditionsJsonError(result.error);
    } else {
      setConditionsJsonError(null);
      setForm((prev) => ({ ...prev, variableConditions: result.conditions }));
    }
  }

  function switchToJsonMode() {
    setConditionsJson(
      JSON.stringify(
        expandConditionsForDisplay(form.variableConditions),
        null,
        2,
      ),
    );
    setConditionsJsonError(null);
    setConditionsViewMode("json");
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
    if (responseError || conditionsJsonError) return;
    if (!form.name.trim()) return;
    onSave({
      ...form,
      updatedAt: Date.now(),
      createdAt: form.createdAt || Date.now(),
    });
  }

  const initialFormRef = useRef<Rule | null>(null);
  if (initialFormRef.current === null) {
    initialFormRef.current = rule
      ? { ...rule }
      : createDefaultRule({ id: form.id || generateId() });
  }

  function isDirty(): boolean {
    const initial = initialFormRef.current;
    if (!initial) return false;
    const a = { ...form, updatedAt: 0, createdAt: 0 };
    const b = { ...initial, updatedAt: 0, createdAt: 0 };
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  function handleClose() {
    if (isDirty()) {
      if (
        window.confirm("You have unsaved changes. Discard changes and close?")
      ) {
        onCancel();
      }
    } else {
      onCancel();
    }
  }

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSaveRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Modal
      title={isNew ? "Create Rule" : "Edit Rule"}
      className="rule-editor-modal"
      onClose={handleClose}
      footer={
        <>
          <button className="btn" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={
              !!responseError || !!conditionsJsonError || !form.name.trim()
            }
          >
            {isNew ? "Create Rule" : "Save Changes"}
          </button>
        </>
      }
    >
      <div
        ref={layoutRef}
        className="rule-editor-layout"
        data-resizing={isResizing || undefined}
      >
        {/* ——— Left: Form Fields ——— */}
        <div
          className="rule-editor-form"
          style={{
            flex: `0 0 ${leftPanelWidth}%`,
            minWidth: MIN_PANEL_WIDTH,
          }}
        >
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
            <label className="form-label">Variable Conditions</label>
            <div className="conditions-view-toggle">
              <label className="conditions-radio">
                <input
                  type="radio"
                  name="conditionsView"
                  checked={conditionsViewMode === "list"}
                  onChange={() => setConditionsViewMode("list")}
                />
                <span>List</span>
              </label>
              <label className="conditions-radio">
                <input
                  type="radio"
                  name="conditionsView"
                  checked={conditionsViewMode === "json"}
                  onChange={switchToJsonMode}
                />
                <span>JSON</span>
              </label>
            </div>
            {conditionsViewMode === "list" ? (
              <>
                <div className="conditions-list-header">
                  <span className="form-sublabel">
                    Add conditions to match request variables
                  </span>
                  <button className="btn btn-sm" onClick={addCondition}>
                    + Add
                  </button>
                </div>
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
                      <Tooltip content="Remove condition">
                        <button
                          className="btn-icon"
                          onClick={() => removeCondition(idx)}
                        >
                          {"\u2715"}
                        </button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="form-sublabel">
                  Array of {"{ field, operator, value }"} objects
                </span>
                <CodeEditor
                  language="json"
                  value={conditionsJson}
                  onChange={handleConditionsJsonChange}
                  height={220}
                />
                {conditionsJsonError && (
                  <div className="form-error">{conditionsJsonError}</div>
                )}
              </>
            )}
          </div>
        </div>

        <div
          className="rule-editor-resize-handle"
          onMouseDown={() => setIsResizing(true)}
          aria-label="Resize panels"
        />

        {/* ——— Right: Response Config + JSON Editor ——— */}
        <div
          className="rule-editor-json"
          style={{
            flex: "1 1 0",
            minWidth: MIN_PANEL_WIDTH,
          }}
        >
          {/* <div className="form-group">
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
          </div> */}

          <label className="form-label">Mock Response Body (JSON)</label>
          {/* {form.responseMode === "override" && (
            <span className="form-sublabel">
              Only include the keys you want to add or change. Use null to
              remove a key. Nested objects are deep-merged.
            </span>
          )} */}
          <CodeEditor
            language="json"
            value={responseText}
            onChange={handleResponseChange}
            flex
          />
          {responseError && <div className="form-error">{responseError}</div>}

          {form.responseMode === "override" && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Override Query (optional)</label>
              <span className="form-sublabel">
                If your app&apos;s GraphQL query includes new fields that
                don&apos;t exist on the backend yet, paste a clean version of
                the query here (without those fields). GROE will send this query
                to the backend instead, then merge your override response on
                top. Leave empty to forward the original query as-is.
              </span>
              <CodeEditor
                language="plaintext"
                value={form.overrideQuery || ""}
                onChange={(val) =>
                  updateField("overrideQuery", val || undefined)
                }
                height={120}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RuleEditor;
