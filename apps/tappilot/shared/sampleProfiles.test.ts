import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  applySampleProfile,
  SAMPLE_PROFILES,
} from "./sampleProfiles";
import {
  CURRENT_SCHEMA_VERSION,
  emptyTargetApp,
  PROFILE_FORMAT,
  type Profile,
} from "./types";

const require = createRequire(import.meta.url);
const { validateProfile } = require("../electron/profileSchema.cjs") as {
  validateProfile: (profile: unknown) => { ok: boolean; errors: string[] };
};

const baseProfile = (): Profile => ({
  format: PROFILE_FORMAT,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: "fresh-id",
  name: "Untitled Profile",
  description: "",
  targetApp: emptyTargetApp(),
  execution: { targetMode: "activate-target-app", showInactiveWarning: true },
  image: null,
  grid: { cols: 6, rows: 8 },
  tabs: [],
  published: false,
  updatedAt: "2026-09-16T00:00:00.000Z",
  widgets: [],
});

describe("TapPilot starter profiles", () => {
  it.each(SAMPLE_PROFILES)("builds an editable %s starter", (sample) => {
    const profile = applySampleProfile(baseProfile(), sample.id);
    expect(profile.name).toBe(sample.name);
    expect(profile.targetApp).toEqual(sample.targetApp);
    expect(profile.execution.targetMode).toBe("only-if-active");
    expect(profile.published).toBe(false);
    expect(profile.grid).toEqual({ cols: 4, rows: 2 });
    expect(profile.widgets).toHaveLength(8);
    expect(new Set(profile.widgets.map((widget) => widget.id)).size).toBe(8);
    expect(validateProfile(profile)).toEqual({ ok: true, errors: [] });

    for (const widget of profile.widgets) {
      if (widget.type !== "button") throw new Error("Starter widgets must be buttons.");
      expect(widget.binding.kind).toBe("shortcut");
      expect(widget.binding.shortcut).not.toBeNull();
      expect(widget.layout.x + widget.layout.w).toBeLessThanOrEqual(profile.grid.cols);
      expect(widget.layout.y + widget.layout.h).toBeLessThanOrEqual(profile.grid.rows);
    }
  });
});
