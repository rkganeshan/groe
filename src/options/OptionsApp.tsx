import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Rule,
  RuleGroup,
  ExtensionMessage,
  ExportData,
  createDefaultRule,
} from "../shared/types";
import Sidebar from "./components/Sidebar";
import RuleCard from "./components/RuleCard";
import RuleEditor from "./components/RuleEditor";
import Toast from "./components/Toast";

function sendMessage(msg: ExtensionMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(response);
    });
  });
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const OptionsApp: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [groups, setGroups] = useState<RuleGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingRule, setEditingRule] = useState<Rule | null | undefined>(
    undefined,
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        sendMessage({ type: "GET_RULES" }),
        sendMessage({ type: "GET_GROUPS" }),
      ]);
      setRules(r as Rule[]);
      setGroups(g as RuleGroup[]);
    } catch (err) {
      console.error("[GROE] Failed to load data:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  // ——— Rule CRUD ———

  async function handleSaveRule(rule: Rule) {
    try {
      const existing = rules.find((r) => r.id === rule.id);
      if (existing) {
        await sendMessage({ type: "UPDATE_RULE", payload: rule });
        showToast("Rule updated");
      } else {
        await sendMessage({ type: "ADD_RULE", payload: rule });
        showToast("Rule created");
      }
      setEditingRule(undefined);
      await loadData();
    } catch {
      showToast("Failed to save rule", "error");
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await sendMessage({ type: "DELETE_RULE", payload: id });
      showToast("Rule deleted");
      await loadData();
    } catch {
      showToast("Failed to delete rule", "error");
    }
  }

  async function handleToggleRule(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      await sendMessage({
        type: "UPDATE_RULE",
        payload: { ...rule, enabled: !rule.enabled },
      });
      await loadData();
    }
  }

  function handleDuplicateRule(rule: Rule) {
    const dup = createDefaultRule({
      ...rule,
      id: generateId(),
      name: rule.name + " (copy)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setEditingRule(dup);
  }

  // ——— Group CRUD ———

  async function handleAddGroup(name: string) {
    const group: RuleGroup = {
      id: generateId(),
      name,
      enabled: true,
      createdAt: Date.now(),
    };
    await sendMessage({ type: "ADD_GROUP", payload: group });
    showToast("Group created");
    await loadData();
  }

  async function handleRenameGroup(id: string, name: string) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      await sendMessage({ type: "UPDATE_GROUP", payload: { ...group, name } });
      await loadData();
    }
  }

  async function handleDeleteGroup(id: string) {
    await sendMessage({ type: "DELETE_GROUP", payload: id });
    if (selectedGroupId === id) setSelectedGroupId(null);
    showToast("Group deleted");
    await loadData();
  }

  async function handleToggleGroup(id: string) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      await sendMessage({
        type: "UPDATE_GROUP",
        payload: { ...group, enabled: !group.enabled },
      });
      await loadData();
    }
  }

  // ——— Import / Export ———

  async function handleExport() {
    try {
      const data = (await sendMessage({ type: "EXPORT_RULES" })) as ExportData;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `groe-rules-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Rules exported");
    } catch {
      showToast("Export failed", "error");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;
      await sendMessage({ type: "IMPORT_RULES", payload: data });
      showToast(`Imported ${data.rules.length} rules`);
      await loadData();
    } catch {
      showToast("Invalid import file", "error");
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  // ——— Filtered rules ———

  const filteredRules = rules.filter((r) => {
    if (selectedGroupId === "__ungrouped") {
      if (r.groupId) return false;
    } else if (selectedGroupId) {
      if (r.groupId !== selectedGroupId) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.operationName || "").toLowerCase().includes(q) ||
        r.endpoint.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const groupRuleCounts: Record<string, number> = {};
  let ungroupedCount = 0;
  rules.forEach((r) => {
    if (r.groupId) {
      groupRuleCounts[r.groupId] = (groupRuleCounts[r.groupId] || 0) + 1;
    } else {
      ungroupedCount++;
    }
  });

  return (
    <div className="options-container">
      <header className="options-header">
        <div className="options-header-left">
          <img src="../icons/icon48.png" alt="GROE" />
          <div className="header-brand">
            <h1>GROE</h1>
            <span className="header-brand-full">
              <b>G</b>raphQL <b>R</b>equest <b>O</b>verride <b>E</b>xtension
            </span>
          </div>
        </div>
        <div className="options-header-actions">
          <button
            className="btn"
            data-tooltip="Export rules as JSON"
            onClick={handleExport}
          >
            Export
          </button>
          <button
            className="btn"
            data-tooltip="Import rules from JSON"
            onClick={() => fileInput.current?.click()}
          >
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleImport}
          />
        </div>
      </header>

      <div className="options-body">
        <Sidebar
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onToggleGroup={handleToggleGroup}
          totalRuleCount={rules.length}
          groupRuleCounts={groupRuleCounts}
          ungroupedCount={ungroupedCount}
        />

        <div className="main-content">
          <div className="toolbar">
            <div className="toolbar-left">
              <input
                className="search-input"
                placeholder={"Search rules\u2026"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="toolbar-right">
              <button
                className="btn btn-primary"
                onClick={() => setEditingRule(null)}
              >
                + New Rule
              </button>
            </div>
          </div>

          {filteredRules.length === 0 ? (
            <div className="empty-state">
              <div className="emoji">{"\u2728"}</div>
              <h3>{search ? "No matching rules" : "No rules yet"}</h3>
              <p>
                {search
                  ? "Try a different search term"
                  : "Create your first mock rule to get started"}
              </p>
              {!search && (
                <button
                  className="btn btn-primary"
                  onClick={() => setEditingRule(null)}
                >
                  + Create Rule
                </button>
              )}
            </div>
          ) : (
            <div className="rule-list">
              {filteredRules.map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  groups={groups}
                  onEdit={(rule) => setEditingRule(rule)}
                  onDelete={handleDeleteRule}
                  onToggle={handleToggleRule}
                  onDuplicate={handleDuplicateRule}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editingRule !== undefined && (
        <RuleEditor
          rule={editingRule}
          groups={groups}
          onSave={handleSaveRule}
          onCancel={() => setEditingRule(undefined)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default OptionsApp;
