// popup.js — UI logic for managing rule sets

const { generateId, getRuleSets, saveRuleSets, getSettings, saveSettings, randomColor } =
  globalThis.TabCollectorStorage;

// ── DOM refs ───────────────────────────────────────────────────────

const listSection = document.getElementById("ruleset-list");
const editor = document.getElementById("editor");
const editorTitle = document.getElementById("editor-title");
const rulesContainer = document.getElementById("rules-container");

const nameInput = document.getElementById("rs-name");
const groupNameInput = document.getElementById("rs-group-name");
const colorSelect = document.getElementById("rs-color");
const matchModeSelect = document.getElementById("rs-match-mode");
const priorityInput = document.getElementById("rs-priority");

const btnAddRuleSet = document.getElementById("btn-add-ruleset");
const btnAddRule = document.getElementById("btn-add-rule");
const btnSave = document.getElementById("btn-save");
const btnCancel = document.getElementById("btn-cancel");
const btnGroupNow = document.getElementById("btn-group-now");
const toggleAuto = document.getElementById("toggle-auto");

const btnJson = document.getElementById("btn-json");
const jsonEditor = document.getElementById("json-editor");
const jsonTextarea = document.getElementById("json-textarea");
const jsonError = document.getElementById("json-error");
const btnJsonSave = document.getElementById("btn-json-save");
const btnJsonCancel = document.getElementById("btn-json-cancel");
const btnJsonImport = document.getElementById("btn-json-import");
const btnJsonExport = document.getElementById("btn-json-export");
const jsonFileInput = document.getElementById("json-file-input");

let editingId = null; // null = new, otherwise editing existing

// ── Render rule set list ───────────────────────────────────────────

