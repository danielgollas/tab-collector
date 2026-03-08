const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const storageSrc = fs.readFileSync(path.join(__dirname, "..", "storage.js"), "utf8");

describe("storage.js isolation", () => {
  let context;

  beforeEach(() => {
    // Simulate the chrome.storage.local API
    const store = {};
    context = vm.createContext({
      globalThis: {},
      chrome: {
        storage: {
          local: {
            get: async (key) => ({ [key]: store[key] }),
            set: async (obj) => Object.assign(store, obj),
          },
        },
      },
    });
    // Ensure globalThis self-references correctly
    context.globalThis = context;
  });

  it("does not leak function declarations into global scope", () => {
    vm.runInContext(storageSrc, context);

    // These should NOT be globals — they should be scoped inside the IIFE
    assert.equal(context.generateId, undefined, "generateId leaked to global");
    assert.equal(context.getRuleSets, undefined, "getRuleSets leaked to global");
    assert.equal(context.saveRuleSets, undefined, "saveRuleSets leaked to global");
    assert.equal(context.getSettings, undefined, "getSettings leaked to global");
    assert.equal(context.saveSettings, undefined, "saveSettings leaked to global");
    assert.equal(context.DEFAULT_SETTINGS, undefined, "DEFAULT_SETTINGS leaked to global");
    assert.equal(context.VALID_COLORS, undefined, "VALID_COLORS leaked to global");
  });

  it("exports everything via globalThis.TabCollectorStorage", () => {
    vm.runInContext(storageSrc, context);

    const storage = context.TabCollectorStorage;
    assert.ok(storage, "TabCollectorStorage should be defined");
    assert.equal(typeof storage.generateId, "function");
    assert.equal(typeof storage.getRuleSets, "function");
    assert.equal(typeof storage.saveRuleSets, "function");
    assert.equal(typeof storage.getSettings, "function");
    assert.equal(typeof storage.saveSettings, "function");
    assert.ok(Array.isArray(storage.VALID_COLORS));
    assert.equal(typeof storage.DEFAULT_SETTINGS, "object");
  });

  it("generateId produces unique IDs", () => {
    vm.runInContext(storageSrc, context);
    const id1 = context.TabCollectorStorage.generateId();
    const id2 = context.TabCollectorStorage.generateId();
    assert.notEqual(id1, id2);
  });

  it("would cause redeclaration error if functions leaked (simulating popup.js pattern)", () => {
    vm.runInContext(storageSrc, context);

    // This is what popup.js does — it should NOT throw if the IIFE is working
    assert.doesNotThrow(() => {
      vm.runInContext(
        'const { generateId, getRuleSets } = globalThis.TabCollectorStorage;',
        context,
      );
    });
  });
});
