import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { Rule, RuleGroup } from "../../shared/types";

interface RuleCardProps {
  rule: Rule;
  groups: RuleGroup[];
  onEdit: (rule: Rule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onDuplicate: (rule: Rule) => void;
}

const RuleCard: React.FC<RuleCardProps> = ({
  rule,
  groups,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
}) => {
  const group = groups.find((g) => g.id === rule.groupId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (!confirmDelete) return;
    // Position the popover below the delete button
    if (deleteBtnRef.current) {
      const rect = deleteBtnRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + 6,
        left: rect.right,
      });
    }
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        deleteBtnRef.current &&
        !deleteBtnRef.current.contains(e.target as Node)
      ) {
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [confirmDelete]);

  return (
    <div className={`rule-card ${!rule.enabled ? "disabled" : ""}`}>
      <div className="rule-card-header">
        <span className="rule-card-title">{rule.name}</span>
        <div className="rule-card-actions">
          <label
            className="toggle-switch-sm"
            data-tooltip={rule.enabled ? "Disable rule" : "Enable rule"}
          >
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={() => onToggle(rule.id)}
            />
            <span className="toggle-slider-sm" />
          </label>
          <button
            className="btn-icon"
            data-tooltip="Edit rule"
            onClick={() => onEdit(rule)}
          >
            {"\u270E"}
          </button>
          <button
            className="btn-icon"
            data-tooltip="Duplicate rule"
            onClick={() => onDuplicate(rule)}
          >
            {"\u2398"}
          </button>
          <button
            ref={deleteBtnRef}
            className="btn-icon"
            data-tooltip="Delete rule"
            onClick={() => setConfirmDelete(true)}
          >
            {"\u2715"}
          </button>
        </div>
      </div>
      {confirmDelete &&
        ReactDOM.createPortal(
          <div
            className="confirm-delete-popover"
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              transform: "translateX(-100%)",
            }}
          >
            <p>Delete &ldquo;{rule.name}&rdquo;?</p>
            <div className="confirm-actions">
              <button
                className="btn btn-sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(rule.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>,
          document.body,
        )}
      <div className="rule-card-meta">
        {rule.endpoint && (
          <span className="rule-meta-tag endpoint">{rule.endpoint}</span>
        )}
        {rule.operationName && (
          <span className="rule-meta-tag operation">
            {rule.operationMatchType === "regex" ? "/" : ""}
            {rule.operationName}
            {rule.operationMatchType === "regex" ? "/" : ""}
          </span>
        )}
        <span
          className={`rule-meta-tag status ${rule.statusCode >= 400 ? "error" : ""}`}
        >
          {rule.statusCode}
        </span>
        {rule.responseMode === "override" && (
          <span className="rule-meta-tag override">Override</span>
        )}
        {rule.priority > 0 && (
          <span className="rule-meta-tag priority">P{rule.priority}</span>
        )}
        {(rule.delay ?? 0) > 0 && (
          <span className="rule-meta-tag default">{rule.delay}ms delay</span>
        )}
        {rule.variableConditions.length > 0 && (
          <span className="rule-meta-tag default">
            {rule.variableConditions.length} condition
            {rule.variableConditions.length > 1 ? "s" : ""}
          </span>
        )}
        {group && <span className="rule-meta-tag group-tag">{group.name}</span>}
      </div>
    </div>
  );
};

export default RuleCard;