async function renderList() {
  const ruleSets = await getRuleSets();
  listSection.innerHTML = "";

  if (ruleSets.length === 0) {
    listSection.innerHTML =
      '<div class="empty-state">No rule sets yet. Add one to start grouping tabs.</div>';
    return;
  }

  const sorted = [...ruleSets].sort(
    (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
  );

  for (const rs of sorted) {
    const card = document.createElement("div");
    card.className = "ruleset-card" + (rs.enabled ? "" : " disabled");
    card.innerHTML = `
      <div class="color-dot color-${rs.color || "grey"}"></div>
      <div class="info">
        <div class="name">${escapeHtml(rs.name)}${rs.groupName ? ` <span class="group-title-badge">${escapeHtml(rs.groupName)}</span>` : ""}</div>
        <div class="meta">${rs.rules.length} rule${rs.rules.length !== 1 ? "s" : ""} · ${rs.matchMode === "any" ? "OR" : "AND"} · priority ${rs.priority ?? 0}</div>
      </div>
      <div class="actions">
        <button data-action="run" data-id="${rs.id}" class="btn-run" title="Run this rule set now">Run</button>
        <button data-action="toggle" data-id="${rs.id}">${rs.enabled ? "Disable" : "Enable"}</button>
        <button data-action="edit" data-id="${rs.id}">Edit</button>
        <button data-action="delete" data-id="${rs.id}" class="btn-danger">Del</button>
      </div>
    `;
    listSection.appendChild(card);
  }
}

// ── Editor ─────────────────────────────────────────────────────────

function openEditor(ruleSet) {
  editor.classList.remove("hidden");
  btnAddRuleSet.classList.add("hidden");

  if (ruleSet) {
    editingId = ruleSet.id;
    editorTitle.textContent = "Edit Rule Set";
    nameInput.value = ruleSet.name;
    groupNameInput.value = ruleSet.groupName || "";
    colorSelect.value = ruleSet.color || "grey";
    matchModeSelect.value = ruleSet.matchMode || "all";
    priorityInput.value = ruleSet.priority ?? 0;
    renderRules(ruleSet.rules);
  } else {
    editingId = null;
    editorTitle.textContent = "New Rule Set";
    nameInput.value = "";
    groupNameInput.value = "";
    colorSelect.value = "blue";
    matchModeSelect.value = "all";
    priorityInput.value = 0;
    renderRules([]);
  }
}

function closeEditor() {
  editor.classList.add("hidden");
  btnAddRuleSet.classList.remove("hidden");
  editingId = null;
}

function renderRules(rules) {
  rulesContainer.innerHTML = "";
  if (rules.length === 0) {
    addRuleRow();
    return;
  }
  for (const rule of rules) {
    addRuleRow(rule);
  }
}

function addRuleRow(rule) {
  const isRegex = rule?.operator === "regex";
  const row = document.createElement("div");
  row.className = "rule-row" + (isRegex ? " rule-row-regex" : "");
  row.innerHTML = `
    <div class="rule-row-main">
      <select class="rule-field">
        <option value="title" ${rule?.field === "title" ? "selected" : ""}>Title</option>
        <option value="url" ${rule?.field === "url" ? "selected" : ""}>URL</option>
        <option value="content" ${rule?.field === "content" ? "selected" : ""}>Content</option>
      </select>
      <select class="rule-operator">
        <option value="contains" ${rule?.operator === "contains" ? "selected" : ""}>contains</option>
        <option value="not_contains" ${rule?.operator === "not_contains" ? "selected" : ""}>not contains</option>
        <option value="regex" ${rule?.operator === "regex" ? "selected" : ""}>regex</option>
      </select>
      <label class="case-toggle">
        <input type="checkbox" class="rule-case" ${rule?.caseSensitive ? "checked" : ""}> Aa
      </label>
      <button class="rule-remove" title="Remove rule">&times;</button>
    </div>
    <div class="rule-value-wrap ${isRegex ? "rule-value-regex" : ""}">
      ${isRegex
        ? `<textarea class="rule-value rule-value-lg" placeholder="Regular expression" spellcheck="false">${escapeHtml(rule?.value || "")}</textarea>`
        : `<input type="text" class="rule-value" placeholder="value" value="${escapeAttr(rule?.value || "")}">`
      }
    </div>
    <div class="regex-tester hidden">
      <div class="regex-tester-header">
        <span class="regex-tester-label">Test String</span>
        <span class="regex-tester-status"></span>
      </div>
      <textarea class="regex-test-input" placeholder="Type a test string to match against..." spellcheck="false"></textarea>
      <div class="regex-match-result hidden">
        <div class="regex-match-highlighted"></div>
        <div class="regex-captures"></div>
        <div class="regex-match-info"></div>
      </div>
    </div>
  `;
  rulesContainer.appendChild(row);

  // Wire up operator change to toggle regex mode
  const operatorSelect = row.querySelector(".rule-operator");
  operatorSelect.addEventListener("change", () => {
    toggleRegexMode(row, operatorSelect.value === "regex");
  });

  // If already regex, show tester and wire up live matching
  if (isRegex) {
    showRegexTester(row);
  }
}

function toggleRegexMode(row, isRegex) {
  const valueWrap = row.querySelector(".rule-value-wrap");
  const oldValue = row.querySelector(".rule-value").value;

  if (isRegex) {
    row.classList.add("rule-row-regex");
    valueWrap.classList.add("rule-value-regex");
    valueWrap.innerHTML = `<textarea class="rule-value rule-value-lg" placeholder="Regular expression" spellcheck="false">${escapeHtml(oldValue)}</textarea>`;
    showRegexTester(row);
  } else {
    row.classList.remove("rule-row-regex");
    valueWrap.classList.remove("rule-value-regex");
    valueWrap.innerHTML = `<input type="text" class="rule-value" placeholder="value" value="${escapeAttr(oldValue)}">`;
    hideRegexTester(row);
  }
}

function showRegexTester(row) {
  const tester = row.querySelector(".regex-tester");
  tester.classList.remove("hidden");

  const patternInput = row.querySelector(".rule-value");
  const testInput = tester.querySelector(".regex-test-input");
  const caseCheckbox = row.querySelector(".rule-case");
  const status = tester.querySelector(".regex-tester-status");
  const resultPanel = tester.querySelector(".regex-match-result");
  const highlighted = tester.querySelector(".regex-match-highlighted");
  const capturesEl = tester.querySelector(".regex-captures");
  const infoEl = tester.querySelector(".regex-match-info");

  function runTest() {
    const pattern = patternInput.value;
    const testStr = testInput.value;
    const caseSensitive = caseCheckbox.checked;

    if (!pattern || !testStr) {
      status.textContent = "";
      status.className = "regex-tester-status";
      resultPanel.classList.add("hidden");
      return;
    }

    let re;
    try {
      re = new RegExp(pattern, caseSensitive ? "g" : "gi");
    } catch (e) {
      status.textContent = "Invalid regex";
      status.className = "regex-tester-status status-error";
      resultPanel.classList.add("hidden");
      return;
    }

    const matches = [];
    let m;
    let firstCaptures = null;
    while ((m = re.exec(testStr)) !== null) {
      matches.push({ index: m.index, length: m[0].length, groups: m.slice(1) });
      if (!firstCaptures && m.slice(1).length > 0) {
        firstCaptures = m.slice(1);
      }
      if (!m[0].length) { re.lastIndex++; } // prevent infinite loop on zero-length match
    }

    if (matches.length === 0) {
      status.textContent = "No match";
      status.className = "regex-tester-status status-no-match";
      resultPanel.classList.add("hidden");
      return;
    }

    status.textContent = `${matches.length} match${matches.length !== 1 ? "es" : ""}`;
    status.className = "regex-tester-status status-match";
    resultPanel.classList.remove("hidden");

    // Build highlighted string
    let html = "";
    let lastEnd = 0;
    for (const match of matches) {
      html += escapeHtml(testStr.slice(lastEnd, match.index));
      html += `<mark class="regex-highlight">${escapeHtml(testStr.slice(match.index, match.index + match.length))}</mark>`;
      lastEnd = match.index + match.length;
    }
    html += escapeHtml(testStr.slice(lastEnd));
    highlighted.innerHTML = html;

    // Show captures from first match
    if (firstCaptures && firstCaptures.length > 0) {
      capturesEl.innerHTML = "<span class='captures-label'>Captures:</span> " +
        firstCaptures.map((c, i) =>
          `<span class="capture-group"><span class="capture-index">$${i + 1}</span><span class="capture-value">${escapeHtml(c)}</span></span>`
        ).join(" ");
      capturesEl.classList.remove("hidden");
    } else {
      capturesEl.innerHTML = "";
      capturesEl.classList.add("hidden");
    }

    // Match info
    const first = matches[0];
    infoEl.textContent = `First match at index ${first.index}, length ${first.length}`;
  }

  patternInput.addEventListener("input", runTest);
  testInput.addEventListener("input", runTest);
  caseCheckbox.addEventListener("change", runTest);

  // Run immediately if there's already a value
  runTest();
}

function hideRegexTester(row) {
  const tester = row.querySelector(".regex-tester");
  tester.classList.add("hidden");
}

function collectRules() {
  const rows = rulesContainer.querySelectorAll(".rule-row");
  const rules = [];
  for (const row of rows) {
    const value = row.querySelector(".rule-value").value.trim();
    if (!value) continue;
    rules.push({
      id: generateId(),
      field: row.querySelector(".rule-field").value,
      operator: row.querySelector(".rule-operator").value,
      value,
      caseSensitive: row.querySelector(".rule-case").checked,
    });
  }
  return rules;
}

// ── Save ───────────────────────────────────────────────────────────

async function save() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const rules = collectRules();
  if (rules.length === 0) return;

  const ruleSets = await getRuleSets();

  const groupName = groupNameInput.value.trim();
  const entry = {
    id: editingId || generateId(),
    name,
    groupName: groupName || undefined,
    color: colorSelect.value,
    matchMode: matchModeSelect.value,
    priority: parseInt(priorityInput.value, 10) || 0,
    rules,
    enabled: true,
  };

  if (editingId) {
    const idx = ruleSets.findIndex((rs) => rs.id === editingId);
    if (idx !== -1) {
      entry.enabled = ruleSets[idx].enabled;
      ruleSets[idx] = entry;
    }
  } else {
    ruleSets.push(entry);
  }

  await saveRuleSets(ruleSets);
  closeEditor();
  await renderList();
}

