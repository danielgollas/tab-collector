// storage.js — Rule set persistence and defaults

/**
 * Rule shape:
 * {
 *   id: string,
 *   field: "title" | "url" | "content",
 *   operator: "contains" | "not_contains" | "regex",
 *   value: string,          // plain text or regex pattern
 *   caseSensitive: boolean
 * }
 *
 * RuleSet shape:
 * {
 *   id: string,
 *   name: string,           // name that becomes the tab group name
 *   color: string,          // chrome tab group color
 *   rules: Rule[],
 *   matchMode: "all" | "any",  // must match all rules or any rule
 *   enabled: boolean,
 *   priority: number        // lower = higher priority (evaluated first)
 * }
 *
 * Settings shape:
 * {
 *   autoGroup: boolean,     // auto-group on tab creation / navigation
 *   groupExisting: boolean  // on enable, also group already-open tabs
 * }
 */

(() => {
  const DEFAULT_SETTINGS = {
    autoGroup: false,
    groupExisting: true,
  };

  const VALID_COLORS = [
    "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange",
  ];

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function getRuleSets() {
    const { ruleSets = [] } = await chrome.storage.local.get("ruleSets");
    return ruleSets;
  }

  async function saveRuleSets(ruleSets) {
    await chrome.storage.local.set({ ruleSets });
  }

  async function getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async function saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }

  // Exported for use by background.js and popup
  globalThis.TabCollectorStorage = {
    generateId,
    getRuleSets,
    saveRuleSets,
    getSettings,
    saveSettings,
    DEFAULT_SETTINGS,
    VALID_COLORS,
  };
})();
