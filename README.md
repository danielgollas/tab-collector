# Tab Collector

A Chrome extension that groups ungrouped tabs into named tab groups based on configurable rule sets. Works automatically in the background or on demand with a single click.

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `tab-collector` directory
5. The Tab Collector icon appears in your toolbar

## Usage

### Creating Rule Sets

Click the extension icon to open the popup, then click **+ Add Rule Set**.

Each rule set defines:

| Setting | Description |
|---------|-------------|
| **Group Name** | The name shown on the Chrome tab group |
| **Color** | Tab group color (grey, blue, red, yellow, green, pink, purple, cyan, orange) |
| **Match Mode** | **All (AND)** — every rule must match. **Any (OR)** — at least one rule must match |
| **Priority** | Lower number = evaluated first. First matching rule set wins |

### Rules

Each rule set contains one or more rules. A rule has:

- **Field** — what to match against:
  - `Title` — the tab's title text
  - `URL` — the tab's full URL
  - `Content` — the visible text content of the page
- **Operator**:
  - `contains` — field includes the value as a substring
  - `not contains` — field does not include the value
  - `regex` — field matches the regular expression pattern
- **Case sensitive** — toggle per rule (the `Aa` checkbox)

### Examples

| Goal | Field | Operator | Value |
|------|-------|----------|-------|
| Group all GitHub tabs | URL | contains | `github.com` |
| Group tabs with "Dashboard" in the title | Title | contains | `Dashboard` |
| Group all Google services | URL | regex | `^https://(mail\|docs\|drive\|calendar)\.google\.com` |
| Exclude API docs from a group | URL | not contains | `/api/` |
| Group pages mentioning "quarterly report" | Content | contains | `quarterly report` |

### Auto-Grouping

Toggle **Auto-group** in the popup to automatically evaluate and group tabs whenever a page finishes loading or a new tab is created. When off, use the **Group Now** button to evaluate all currently open ungrouped tabs.

### How Matching Works

1. Only ungrouped tabs are evaluated (tabs already in a group are never moved)
2. Rule sets are evaluated in priority order (lowest number first)
3. The first rule set whose rules match wins — the tab is added to that group
4. If a group with the rule set's name already exists in the window, the tab joins it; otherwise a new group is created
5. Internal pages (`chrome://`, `edge://`) are always skipped

---

## Development

### Project Structure

```
tab-collector/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker — rule evaluation & tab grouping
├── content.js             # Content script — extracts page text
├── storage.js             # Shared storage layer (chrome.storage.local)
├── popup/
│   ├── popup.html         # Popup UI markup
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic — rule set CRUD, settings
└── icons/
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    └── generate_icons.py  # Script to regenerate icons
```

### Key APIs Used

- [`chrome.tabs`](https://developer.chrome.com/docs/extensions/reference/api/tabs) — query and group tabs
- [`chrome.tabGroups`](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) — query and update tab groups
- [`chrome.storage.local`](https://developer.chrome.com/docs/extensions/reference/api/storage) — persist rule sets and settings
- [`chrome.scripting`](https://developer.chrome.com/docs/extensions/reference/api/scripting) — content script communication
- [`chrome.runtime.onMessage`](https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onMessage) — popup ↔ background messaging

### Data Model

**Rule** — a single matching condition:
```json
{
  "id": "m1abc123",
  "field": "title | url | content",
  "operator": "contains | not_contains | regex",
  "value": "search string or regex pattern",
  "caseSensitive": false
}
```

**RuleSet** — a named group with rules:
```json
{
  "id": "k9xyz456",
  "name": "Social Media",
  "color": "blue",
  "matchMode": "any",
  "priority": 0,
  "enabled": true,
  "rules": [ /* ...Rule objects... */ ]
}
```

**Settings**:
```json
{
  "autoGroup": false,
  "groupExisting": true
}
```

### Architecture Notes

- **`storage.js`** is shared between the background service worker (via `importScripts`) and the popup (via `<script>` tag). It exposes utilities on `globalThis.TabCollectorStorage`.
- **`background.js`** listens for `tabs.onUpdated` and `tabs.onCreated` events when auto-grouping is enabled. It also handles `GROUP_ALL_NOW` messages from the popup.
- **`content.js`** runs on all pages at `document_idle` and responds to `GET_PAGE_CONTENT` messages with `document.body.innerText`. This is only queried when a rule set has a rule with `field: "content"`.
- Tab grouping is idempotent — tabs already in a group are never re-evaluated or moved.

### Regenerating Icons

```bash
cd icons
python3 generate_icons.py
```

### Loading Changes During Development

After editing files, go to `chrome://extensions` and click the reload button on the Tab Collector card. Background service worker changes require this reload; popup changes take effect on next popup open.