// ── Event listeners ────────────────────────────────────────────────

btnAddRuleSet.addEventListener("click", () => openEditor(null));
btnAddRule.addEventListener("click", () => addRuleRow());
btnSave.addEventListener("click", save);
btnCancel.addEventListener("click", closeEditor);

btnGroupNow.addEventListener("click", async () => {
  btnGroupNow.textContent = "Grouping...";
  btnGroupNow.disabled = true;
  await chrome.runtime.sendMessage({ type: "GROUP_ALL_NOW" });
  btnGroupNow.textContent = "Done!";
  setTimeout(() => {
    btnGroupNow.textContent = "Group Now";
    btnGroupNow.disabled = false;
  }, 1200);
});

toggleAuto.addEventListener("change", async () => {
  const settings = await getSettings();
  settings.autoGroup = toggleAuto.checked;
  await saveSettings(settings);
});

// Delegate clicks on the rule set list
listSection.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const ruleSets = await getRuleSets();

  if (action === "run") {
    btn.textContent = "...";
    btn.disabled = true;
    await chrome.runtime.sendMessage({ type: "RUN_RULESET", ruleSetId: id });
    btn.textContent = "Done!";
    setTimeout(() => { btn.textContent = "Run"; btn.disabled = false; }, 1200);
    return;
  } else if (action === "toggle") {
    const rs = ruleSets.find((r) => r.id === id);
    if (rs) rs.enabled = !rs.enabled;
    await saveRuleSets(ruleSets);
    await renderList();
  } else if (action === "edit") {
    const rs = ruleSets.find((r) => r.id === id);
    if (rs) openEditor(rs);
  } else if (action === "delete") {
    await saveRuleSets(ruleSets.filter((r) => r.id !== id));
    await renderList();
  }
});

// Delegate remove-rule clicks
rulesContainer.addEventListener("click", (e) => {
  if (e.target.closest(".rule-remove")) {
    e.target.closest(".rule-row").remove();
  }
});

