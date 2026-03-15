// background.js — Service worker: evaluates rules and groups tabs

importScripts("storage.js", "rules.js");

const { getRuleSets, getSettings, randomColor } = globalThis.TabCollectorStorage;

// ── Page content fetching via content script ───────────────────────

async function getPageContent(tabId) {
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTENT" }).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
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

async function groupTab(tab, ruleSet, captures, groupCache, targetWindowId) {
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return; // already grouped
  }

  const template = ruleSet.groupName || ruleSet.name;
  const groupName = resolveGroupName(template, captures);

  // If the group title uses $N placeholders that didn't resolve (no captures),
  // skip grouping — the tab didn't produce the required capture values
  if (hasUnresolvedPlaceholders(groupName)) return;

  // Move tab to target window if collecting across windows
  if (targetWindowId && tab.windowId !== targetWindowId) {
    await chrome.tabs.move(tab.id, { windowId: targetWindowId, index: -1 });
  }

  const windowId = targetWindowId || tab.windowId;

  const existingGroupId = await findOrCreateGroup(
    groupName,
    ruleSet.color,
    windowId,
    groupCache,
  );

  const color = ruleSet.color === "random" ? randomColor() : (ruleSet.color || "grey");

  if (existingGroupId) {
    await chrome.tabs.group({ tabIds: [tab.id], groupId: existingGroupId });
  } else {
    const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(newGroupId, { title: groupName, color, collapsed: true });
    if (groupCache) groupCache.set(groupName, newGroupId);
  }
}

async function evaluateTab(tab, groupCache, targetWindowId) {
  const ruleSets = await getRuleSets();
  if (ruleSets.length === 0) return;

  // Skip tabs that are already in a group
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;

  if (!tab.url) return;

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
      await groupTab(tab, ruleSet, captures, groupCache, targetWindowId);
      return; // first matching rule set wins
    }
  }
}

async function getTargetWindowId(senderWindowId) {
  const settings = await getSettings();
  if (!settings.collectAllWindows) return null;
  if (senderWindowId) return senderWindowId;
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  return win?.id || null;
}

async function evaluateAllTabs(senderWindowId) {
  const groupCache = new Map();
  const targetWindowId = await getTargetWindowId(senderWindowId);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await evaluateTab(tab, groupCache, targetWindowId);
  }

  if (targetWindowId) {
    await moveGroupsToStart(targetWindowId);
  } else {
    const windows = new Set(tabs.map((t) => t.windowId));
    for (const windowId of windows) {
      await moveGroupsToStart(windowId);
    }
  }
}

async function runSingleRuleSet(ruleSetId, senderWindowId) {
  const ruleSets = await getRuleSets();
  const ruleSet = ruleSets.find((rs) => rs.id === ruleSetId);
  if (!ruleSet) return;

  const groupCache = new Map();
  const targetWindowId = await getTargetWindowId(senderWindowId);
  const tabs = await chrome.tabs.query({});
  const needsContent = ruleSet.rules.some((r) => r.field === "content");

  for (const tab of tabs) {
    if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) continue;
    if (!tab.url) continue;

    let pageContent = "";
    if (needsContent) {
      pageContent = await getPageContent(tab.id);
    }

    const captures = matchRuleSet(ruleSet, tab, pageContent);
    if (captures !== false) {
      await groupTab(tab, ruleSet, captures, groupCache, targetWindowId);
    }
  }

  if (targetWindowId) {
    await moveGroupsToStart(targetWindowId);
  } else {
    const windows = new Set(tabs.map((t) => t.windowId));
    for (const windowId of windows) {
      await moveGroupsToStart(windowId);
    }
  }
}

// ── Move groups to start ──────────────────────────────────────────

async function moveGroupsToStart(windowId) {
  const settings = await getSettings();
  if (!settings.moveGroupsToStart) return;

  const groups = await chrome.tabGroups.query({ windowId });
  // Move each group to index 0 in reverse order so the first group ends up at position 0
  for (let i = groups.length - 1; i >= 0; i--) {
    await chrome.tabGroups.move(groups[i].id, { index: 0 });
  }
}

// ── Ungrouping logic ─────────────────────────────────────────────

async function ungroupMatchingTabs(ruleSetsToCheck) {
  const tabs = await chrome.tabs.query({});
  const needsContent = ruleSetsToCheck.some(
    (rs) => rs.rules.some((r) => r.field === "content"),
  );

  const tabIdsToUngroup = [];

  for (const tab of tabs) {
    if (!tab.groupId || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) continue;
    if (!tab.url) continue;

    let pageContent = "";
    if (needsContent) {
      pageContent = await getPageContent(tab.id);
    }

    for (const ruleSet of ruleSetsToCheck) {
      const captures = matchRuleSet(ruleSet, tab, pageContent);
      if (captures !== false) {
        tabIdsToUngroup.push(tab.id);
        break;
      }
    }
  }

  if (tabIdsToUngroup.length > 0) {
    await chrome.tabs.ungroup(tabIdsToUngroup);
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
  const senderWindowId = message.windowId || sender.tab?.windowId;

  if (message.type === "GROUP_ALL_NOW") {
    evaluateAllTabs(senderWindowId).then(() => sendResponse({ success: true }));
    return true; // keep channel open for async response
  }

  if (message.type === "EVALUATE_TAB") {
    chrome.tabs.get(message.tabId).then((tab) => {
      evaluateTab(tab).then(() => sendResponse({ success: true }));
    });
    return true;
  }

  if (message.type === "RUN_RULESET") {
    runSingleRuleSet(message.ruleSetId, senderWindowId).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "UNGROUP_ALL_NOW") {
    getRuleSets().then((ruleSets) => {
      const enabled = ruleSets.filter((rs) => rs.enabled);
      ungroupMatchingTabs(enabled).then(() => sendResponse({ success: true }));
    });
    return true;
  }

  if (message.type === "UNGROUP_RULESET") {
    getRuleSets().then((ruleSets) => {
      const ruleSet = ruleSets.find((rs) => rs.id === message.ruleSetId);
      if (!ruleSet) { sendResponse({ success: false }); return; }
      ungroupMatchingTabs([ruleSet]).then(() => sendResponse({ success: true }));
    });
    return true;
  }
});
