import React, { useState, useRef } from "react";
import { RuleGroup } from "../../shared/types";
import ConfirmPopover from "./ConfirmPopover";
import Tooltip from "./Tooltip";

interface SidebarProps {
  groups: RuleGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  onAddGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onToggleGroup: (id: string) => void;
  totalRuleCount: number;
  groupRuleCounts: Record<string, number>;
  ungroupedCount: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  groups,
  selectedGroupId,
  onSelectGroup,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleGroup,
  totalRuleCount,
  groupRuleCounts,
  ungroupedCount,
}) => {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleAdd() {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddGroup(trimmed);
      setNewName("");
      setAdding(false);
    }
  }

  function startRename(g: RuleGroup) {
    setEditingId(g.id);
    setEditName(g.name);
  }

  function handleRename() {
    if (editingId && editName.trim()) {
      onRenameGroup(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-title">Views</div>
        <div
          className={`sidebar-item ${selectedGroupId === null ? "active" : ""}`}
          onClick={() => onSelectGroup(null)}
        >
          <span>All Rules</span>
          <span className="count">{totalRuleCount}</span>
        </div>
        <div
          className={`sidebar-item ${selectedGroupId === "__ungrouped" ? "active" : ""}`}
          onClick={() => onSelectGroup("__ungrouped")}
        >
          <span>Ungrouped</span>
          <span className="count">{ungroupedCount}</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Groups</div>
        {groups.map((g) => (
          <div key={g.id}>
            {editingId === g.id ? (
              <div className="group-edit-inline">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename()}
                  onBlur={handleRename}
                  autoFocus
                />
              </div>
            ) : (
              <div
                className={`sidebar-item ${selectedGroupId === g.id ? "active" : ""}`}
                onClick={() => onSelectGroup(g.id)}
              >
                <span style={{ opacity: g.enabled ? 1 : 0.4 }}>{g.name}</span>
                <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                  <span className="count">{groupRuleCounts[g.id] || 0}</span>
                  <Tooltip content={g.enabled ? "Disable group" : "Enable group"}>
                    <button
                      className="btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroup(g.id);
                      }}
                    >
                      {g.enabled ? "\u25CF" : "\u25CB"}
                    </button>
                  </Tooltip>
                  <Tooltip content="Rename group">
                    <button
                      className="btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(g);
                      }}
                    >
                      {"\u270E"}
                    </button>
                  </Tooltip>
                  <div
                    style={{ position: "relative", display: "inline-block" }}
                  >
                    <Tooltip content="Delete group">
                      <button
                        className="btn-icon"
                        ref={(el) => (deleteBtnRefs.current[g.id] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(g.id);
                        }}
                      >
                        {"\u2715"}
                      </button>
                    </Tooltip>
                    {confirmDeleteId === g.id && deleteBtnRefs.current[g.id] && (
                      <ConfirmPopover
                        isOpen={true}
                        anchorRef={{ current: deleteBtnRefs.current[g.id] as HTMLElement }}
                        onClose={() => setConfirmDeleteId(null)}
                        onConfirm={() => {
                          setConfirmDeleteId(null);
                          onDeleteGroup(g.id);
                        }}
                        message={<>Delete &ldquo;{g.name}&rdquo;?</>}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {adding ? (
          <div className="group-edit-inline">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              onBlur={() => {
                if (!newName.trim()) setAdding(false);
                else handleAdd();
              }}
              placeholder="Group name…"
              autoFocus
            />
          </div>
        ) : (
          <button
            className="btn btn-sm"
            style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
            onClick={() => setAdding(true)}
          >
            + New Group
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
