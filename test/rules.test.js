const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { testRule, matchRuleSet, resolveGroupName, hasUnresolvedPlaceholders } = require("../rules");

// ── Helpers ──────────────────────────────────────────────────────────

function makeRule(overrides) {
  return {
    id: "r1",
    field: "url",
    operator: "contains",
    value: "",
    caseSensitive: false,
    ...overrides,
  };
}

function makeTab(overrides) {
  return { title: "", url: "", ...overrides };
}

function makeRuleSet(overrides) {
  return {
    id: "rs1",
    name: "Test",
    color: "blue",
    rules: [],
    matchMode: "all",
    enabled: true,
    priority: 0,
    ...overrides,
  };
}

// ── testRule ─────────────────────────────────────────────────────────

describe("testRule", () => {
  describe("contains operator", () => {
    it("matches case-insensitively by default", () => {
      const rule = makeRule({ operator: "contains", value: "github", field: "url" });
      const tab = makeTab({ url: "https://GitHub.com/foo" });
      assert.equal(testRule(rule, tab, ""), true);
    });

    it("respects caseSensitive flag", () => {
      const rule = makeRule({ operator: "contains", value: "github", field: "url", caseSensitive: true });
      const tab = makeTab({ url: "https://GitHub.com/foo" });
      assert.equal(testRule(rule, tab, ""), false);
    });

    it("matches on title field", () => {
      const rule = makeRule({ operator: "contains", value: "hello", field: "title" });
      const tab = makeTab({ title: "Hello World" });
      assert.equal(testRule(rule, tab, ""), true);
    });

    it("matches on content field", () => {
      const rule = makeRule({ operator: "contains", value: "secret", field: "content" });
      const tab = makeTab({});
      assert.equal(testRule(rule, tab, "This is a secret page"), true);
    });
  });

  describe("not_contains operator", () => {
    it("returns true when value is absent", () => {
      const rule = makeRule({ operator: "not_contains", value: "facebook", field: "url" });
      const tab = makeTab({ url: "https://github.com" });
      assert.equal(testRule(rule, tab, ""), true);
    });

    it("returns false when value is present", () => {
      const rule = makeRule({ operator: "not_contains", value: "github", field: "url" });
      const tab = makeTab({ url: "https://github.com" });
      assert.equal(testRule(rule, tab, ""), false);
    });
  });

  describe("regex operator", () => {
    it("returns false on no match", () => {
      const rule = makeRule({ operator: "regex", value: "^https://gitlab", field: "url" });
      const tab = makeTab({ url: "https://github.com/foo" });
      assert.equal(testRule(rule, tab, ""), false);
    });

    it("returns object with empty captures when no groups", () => {
      const rule = makeRule({ operator: "regex", value: "github\\.com", field: "url" });
      const tab = makeTab({ url: "https://github.com/foo" });
      const result = testRule(rule, tab, "");
      assert.deepEqual(result, { match: true, captures: [] });
    });

    it("returns captured groups", () => {
      const rule = makeRule({ operator: "regex", value: "github\\.com/([^/]+)/([^/]+)", field: "url" });
      const tab = makeTab({ url: "https://github.com/anthropics/claude-code" });
      const result = testRule(rule, tab, "");
      assert.deepEqual(result, { match: true, captures: ["anthropics", "claude-code"] });
    });

    it("is case-insensitive by default", () => {
      const rule = makeRule({ operator: "regex", value: "GITHUB", field: "url" });
      const tab = makeTab({ url: "https://github.com" });
      const result = testRule(rule, tab, "");
      assert.deepEqual(result, { match: true, captures: [] });
    });

    it("respects caseSensitive flag", () => {
      const rule = makeRule({ operator: "regex", value: "GITHUB", field: "url", caseSensitive: true });
      const tab = makeTab({ url: "https://github.com" });
      assert.equal(testRule(rule, tab, ""), false);
    });

    it("returns false on invalid regex", () => {
      const rule = makeRule({ operator: "regex", value: "[invalid(", field: "url" });
      const tab = makeTab({ url: "https://github.com" });
      assert.equal(testRule(rule, tab, ""), false);
    });

    it("captures from content field", () => {
      const rule = makeRule({ operator: "regex", value: "version:\\s*(\\d+\\.\\d+)", field: "content" });
      const tab = makeTab({});
      const result = testRule(rule, tab, "version: 3.14 released");
      assert.deepEqual(result, { match: true, captures: ["3.14"] });
    });
  });

  describe("edge cases", () => {
    it("returns false for unknown field", () => {
      const rule = makeRule({ field: "unknown" });
      assert.equal(testRule(rule, makeTab({}), ""), false);
    });

    it("returns false for unknown operator", () => {
      const rule = makeRule({ operator: "starts_with", value: "x", field: "url" });
      assert.equal(testRule(rule, makeTab({ url: "xyz" }), ""), false);
    });

    it("handles missing tab properties gracefully", () => {
      const rule = makeRule({ operator: "contains", value: "test", field: "title" });
      assert.equal(testRule(rule, {}, ""), false);
    });
  });
});

// ── matchRuleSet ────────────────────────────────────────────────────

