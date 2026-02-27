import React, { useEffect, useState } from "react";
import { ExtensionSettings, InterceptStats } from "../shared/types";

const Popup: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [stats, setStats] = useState<InterceptStats>({
    activeRuleCount: 0,
    interceptedCount: 0,
    domain: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [settingsRes, statsRes] = await Promise.all([
        sendMessage({ type: "GET_SETTINGS" }),
        sendMessage({ type: "GET_STATS", payload: "" }),
      ]);
      setSettings(settingsRes as ExtensionSettings);
      setStats(statsRes as InterceptStats);
    } catch (err) {
      console.error("[GROE] Failed to load popup data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExtension() {
    const result = await sendMessage({ type: "TOGGLE_EXTENSION" });
    setSettings(result as ExtensionSettings);
  }

  async function disableAllRules() {
    const rules = (await sendMessage({ type: "GET_RULES" })) as Array<{
      id: string;
      enabled: boolean;
    }>;
    for (const rule of rules) {
      if (rule.enabled) {
        await sendMessage({
          type: "UPDATE_RULE",
          payload: { ...rule, enabled: false },
        });
      }
    }
    await loadData();
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  if (loading) {
    return (
      <div className="popup-container">
        <p style={{ textAlign: "center", color: "#5c5a70", paddingTop: 40 }}>Loading…</p>
      </div>
    );
  }

  const isEnabled = settings?.enabled ?? false;

  return (
    <div className="popup-container">
      <div className="popup-header">
        <div className="popup-title">
          <img src="../icons/icon48.png" alt="GROE" className="logo" />
          <h1>GROE</h1>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={toggleExtension}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className={`popup-status ${isEnabled ? "enabled" : "disabled"}`}>
        {isEnabled ? "● Intercepting requests" : "○ Disabled"}
      </div>

      <div className="popup-stats" style={{ marginTop: 12 }}>
        <div className="stat-row">
          <span className="stat-label">Active Rules</span>
          <span className={`stat-value ${stats.activeRuleCount > 0 ? "active" : ""}`}>
            {stats.activeRuleCount}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Intercepted</span>
          <span className="stat-value">{stats.interceptedCount}</span>
        </div>
      </div>

      <div className="popup-actions">
        <button className="popup-btn primary" onClick={openOptions}>
          ⚙️ Manage Rules
        </button>
        <button
          className="popup-btn danger"
          onClick={disableAllRules}
          disabled={stats.activeRuleCount === 0}
        >
          🚫 Disable All Rules
        </button>
      </div>

      <div className="popup-domain">GROE v1.0.0</div>
    </div>
  );
};

function sendMessage(message: { type: string; payload?: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export default Popup;
