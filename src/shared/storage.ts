/**
 * Storage layer — wraps chrome.storage.local with typed accessors.
 */

import {
  Rule,
  RuleGroup,
  ExtensionSettings,
  ExportData,
  createDefaultSettings,
} from "./types";

const KEYS = {
  SETTINGS: "groe_settings",
  RULES: "groe_rules",
  GROUPS: "groe_groups",
} as const;

/** Read from chrome.storage.local */
async function get<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] !== undefined ? (result[key] as T) : fallback);
    });
  });
}

/** Write to chrome.storage.local */
async function set(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// ——— Settings ———

export async function getSettings(): Promise<ExtensionSettings> {
  return get<ExtensionSettings>(KEYS.SETTINGS, createDefaultSettings());
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await set(KEYS.SETTINGS, settings);
}

// ——— Rules ———

export async function getRules(): Promise<Rule[]> {
  return get<Rule[]>(KEYS.RULES, []);
}

export async function saveRules(rules: Rule[]): Promise<void> {
  await set(KEYS.RULES, rules);
}

export async function addRule(rule: Rule): Promise<Rule[]> {
  const rules = await getRules();
  rules.push(rule);
  await saveRules(rules);
  return rules;
}

export async function updateRule(updated: Rule): Promise<Rule[]> {
  const rules = await getRules();
  const idx = rules.findIndex((r) => r.id === updated.id);
  if (idx !== -1) {
    rules[idx] = { ...updated, updatedAt: Date.now() };
  }
  await saveRules(rules);
  return rules;
}

export async function deleteRule(ruleId: string): Promise<Rule[]> {
  let rules = await getRules();
  rules = rules.filter((r) => r.id !== ruleId);
  await saveRules(rules);
  return rules;
}

// ——— Groups ———

export async function getGroups(): Promise<RuleGroup[]> {
  return get<RuleGroup[]>(KEYS.GROUPS, []);
}

export async function saveGroups(groups: RuleGroup[]): Promise<void> {
  await set(KEYS.GROUPS, groups);
}

export async function addGroup(group: RuleGroup): Promise<RuleGroup[]> {
  const groups = await getGroups();
  groups.push(group);
  await saveGroups(groups);
  return groups;
}

export async function updateGroup(updated: RuleGroup): Promise<RuleGroup[]> {
  const groups = await getGroups();
  const idx = groups.findIndex((g) => g.id === updated.id);
  if (idx !== -1) {
    groups[idx] = updated;
  }
  await saveGroups(groups);
  return groups;
}

export async function deleteGroup(groupId: string): Promise<RuleGroup[]> {
  let groups = await getGroups();
  groups = groups.filter((g) => g.id !== groupId);
  await saveGroups(groups);

  // Also remove groupId from rules in that group
  const rules = await getRules();
  const updated = rules.map((r) =>
    r.groupId === groupId ? { ...r, groupId: undefined } : r,
  );
  await saveRules(updated);

  return groups;
}

// ——— Import / Export ———

export async function exportAll(): Promise<ExportData> {
  const [rules, groups] = await Promise.all([getRules(), getGroups()]);
  return {
    version: "1.0.0",
    exportedAt: Date.now(),
    rules,
    groups,
  };
}

export async function importAll(data: ExportData): Promise<void> {
  if (!data.version || !Array.isArray(data.rules)) {
    throw new Error("Invalid import data format");
  }
  await Promise.all([saveRules(data.rules), saveGroups(data.groups || [])]);
}

// ——— Listeners ———

type StorageChangeCallback = (changes: {
  [key: string]: chrome.storage.StorageChange;
}) => void;

const listeners: StorageChangeCallback[] = [];

export function onStorageChange(cb: StorageChangeCallback): () => void {
  listeners.push(cb);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      cb(changes);
    }
  });
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}
