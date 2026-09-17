import { keysToShortcut } from "./shortcuts";
import type { ButtonWidget, Profile, Widget } from "./types";

export type SampleProfileId =
  | "figma"
  | "photoshop"
  | "blender"
  | "vscode";

export type SampleProfile = {
  id: SampleProfileId;
  name: string;
  appName: string;
  description: string;
  icon: string;
  accent: string;
  controls: string[];
  targetApp: Profile["targetApp"];
};

const shortcut = (keys: string[]) => keysToShortcut(keys);

const button = (
  id: string,
  name: string,
  icon: string,
  keys: string[],
  x: number,
  y: number
): ButtonWidget => ({
  id,
  name,
  icon,
  iconImage: null,
  type: "button",
  layout: { x, y, w: 1, h: 1 },
  binding: { kind: "shortcut", shortcut: shortcut(keys) },
});

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    id: "figma",
    name: "Figma · Canvas",
    appName: "Figma",
    description: "A quick canvas deck for selecting, framing, commenting, and duplicating.",
    icon: "lucide:pen-tool",
    accent: "#f27d6b",
    controls: ["Select", "Frame", "Comment", "Duplicate"],
    targetApp: {
      name: "Figma",
      platforms: {
        macos: { bundleId: "com.figma.Desktop" },
        windows: { processName: "Figma.exe" },
      },
    },
  },
  {
    id: "photoshop",
    name: "Photoshop · Retouch",
    appName: "Adobe Photoshop",
    description: "A focused retouching surface for common tool switches and view controls.",
    icon: "lucide:brush",
    accent: "#31a7ed",
    controls: ["Move", "Brush", "Eraser", "Fit view"],
    targetApp: {
      name: "Photoshop",
      platforms: {
        macos: { bundleId: "com.adobe.Photoshop" },
        windows: { processName: "Photoshop.exe" },
      },
    },
  },
  {
    id: "blender",
    name: "Blender · Modeling",
    appName: "Blender",
    description: "Keep transform and mode controls within a single thumb-friendly grid.",
    icon: "lucide:box",
    accent: "#ea7b3c",
    controls: ["Move", "Rotate", "Scale", "Edit mode"],
    targetApp: {
      name: "Blender",
      platforms: {
        macos: { bundleId: "org.blenderfoundation.blender" },
        windows: { processName: "blender.exe" },
        linux: { processName: "blender" },
      },
    },
  },
  {
    id: "vscode",
    name: "VS Code · Flow",
    appName: "Visual Studio Code",
    description: "A compact coding deck for navigation, search, panels, and saving work.",
    icon: "lucide:code-2",
    accent: "#50a8ef",
    controls: ["Quick open", "Search", "Explorer", "Save"],
    targetApp: {
      name: "Code",
      platforms: {
        macos: { bundleId: "com.microsoft.VSCode" },
        windows: { processName: "Code.exe" },
        linux: { processName: "code" },
      },
    },
  },
];

export function getSampleProfile(id: SampleProfileId): SampleProfile {
  const sample = SAMPLE_PROFILES.find((item) => item.id === id);
  if (!sample) throw new Error("Unknown starter profile.");
  return sample;
}