describe("matchRuleSet", () => {
  it("returns false for disabled rule set", () => {
    const rs = makeRuleSet({
      enabled: false,
      rules: [makeRule({ operator: "contains", value: "x", field: "url" })],
    });
    assert.equal(matchRuleSet(rs, makeTab({ url: "x" }), ""), false);
  });

  it("returns false for empty rules", () => {
    const rs = makeRuleSet({ rules: [] });
    assert.equal(matchRuleSet(rs, makeTab({}), ""), false);
  });

  describe("AND mode (all)", () => {
    it("matches when all rules pass", () => {
      const rs = makeRuleSet({
        matchMode: "all",
        rules: [
          makeRule({ operator: "contains", value: "github", field: "url" }),
          makeRule({ operator: "contains", value: "repo", field: "title" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com", title: "My Repo" });
      const result = matchRuleSet(rs, tab, "");
      assert.notEqual(result, false);
    });

    it("fails when any rule fails", () => {
      const rs = makeRuleSet({
        matchMode: "all",
        rules: [
          makeRule({ operator: "contains", value: "github", field: "url" }),
          makeRule({ operator: "contains", value: "gitlab", field: "url" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com" });
      assert.equal(matchRuleSet(rs, tab, ""), false);
    });
  });

  describe("OR mode (any)", () => {
    it("matches when at least one rule passes", () => {
      const rs = makeRuleSet({
        matchMode: "any",
        rules: [
          makeRule({ operator: "contains", value: "github", field: "url" }),
          makeRule({ operator: "contains", value: "gitlab", field: "url" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com" });
      const result = matchRuleSet(rs, tab, "");
      assert.notEqual(result, false);
    });

    it("fails when no rules pass", () => {
      const rs = makeRuleSet({
        matchMode: "any",
        rules: [
          makeRule({ operator: "contains", value: "gitlab", field: "url" }),
          makeRule({ operator: "contains", value: "bitbucket", field: "url" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com" });
      assert.equal(matchRuleSet(rs, tab, ""), false);
    });
  });

  describe("capture propagation", () => {
    it("returns captures from regex rule in AND mode", () => {
      const rs = makeRuleSet({
        matchMode: "all",
        rules: [
          makeRule({ operator: "contains", value: "github", field: "url" }),
          makeRule({ operator: "regex", value: "github\\.com/([^/]+)", field: "url" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com/anthropics" });
      const result = matchRuleSet(rs, tab, "");
      assert.deepEqual(result, ["anthropics"]);
    });

    it("returns captures from regex rule in OR mode", () => {
      const rs = makeRuleSet({
        matchMode: "any",
        rules: [
          makeRule({ operator: "contains", value: "nope", field: "url" }),
          makeRule({ operator: "regex", value: "github\\.com/([^/]+)", field: "url" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com/anthropics" });
      const result = matchRuleSet(rs, tab, "");
      assert.deepEqual(result, ["anthropics"]);
    });

    it("returns empty array when match has no captures", () => {
      const rs = makeRuleSet({
        rules: [makeRule({ operator: "contains", value: "github", field: "url" })],
      });
      const tab = makeTab({ url: "https://github.com" });
      const result = matchRuleSet(rs, tab, "");
      assert.deepEqual(result, []);
    });

    it("uses first regex captures when multiple regex rules match", () => {
      const rs = makeRuleSet({
        matchMode: "all",
        rules: [
          makeRule({ operator: "regex", value: "github\\.com/([^/]+)", field: "url" }),
          makeRule({ operator: "regex", value: "/([^/]+)$", field: "url" }),
        ],
      });
      const tab = makeTab({ url: "https://github.com/anthropics/claude" });
      const result = matchRuleSet(rs, tab, "");
      assert.deepEqual(result, ["anthropics"]);
    });
  });
});

// ── resolveGroupName ────────────────────────────────────────────────

describe("resolveGroupName", () => {
  it("returns template unchanged when no captures", () => {
    assert.equal(resolveGroupName("My Group", []), "My Group");
  });

  it("returns template unchanged when captures is null", () => {
    assert.equal(resolveGroupName("My Group", null), "My Group");
  });

  it("replaces $1 with first capture", () => {
    assert.equal(resolveGroupName("GH - $1", ["anthropics"]), "GH - anthropics");
  });

  it("replaces multiple placeholders", () => {
    assert.equal(
      resolveGroupName("$1/$2", ["anthropics", "claude-code"]),
      "anthropics/claude-code",
    );
  });

  it("leaves $N unchanged when index is out of range", () => {
    assert.equal(resolveGroupName("$1 and $3", ["only-one"]), "only-one and $3");
  });

  it("leaves $0 unchanged (captures are 1-indexed)", () => {
    assert.equal(resolveGroupName("$0-$1", ["first"]), "$0-first");
  });

  it("handles template with no placeholders", () => {
    assert.equal(resolveGroupName("Static Name", ["ignored"]), "Static Name");
  });

  it("replaces all occurrences of same placeholder", () => {
    assert.equal(resolveGroupName("$1 and $1", ["x"]), "x and x");
  });
});

// ── hasUnresolvedPlaceholders ─────────────────────────────────────────

describe("hasUnresolvedPlaceholders", () => {
  it("returns false for plain text", () => {
    assert.equal(hasUnresolvedPlaceholders("My Group"), false);
  });

  it("returns false for fully resolved name", () => {
    assert.equal(hasUnresolvedPlaceholders("JIRA-1234"), false);
  });

  it("returns true when $1 remains unresolved", () => {
    assert.equal(hasUnresolvedPlaceholders("$1"), true);
  });

  it("returns true when $N is partially unresolved", () => {
    assert.equal(hasUnresolvedPlaceholders("anthropics and $3"), true);
  });

  it("returns false for dollar sign not followed by digit", () => {
    assert.equal(hasUnresolvedPlaceholders("$money"), false);
  });

  it("integrates with resolveGroupName for missing captures", () => {
    const resolved = resolveGroupName("$1", []);
    assert.equal(hasUnresolvedPlaceholders(resolved), true);
  });

  it("integrates with resolveGroupName for present captures", () => {
    const resolved = resolveGroupName("$1", ["PROJ-42"]);
    assert.equal(hasUnresolvedPlaceholders(resolved), false);
  });
});
