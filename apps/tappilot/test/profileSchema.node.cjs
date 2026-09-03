const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../electron/profileSchema.cjs");

describe("profileSchema migrate/validate", () => {
  it("treats missing schemaVersion as v0 and migrates to v1", () => {
    const raw = {
      id: "p1",
      name: "Figma",
      targetApp: "Figma",
      grid: { cols: 6, rows: 8 },
      widgets: [
        {
          id: "w1",
          type: "button",
          name: "Pen",
          icon: "Pen",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["cmd", "p"] },
        },
        {
          id: "w2",
          type: "knob",
          name: "Brush",
          icon: "Circle",
          layout: { x: 1, y: 0, w: 2, h: 2 },
          binding: {
            kind: "key_stream",
            increaseKeys: ["]"],
            decreaseKeys: ["["],
            sensitivity: 5,
          },
        },
      ],
    };

    const migrated = schema.migrateProfile(raw);
    assert.equal(migrated.format, "tappilot-profile");
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.targetApp.name, "Figma");
    assert.equal(migrated.execution.targetMode, "activate-target-app");
    assert.equal(migrated.widgets[0].binding.kind, "shortcut");
    assert.ok(migrated.widgets[0].binding.shortcut);
    assert.deepEqual(migrated.widgets[0].binding.shortcut.modifiers, ["meta"]);
    assert.equal(migrated.widgets[1].binding.increase.key, "]");
    assert.equal(migrated.widgets[1].binding.decrease.key, "[");

    const validation = schema.validateProfile(migrated);
    assert.equal(validation.ok, true);
  });

  it("rejects duplicate widget ids and unknown types", () => {
    const profile = schema.migrateProfile({
      id: "p2",
      name: "Bad",
      targetApp: { name: "X" },
      grid: { cols: 4, rows: 4 },
      widgets: [
        {
          id: "dup",
          type: "button",
          name: "A",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["a"] },
        },
        {
          id: "dup",
          type: "mystery",
          name: "B",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: {},
        },
      ],
    });
    const validation = schema.validateProfile(profile);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((e) => /Duplicate widget id/.test(e)));
    assert.ok(validation.errors.some((e) => /Unknown widget type/.test(e)));
  });

  it("round-trips portable export shape", () => {
    const migrated = schema.migrateProfile({
      id: "p3",
      name: "Round",
      published: true,
      targetApp: "Notion",
      grid: { cols: 6, rows: 8 },
      widgets: [
        {
          id: "b1",
          type: "button",
          name: "Bold",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["cmd", "b"] },
        },
      ],
    });
    const portable = schema.toPortableProfile(migrated, [
      { id: "style-1", name: "Custom" },
    ]);
    assert.equal(portable.format, "tappilot-profile");
    assert.equal(portable.schemaVersion, 1);
    assert.equal(portable.published, undefined);
    assert.equal(portable._embeddedStyles.length, 1);

    const again = schema.migrateProfile(portable);
    const validation = schema.validateProfile(again);
    assert.equal(validation.ok, true);
    assert.equal(again.targetApp.name, "Notion");
    assert.ok(again.widgets[0].binding.shortcut);
  });

  it("rejects key-style JSON when importing as a profile", () => {
    const result = schema.validateProfileImport({
      name: "Neon Custom",
      key: { bg1: "#000", bg2: "#111" },
      press: { animation: "scale" },
      sound: { kind: "none" },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /key style/i.test(e)));
  });

  it("rejects arrays and non-objects on import", () => {
    assert.equal(schema.validateProfileImport([]).ok, false);
    assert.equal(schema.validateProfileImport("nope").ok, false);
    assert.equal(schema.validateProfileImport(null).ok, false);
  });

  it("validates style imports and rejects profiles", () => {
    const bad = schema.validateStyleImport({
      format: "tappilot-profile",
      name: "Deck",
      widgets: [],
      grid: { cols: 6, rows: 8 },
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /profile/i.test(e)));

    const good = schema.validateStyleImport({
      name: "Custom",
      key: { bg1: "#0e1826" },
      press: { animation: "scale" },
      sound: { kind: "none" },
    });
    assert.equal(good.ok, true);
  });

  it("keeps mouse-button bindings out of the keystroke path", () => {
    const profile = schema.migrateProfile({
      id: "p4",
      name: "Pointer",
      targetApp: "Finder",
      grid: { cols: 2, rows: 2 },
      widgets: [
        {
          id: "m1",
          type: "button",
          name: "Right click",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: {
            kind: "shortcut",
            shortcut: {
              code: "MouseRight",
              key: "right",
              modifiers: ["meta"],
              pointer: "right",
            },
          },
        },
      ],
    });

    assert.equal(schema.validateProfile(profile).ok, true);
    const shortcut = profile.widgets[0].binding.shortcut;
    assert.equal(shortcut.pointer, "right");
    assert.deepEqual(shortcut.modifiers, ["meta"]);
    // A pointer binding must never be flattened into keystroke tokens.
    assert.deepEqual(schema.shortcutToKeys(shortcut), []);
    assert.equal(schema.describeShortcut(shortcut), "cmd+right click");
  });

  it("drops unknown pointer buttons", () => {
    const shortcut = schema.normalizeShortcut({
      code: "MouseSide",
      key: "side",
      modifiers: [],
      pointer: "side",
    });
    assert.equal(shortcut.pointer, undefined);
  });

  it("resolves platform shortcut maps", () => {
    const shortcut = { code: "KeyC", key: "C", modifiers: ["meta"] };
    const map = {
      default: shortcut,
      windows: { code: "KeyC", key: "C", modifiers: ["ctrl"] },
    };
    const win = schema.resolvePlatformShortcut(shortcut, map, "win32");
    assert.deepEqual(win.modifiers, ["ctrl"]);
    const mac = schema.resolvePlatformShortcut(shortcut, map, "darwin");
    assert.deepEqual(mac.modifiers, ["meta"]);
    const keys = schema.shortcutToKeys(win);
    assert.deepEqual(keys, ["ctrl", "c"]);
  });

  it("migrates tabs and assigns orphan widgets to the first tab", () => {
    const migrated = schema.migrateProfile({
      id: "p-tabs",
      name: "Tabbed",
      targetApp: { name: "X" },
      grid: { cols: 6, rows: 8 },
      tabs: [
        { id: "t1", name: "Main", grid: { cols: 4, rows: 4 } },
        { id: "t2", name: "Extra", grid: { cols: 8, rows: 6 } },
      ],
      widgets: [
        {
          id: "w1",
          type: "button",
          name: "On Main",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["a"] },
          tabId: "t1",
        },
        {
          id: "w2",
          type: "button",
          name: "Orphan",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["b"] },
        },
        {
          id: "w3",
          type: "button",
          name: "On Extra",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["c"] },
          tabId: "t2",
        },
      ],
    });
    assert.equal(migrated.tabs.length, 2);
    assert.equal(migrated.widgets[0].tabId, "t1");
    assert.equal(migrated.widgets[1].tabId, "t1");
    assert.equal(migrated.widgets[2].tabId, "t2");
    assert.equal(migrated.tabs[0].grid.cols, 4);
    const validation = schema.validateProfile(migrated);
    assert.equal(validation.ok, true, validation.errors.join("; "));
  });

  it("keeps untabbed profiles valid without tabId", () => {
    const migrated = schema.migrateProfile({
      id: "p-plain",
      name: "Plain",
      targetApp: { name: "X" },
      grid: { cols: 6, rows: 8 },
      widgets: [
        {
          id: "w1",
          type: "button",
          name: "A",
          layout: { x: 0, y: 0, w: 1, h: 1 },
          binding: { kind: "shortcut", keys: ["a"] },
        },
      ],
    });
    assert.deepEqual(migrated.tabs, []);
    assert.equal(migrated.widgets[0].tabId, null);
    assert.equal(schema.validateProfile(migrated).ok, true);
  });

  it("validates widget layout against its tab grid", () => {
    const migrated = schema.migrateProfile({
      id: "p-bounds",
      name: "Bounds",
      targetApp: { name: "X" },
      grid: { cols: 10, rows: 10 },
      tabs: [{ id: "t1", name: "Small", grid: { cols: 2, rows: 2 } }],
      widgets: [
        {
          id: "w1",
          type: "button",
          name: "Too wide",
          layout: { x: 0, y: 0, w: 3, h: 1 },
          binding: { kind: "shortcut", keys: ["a"] },
          tabId: "t1",
        },
      ],
    });
    // migrate clamps w to tab cols
    assert.equal(migrated.widgets[0].layout.w, 2);
    const invalid = {
      ...migrated,
      widgets: [
        {
          ...migrated.widgets[0],
          layout: { x: 0, y: 0, w: 3, h: 1 },
        },
      ],
    };
    const validation = schema.validateProfile(invalid);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((e) => /exceeds grid width/.test(e)));
  });
});