function coverFor(sample: SampleProfile) {
  const letter = sample.appName.slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10192a"/><stop offset="1" stop-color="${sample.accent}"/></linearGradient></defs>
    <rect width="192" height="192" rx="42" fill="url(#g)"/>
    <path d="M25 145C57 112 70 159 105 130s43-60 72-36" fill="none" stroke="white" stroke-opacity=".26" stroke-width="8" stroke-linecap="round"/>
    <rect x="47" y="42" width="98" height="98" rx="29" fill="#07101f" fill-opacity=".36" stroke="white" stroke-opacity=".3"/>
    <text x="96" y="111" text-anchor="middle" font-family="Arial, sans-serif" font-size="68" font-weight="700" fill="white">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function widgetsFor(sample: SampleProfileId): Widget[] {
  switch (sample) {
    case "figma":
      return [
        button("select", "Select", "lucide:mouse-pointer-2", ["v"], 0, 0),
        button("frame", "Frame", "lucide:frame", ["f"], 1, 0),
        button("comment", "Comment", "lucide:message-circle", ["c"], 2, 0),
        button("duplicate", "Duplicate", "lucide:copy", ["cmd", "d"], 3, 0),
        button("zoom-in", "Zoom in", "lucide:zoom-in", ["cmd", "="], 0, 1),
        button("zoom-out", "Zoom out", "lucide:zoom-out", ["cmd", "-"], 1, 1),
        button("hand", "Hand", "lucide:hand", ["h"], 2, 1),
        button("resources", "Resources", "lucide:shapes", ["shift", "i"], 3, 1),
      ];
    case "photoshop":
      return [
        button("move", "Move", "lucide:move", ["v"], 0, 0),
        button("brush", "Brush", "lucide:brush", ["b"], 1, 0),
        button("eraser", "Eraser", "lucide:eraser", ["e"], 2, 0),
        button("undo", "Undo", "lucide:undo-2", ["cmd", "z"], 3, 0),
        button("save", "Save", "lucide:save", ["cmd", "s"], 0, 1),
        button("fit", "Fit view", "lucide:maximize", ["cmd", "0"], 1, 1),
        button("zoom-in", "Zoom in", "lucide:zoom-in", ["cmd", "="], 2, 1),
        button("zoom-out", "Zoom out", "lucide:zoom-out", ["cmd", "-"], 3, 1),
      ];
    case "blender":
      return [
        button("move", "Move", "lucide:move", ["g"], 0, 0),
        button("rotate", "Rotate", "lucide:rotate-cw", ["r"], 1, 0),
        button("scale", "Scale", "lucide:maximize-2", ["s"], 2, 0),
        button("select", "Select all", "lucide:mouse-pointer-2", ["a"], 3, 0),
        button("edit", "Edit mode", "lucide:split-square-vertical", ["tab"], 0, 1),
        button("undo", "Undo", "lucide:undo-2", ["cmd", "z"], 1, 1),
        button("redo", "Redo", "lucide:redo-2", ["cmd", "shift", "z"], 2, 1),
        button("save", "Save", "lucide:save", ["cmd", "s"], 3, 1),
      ];
    case "vscode":
      return [
        button("quick-open", "Quick open", "lucide:search", ["cmd", "p"], 0, 0),
        button("command", "Command", "lucide:terminal-square", ["cmd", "shift", "p"], 1, 0),
        button("explorer", "Explorer", "lucide:folder", ["cmd", "shift", "e"], 2, 0),
        button("search", "Search", "lucide:search-code", ["cmd", "shift", "f"], 3, 0),
        button("save", "Save", "lucide:save", ["cmd", "s"], 0, 1),
        button("format", "Format", "lucide:wand-sparkles", ["shift", "alt", "f"], 1, 1),
        button("go-line", "Go to line", "lucide:map-pin", ["ctrl", "g"], 2, 1),
        button("problems", "Problems", "lucide:circle-alert", ["cmd", "shift", "m"], 3, 1),
      ];
  }
}

/** Turn a newly-created local profile into an editable, unpublished starter deck. */
export function applySampleProfile(
  profile: Profile,
  sampleId: SampleProfileId
): Profile {
  const sample = getSampleProfile(sampleId);
  return {
    ...profile,
    name: sample.name,
    description: `${sample.description} Starter profile — review shortcuts before using.`,
    targetApp: sample.targetApp,
    image: coverFor(sample),
    execution: { targetMode: "only-if-active", showInactiveWarning: true },
    grid: { cols: 4, rows: 2 },
    tabs: [],
    published: false,
    widgets: widgetsFor(sampleId),
  };
}
