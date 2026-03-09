// background.js — Service worker: evaluates rules and groups tabs

importScripts("storage.js", "rules.js");

const { getRuleSets, getSettings, randomColor } = globalThis.TabCollectorStorage;

// ── Page content fetching via content script ───────────────────────

async function getPageContent(tabId) {
  try {
    const [response] = await chrome.tabs.sendMessage(tabId, {
      type: "GET_PAGE_CONTENT",
    }).then((r) => [r]).catch(() => [null]);
    return response?.content || "";
  } catch {
    return "";
  }
}

// ── Grouping logic ─────────────────────────────────────────────────

async function findOrCreateGroup(name, color, windowId, groupCache) {
  // Check in-memory cache first (for batch operations where Chrome API
  // may not yet reflect newly created groups)
  if (groupCache) {
    const cached = groupCache.get(name);
    if (cached !== undefined) return cached;
  }

  // Look for an existing group with this name in the same window
  const groups = await chrome.tabGroups.query({ windowId });
  const existing = groups.find((g) => g.title === name);
  if (existing) {
    if (groupCache) groupCache.set(name, existing.id);
    return existing.id;
  }

  return null;
}

async function groupTab(tab, ruleSet, captures, groupCache) {
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return; // already grouped
  }

  const template = ruleSet.groupName || ruleSet.name;
  const groupName = resolveGroupName(template, captures);

  // If the group title uses $N placeholders that didn't resolve (no captures),
  // skip grouping — the tab didn't produce the required capture values
  if (hasUnresolvedPlaceholders(groupName)) return;

  const existingGroupId = await findOrCreateGroup(
    groupName,
    ruleSet.color,
    tab.windowId,
    groupCache,
  );

  const color = ruleSet.color === "random" ? randomColor() : (ruleSet.color || "grey");

  if (existingGroupId) {
    await chrome.tabs.group({ tabIds: [tab.id], groupId: existingGroupId });
  } else {
    const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
    console.log("[tab-collector] created group", newGroupId, "want:", { title: groupName, color });

    // Set title first, alone
    const r1 = await chrome.tabGroups.update(newGroupId, { title: groupName });
    console.log("[tab-collector] after set title:", { title: r1.title, color: r1.color });

    // Then color, alone
    const r2 = await chrome.tabGroups.update(newGroupId, { color });
    console.log("[tab-collector] after set color:", { title: r2.title, color: r2.color });

    // Read back to verify
    const check = await chrome.tabGroups.get(newGroupId);
    console.log("[tab-collector] read-back:", { title: check.title, color: check.color });

    // Collapse last
    const r3 = await chrome.tabGroups.update(newGroupId, { collapsed: true });
    console.log("[tab-collector] after collapse:", { title: r3.title, color: r3.color, collapsed: r3.collapsed });

    if (groupCache) groupCache.set(groupName, newGroupId);
  }
}

async function evaluateTab(tab, groupCache) {
  const ruleSets = await getRuleSets();
  if (ruleSets.length === 0) return;

  // Skip tabs that are already in a group
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;

  // Skip chrome:// and edge:// internal pages
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) return;

  // Check if any rule set needs content
  const needsContent = ruleSets.some(
    (rs) => rs.enabled && rs.rules.some((r) => r.field === "content"),
  );

  let pageContent = "";
  if (needsContent) {
    pageContent = await getPageContent(tab.id);
  }

  // Sort by priority (lower number = higher priority)
  const sorted = [...ruleSets].sort(
    (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
  );

  for (const ruleSet of sorted) {
    const captures = matchRuleSet(ruleSet, tab, pageContent);
    if (captures !== false) {
      await groupTab(tab, ruleSet, captures, groupCache);
      return; // first matching rule set wins
    }
  }
}

async function evaluateAllTabs() {
  const groupCache = new Map();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await evaluateTab(tab, groupCache);
  }
}

async function runSingleRuleSet(ruleSetId) {
  const ruleSets = await getRuleSets();
  const ruleSet = ruleSets.find((rs) => rs.id === ruleSetId);
  if (!ruleSet) return;

  const groupCache = new Map();
  const tabs = await chrome.tabs.query({});
  const needsContent = ruleSet.rules.some((r) => r.field === "content");

  for (const tab of tabs) {
    if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) continue;
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) continue;

    let pageContent = "";
    if (needsContent) {
      pageContent = await getPageContent(tab.id);
    }

    const captures = matchRuleSet(ruleSet, tab, pageContent);
    if (captures !== false) {
      await groupTab(tab, ruleSet, captures, groupCache);
    }
  }
}

// ── Event listeners ────────────────────────────────────────────────

// When a tab finishes loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const settings = await getSettings();
  if (!settings.autoGroup) return;
  await evaluateTab(tab);
});

// When a new tab is created (evaluate once it has a URL)
chrome.tabs.onCreated.addListener(async (tab) => {
  const settings = await getSettings();
  if (!settings.autoGroup) return;
  // Wait a moment for the tab to get its URL
  setTimeout(async () => {
    const updated = await chrome.tabs.get(tab.id).catch(() => null);
    if (updated) await evaluateTab(updated);
  }, 500);
});

// ── Message handling (from popup) ──────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GROUP_ALL_NOW") {
    evaluateAllTabs().then(() => sendResponse({ success: true }));
    return true; // keep channel open for async response
  }

  if (message.type === "EVALUATE_TAB") {
    chrome.tabs.get(message.tabId).then((tab) => {
      evaluateTab(tab).then(() => sendResponse({ success: true }));
    });
    return true;
  }

  if (message.type === "RUN_RULESET") {
    runSingleRuleSet(message.ruleSetId).then(() => sendResponse({ success: true }));
    return true;
  }
});
