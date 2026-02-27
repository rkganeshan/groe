/**
 * Background Service Worker
 *
 * Responsibilities:
 * - Listen for messages from popup/options/content scripts
 * - Manage rules and settings
 * - Update badge count
 * - Coordinate interception state
 */

import {
  getSettings,
  saveSettings,
  getRules,
  addRule,
  updateRule,
  deleteRule,
  getGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  exportAll,
  importAll,
  ExtensionMessage,
  ExtensionSettings,
  Rule,
  RuleGroup,
  ExportData,
} from "../shared";

// ——— Badge Management ———

async function updateBadge(tabId?: number): Promise<void> {
  const settings = await getSettings();

  if (!settings.enabled) {
    await chrome.action.setBadgeText({ text: "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: "#888888" });
    return;
  }

  const rules = await getRules();
  const enabledCount = rules.filter((r) => r.enabled).length;

  await chrome.action.setBadgeText({
    text: enabledCount > 0 ? String(enabledCount) : "",
  });
  await chrome.action.setBadgeBackgroundColor({
    color: enabledCount > 0 ? "#7C3AED" : "#888888",
  });
}

// ——— Intercept Tracking ———

const interceptCounts: Map<string, number> = new Map();

function incrementInterceptCount(domain: string): void {
  const count = interceptCounts.get(domain) || 0;
  interceptCounts.set(domain, count + 1);
}

// ——— Message Handler ———

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err) => {
        console.error("[GROE] Message handler error:", err);
        sendResponse({ error: err.message });
      });
    return true; // Keep the message channel open for async
  },
);

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    // ——— Settings ———
    case "GET_SETTINGS":
      return getSettings();

    case "UPDATE_SETTINGS": {
      const settings = message.payload as ExtensionSettings;
      await saveSettings(settings);
      await updateBadge();
      broadcastToTabs({ type: "SETTINGS_CHANGED", payload: settings });
      return settings;
    }

    case "TOGGLE_EXTENSION": {
      const current = await getSettings();
      current.enabled = !current.enabled;
      await saveSettings(current);
      await updateBadge();
      broadcastToTabs({ type: "SETTINGS_CHANGED", payload: current });
      return current;
    }

    // ——— Rules ———
    case "GET_RULES":
      return getRules();

    case "ADD_RULE": {
      const rule = message.payload as Rule;
      const rules = await addRule(rule);
      await updateBadge();
      broadcastToTabs({ type: "RULES_CHANGED", payload: rules });
      return rules;
    }

    case "UPDATE_RULE": {
      const rule = message.payload as Rule;
      const rules = await updateRule(rule);
      await updateBadge();
      broadcastToTabs({ type: "RULES_CHANGED", payload: rules });
      return rules;
    }

    case "DELETE_RULE": {
      const ruleId = message.payload as string;
      const rules = await deleteRule(ruleId);
      await updateBadge();
      broadcastToTabs({ type: "RULES_CHANGED", payload: rules });
      return rules;
    }

    // ——— Groups ———
    case "GET_GROUPS":
      return getGroups();

    case "ADD_GROUP": {
      const group = message.payload as RuleGroup;
      return addGroup(group);
    }

    case "UPDATE_GROUP": {
      const group = message.payload as RuleGroup;
      return updateGroup(group);
    }

    case "DELETE_GROUP": {
      const groupId = message.payload as string;
      return deleteGroup(groupId);
    }

    // ——— Import/Export ———
    case "EXPORT_RULES":
      return exportAll();

    case "IMPORT_RULES": {
      const data = message.payload as ExportData;
      await importAll(data);
      await updateBadge();
      broadcastToTabs({ type: "RULES_CHANGED" });
      return { success: true };
    }

    // ——— Stats ———
    case "GET_STATS": {
      const domain = (message.payload as string) || "";
      const rules = await getRules();
      return {
        activeRuleCount: rules.filter((r) => r.enabled).length,
        interceptedCount: interceptCounts.get(domain) || 0,
        domain,
      };
    }

    // ——— Intercept notification from content script ———
    case "REQUEST_INTERCEPTED": {
      const info = message.payload as {
        domain: string;
        operationName?: string;
        ruleId: string;
      };
      incrementInterceptCount(info.domain);
      return { ok: true };
    }

    default:
      console.warn("[GROE] Unknown message type:", message.type);
      return { error: "Unknown message type" };
  }
}

/** Broadcast a message to all tabs */
async function broadcastToTabs(message: ExtensionMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch {
          // Tab might not have content script loaded
        }
      }
    }
  } catch {
    // Ignore broadcast errors
  }
}

// ——— Initialization ———

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[GROE] Extension installed/updated");
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBadge();
});

// Update badge when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    updateBadge();
  }
});
