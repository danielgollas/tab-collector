// background.js — Service worker: evaluates rules and groups tabs

importScripts("storage.js");

const { getRuleSets, getSettings } = globalThis.TabCollectorStorage;

// ── Rule evaluation ────────────────────────────────────────────────

// Returns { match: true/false, captures: [...] } for regex rules,
// or just true/false for non-regex rules.
function testRule(rule, tab, pageContent) {
  let subject;
  if (rule.field === "title") {
    subject = tab.title || "";
  } else if (rule.field === "url") {
    subject = tab.url || "";
  } else if (rule.field === "content") {
    subject = pageContent || "";
  } else {
    return false;
  }

  const flags = rule.caseSensitive ? "" : "i";

  switch (rule.operator) {
    case "contains":
      return rule.caseSensitive
        ? subject.includes(rule.value)
        : subject.toLowerCase().includes(rule.value.toLowerCase());
    case "not_contains":
      return rule.caseSensitive
        ? !subject.includes(rule.value)
        : !subject.toLowerCase().includes(rule.value.toLowerCase());
    case "regex":
      try {
        const re = new RegExp(rule.value, flags);
        const m = re.exec(subject);
        if (!m) return false;
        return { match: true, captures: m.slice(1) };
      } catch {
        return false;
      }
    default:
      return false;
  }
}

// Returns false if no match, or an array of captured strings (may be empty)
// from the first regex rule that produced captures.
function matchRuleSet(ruleSet, tab, pageContent) {
  if (!ruleSet.enabled || ruleSet.rules.length === 0) return false;

  const captures = [];

  if (ruleSet.matchMode === "any") {
    let anyMatch = false;
    for (const rule of ruleSet.rules) {
      const result = testRule(rule, tab, pageContent);
      if (result) {
        anyMatch = true;
        if (result.captures && result.captures.length > 0 && captures.length === 0) {
          captures.push(...result.captures);
        }
      }
    }
    if (!anyMatch) return false;
  } else {
    for (const rule of ruleSet.rules) {
      const result = testRule(rule, tab, pageContent);
      if (!result) return false;
      if (result.captures && result.captures.length > 0 && captures.length === 0) {
        captures.push(...result.captures);
      }
    }
  }

  return captures;
}

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

async function findOrCreateGroup(name, color, windowId) {
  // Look for an existing group with this name in the same window
  const groups = await chrome.tabGroups.query({ windowId });
  const existing = groups.find((g) => g.title === name);
  if (existing) return existing.id;

  // No existing group — we'll create one when we group the first tab
  return null;
}

function resolveGroupName(template, captures) {
  if (!captures || captures.length === 0) return template;
  return template.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10) - 1; // $1 → index 0
    return idx >= 0 && idx < captures.length ? captures[idx] : _;
  });
}

async function groupTab(tab, ruleSet, captures) {
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return; // already grouped
  }

  const groupName = resolveGroupName(ruleSet.name, captures);

  const existingGroupId = await findOrCreateGroup(
    groupName,
    ruleSet.color,
    tab.windowId,
  );

  if (existingGroupId) {
    await chrome.tabs.group({ tabIds: [tab.id], groupId: existingGroupId });
  } else {
    const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(newGroupId, {
      title: groupName,
      color: ruleSet.color || "grey",
    });
  }
}

async function evaluateTab(tab) {
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
      await groupTab(tab, ruleSet, captures);
      return; // first matching rule set wins
    }
  }
}

async function evaluateAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await evaluateTab(tab);
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
});
