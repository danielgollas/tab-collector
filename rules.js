// rules.js — Pure rule evaluation and name resolution logic
// Shared by background.js (via importScripts) and tests (via require/import)

// Returns { match: true, captures: [...] } for regex rules,
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

function resolveGroupName(template, captures) {
  if (!captures || captures.length === 0) return template;
  return template.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10) - 1; // $1 → index 0
    return idx >= 0 && idx < captures.length ? captures[idx] : _;
  });
}

// Export for Node.js tests; in service worker context this is a no-op
if (typeof module !== "undefined" && module.exports) {
  module.exports = { testRule, matchRuleSet, resolveGroupName };
}
