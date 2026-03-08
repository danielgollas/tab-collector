// popup.js — UI logic for managing rule sets

const { generateId, getRuleSets, saveRuleSets, getSettings, saveSettings } =
  globalThis.TabCollectorStorage;

// ── DOM refs ───────────────────────────────────────────────────────

const listSection = document.getElementById("ruleset-list");
const editor = document.getElementById("editor");
const editorTitle = document.getElementById("editor-title");
const rulesContainer = document.getElementById("rules-container");

const nameInput = document.getElementById("rs-name");
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
        <div class="name">${escapeHtml(rs.name)}</div>
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
    colorSelect.value = ruleSet.color || "grey";
    matchModeSelect.value = ruleSet.matchMode || "all";
    priorityInput.value = ruleSet.priority ?? 0;
    renderRules(ruleSet.rules);
  } else {
    editingId = null;
    editorTitle.textContent = "New Rule Set";
    nameInput.value = "";
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
  const row = document.createElement("div");
  row.className = "rule-row";
  row.innerHTML = `
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
    <input type="text" class="rule-value" placeholder="value or /regex/" value="${escapeAttr(rule?.value || "")}">
    <label class="case-toggle">
      <input type="checkbox" class="rule-case" ${rule?.caseSensitive ? "checked" : ""}> Aa
    </label>
    <button class="rule-remove" title="Remove rule">&times;</button>
  `;
  rulesContainer.appendChild(row);
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

  const entry = {
    id: editingId || generateId(),
    name,
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
  await renderList();
})();
