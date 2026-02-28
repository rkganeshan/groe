import React, { useState, useRef } from "react";
import { Rule, RuleGroup } from "../../shared/types";
import ConfirmPopover from "./ConfirmPopover";
import Tooltip from "./Tooltip";

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
  const deleteBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={`rule-card ${!rule.enabled ? "disabled" : ""}`}>
      <div className="rule-card-header">
        <span className="rule-card-title">{rule.name}</span>
        <div className="rule-card-actions">
          <Tooltip content={rule.enabled ? "Disable rule" : "Enable rule"}>
            <label className="toggle-switch-sm">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={() => onToggle(rule.id)}
              />
              <span className="toggle-slider-sm" />
            </label>
          </Tooltip>
          <Tooltip content="Edit rule">
            <button
              className="btn-icon"
              onClick={() => onEdit(rule)}
            >
              {"\u270E"}
            </button>
          </Tooltip>
          <Tooltip content="Duplicate rule">
            <button
              className="btn-icon"
              onClick={() => onDuplicate(rule)}
            >
              {"\u2398"}
            </button>
          </Tooltip>
          <Tooltip content="Delete rule">
            <button
              ref={deleteBtnRef}
              className="btn-icon"
              onClick={() => setConfirmDelete(true)}
            >
              {"\u2715"}
            </button>
          </Tooltip>
        </div>
      </div>
      <ConfirmPopover
        isOpen={confirmDelete}
        anchorRef={deleteBtnRef}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(rule.id);
        }}
        message={<>Delete &ldquo;{rule.name}&rdquo;?</>}
      />
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