// ── JSON editor ─────────────────────────────────────────────────────

function openJsonEditor(json) {
  jsonEditor.classList.remove("hidden");
  listSection.classList.add("hidden");
  btnAddRuleSet.classList.add("hidden");
  editor.classList.add("hidden");
  jsonError.classList.add("hidden");
  jsonTextarea.value = json;
}

function closeJsonEditor() {
  jsonEditor.classList.add("hidden");
  listSection.classList.remove("hidden");
  btnAddRuleSet.classList.remove("hidden");
}

btnJson.addEventListener("click", async () => {
  const ruleSets = await getRuleSets();
  openJsonEditor(JSON.stringify(ruleSets, null, 2));
});

btnJsonCancel.addEventListener("click", () => {
  closeJsonEditor();
});

btnJsonSave.addEventListener("click", async () => {
  jsonError.classList.add("hidden");
  let parsed;
  try {
    parsed = JSON.parse(jsonTextarea.value);
  } catch (e) {
    jsonError.textContent = "Invalid JSON: " + e.message;
    jsonError.classList.remove("hidden");
    return;
  }
  if (!Array.isArray(parsed)) {
    jsonError.textContent = "JSON must be an array of rule sets.";
    jsonError.classList.remove("hidden");
    return;
  }
  // Ensure every rule set has an id
  for (const rs of parsed) {
    if (!rs.id) rs.id = generateId();
    if (rs.enabled === undefined) rs.enabled = true;
    if (rs.rules) {
      for (const rule of rs.rules) {
        if (!rule.id) rule.id = generateId();
      }
    }
  }
  await saveRuleSets(parsed);
  closeJsonEditor();
  await renderList();
});

btnJsonExport.addEventListener("click", () => {
  const blob = new Blob([jsonTextarea.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tab-collector-rules.json";
  a.click();
  URL.revokeObjectURL(url);
});

btnJsonImport.addEventListener("click", () => {
  jsonFileInput.click();
});

jsonFileInput.addEventListener("change", () => {
  const file = jsonFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    jsonTextarea.value = reader.result;
    jsonError.classList.add("hidden");
  };
  reader.readAsText(file);
  jsonFileInput.value = "";
});

// ── Examples ────────────────────────────────────────────────────────

const EXAMPLES = [
  {
    name: "Jira by Ticket",
    description: "Groups tabs by Jira ticket ID found in title or page content",
    groupName: "$1",
    color: "random",
    matchMode: "any",
    rules: [
      { field: "title", operator: "regex", value: "([a-zA-Z]{2}\\-\\d+)", caseSensitive: false },
      { field: "content", operator: "regex", value: "([a-zA-Z]{2}\\-\\d+)", caseSensitive: false },
    ],
  },
  {
    name: "Google Services",
    description: "Groups Gmail, Sheets, Calendar, Docs, and Drive — excludes Search",
    color: "blue",
    matchMode: "all",
    rules: [
      { field: "url", operator: "regex", value: "https://(mail|docs|sheets|calendar|drive)\\.google\\.com", caseSensitive: false },
      { field: "url", operator: "not_contains", value: "google.com/search", caseSensitive: false },
    ],
  },
];

const examplesList = document.getElementById("examples-list");

function renderExamples() {
  examplesList.innerHTML = "";
  for (let i = 0; i < EXAMPLES.length; i++) {
    const ex = EXAMPLES[i];
    const card = document.createElement("div");
    card.className = "example-card";
    card.innerHTML = `
      <div class="example-info">
        <div class="example-name">${escapeHtml(ex.name)}</div>
        <div class="example-desc">${escapeHtml(ex.description)}</div>
      </div>
      <button class="btn-use-example" data-example="${i}">Use</button>
    `;
    examplesList.appendChild(card);
  }
}

examplesList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-use-example");
  if (!btn) return;

  const ex = EXAMPLES[btn.dataset.example];
  if (!ex) return;

  const ruleSets = await getRuleSets();
  const entry = {
    id: generateId(),
    name: ex.name,
    groupName: ex.groupName || undefined,
    color: ex.color === "random" ? randomColor() : ex.color,
    matchMode: ex.matchMode,
    priority: 0,
    rules: ex.rules.map((r) => ({ ...r, id: generateId() })),
    enabled: true,
  };

  ruleSets.push(entry);
  await saveRuleSets(ruleSets);
  await renderList();

  btn.textContent = "Added!";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = "Use";
    btn.disabled = false;
  }, 1200);
});

// ── Helpers ─────────────────────────────────────────────────────────

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Init ───────────────────────────────────────────────────────────

(async () => {
  const settings = await getSettings();
  toggleAuto.checked = settings.autoGroup;
  renderExamples();
  await renderList();
})();
