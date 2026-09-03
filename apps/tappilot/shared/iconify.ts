import { addCollection } from "@iconify/react";
import lucideIcons from "@iconify-json/lucide/icons.json";

let lucideReady = false;
let mdiReady = false;

/** Register Lucide offline (used by editor chrome + phone remote). */
export function ensureIconifyCollections() {
  if (lucideReady) return;
  addCollection(lucideIcons as Parameters<typeof addCollection>[0]);
  lucideReady = true;
}

/**
 * Material Design Icons is large (~3MB). Load it only in the desktop
 * icon picker so the phone remote stay lean.
 */
export async function ensureMdiCollection() {
  if (mdiReady) return;
  const mdiIcons = await import("@iconify-json/mdi/icons.json");
  addCollection(
    (mdiIcons.default || mdiIcons) as Parameters<typeof addCollection>[0]
  );
  mdiReady = true;
}

export const DEFAULT_ICONIFY_ID = "lucide:keyboard";

/** Popular starters shown when the search box is empty. */
export const FEATURED_ICONS: string[] = [
  "lucide:keyboard",
  "lucide:mouse-pointer-2",
  "lucide:hand",
  "lucide:volume-2",
  "lucide:play",
  "lucide:pause",
  "lucide:square",
  "lucide:circle",
  "lucide:triangle",
  "lucide:zap",
  "lucide:star",
  "lucide:heart",
  "lucide:home",
  "lucide:settings",
  "lucide:search",
  "lucide:brush",
  "lucide:pen-tool",
  "lucide:layers",
  "lucide:image",
  "lucide:film",
  "lucide:music",
  "lucide:mic",
  "lucide:camera",
  "lucide:code",
  "lucide:terminal",
  "lucide:folder",
  "lucide:file",
  "lucide:copy",
  "lucide:clipboard",
  "lucide:undo-2",
  "lucide:redo-2",
  "lucide:save",
  "lucide:trash-2",
  "lucide:plus",
  "lucide:minus",
  "lucide:check",
  "lucide:x",
  "lucide:arrow-up",
  "lucide:arrow-down",
  "lucide:arrow-left",
  "lucide:arrow-right",
  "mdi:cursor-default-click",
  "mdi:gesture-tap",
  "mdi:gesture-swipe",
  "mdi:mouse",
  "mdi:keyboard",
  "mdi:palette",
  "mdi:brush",
  "mdi:pencil",
  "mdi:eraser",
  "mdi:format-color-fill",
  "mdi:vector-square",
  "mdi:shape",
  "mdi:cube-outline",
  "mdi:gamepad-variant",
  "mdi:controller-classic",
  "mdi:youtube",
  "mdi:spotify",
  "mdi:discord",
  "mdi:slack",
  "mdi:figma",
  "mdi:blender-software",
  "mdi:adobe",
];

export const ICON_COLLECTIONS = [
  { id: "", label: "All" },
  { id: "lucide", label: "Lucide" },
  { id: "mdi", label: "Material" },
  { id: "tabler", label: "Tabler" },
  { id: "ph", label: "Phosphor" },
  { id: "heroicons", label: "Heroicons" },
  { id: "fa6-solid", label: "Font Awesome" },
] as const;

/**
 * Map legacy Lucide React names (`Trash2`, `EllipsisVertical`) to Iconify ids
 * (`lucide:trash-2`). Already-qualified ids pass through.
 */
export function toIconifyId(name?: string | null): string {
  const raw = (name || "").trim();
  if (!raw) return DEFAULT_ICONIFY_ID;
  if (raw.includes(":")) return raw;
  const kebab = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
  return `lucide:${kebab}`;
}

export type IconSearchHit = {
  id: string;
  prefix: string;
  name: string;
};

/**
 * Search the public Iconify API (200k+ icons). Falls back to the featured
 * offline list when the network is unavailable.
 */
export async function searchIconify(
  query: string,
  opts: { limit?: number; prefix?: string } = {}
): Promise<IconSearchHit[]> {
  const limit = opts.limit ?? 96;
  const q = query.trim();
  if (!q) {
    return FEATURED_ICONS.filter(
      (id) => !opts.prefix || id.startsWith(`${opts.prefix}:`)
    )
      .slice(0, limit)
      .map(parseHit);
  }

  try {
    const url = new URL("https://api.iconify.design/search");
    url.searchParams.set("query", q);
    url.searchParams.set("limit", String(limit));
    if (opts.prefix) url.searchParams.set("prefix", opts.prefix);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Iconify search failed (${res.status})`);
    const data = (await res.json()) as { icons?: string[] };
    return (data.icons || []).map(parseHit);
  } catch {
    const lower = q.toLowerCase();
    return FEATURED_ICONS.filter((id) => {
      if (opts.prefix && !id.startsWith(`${opts.prefix}:`)) return false;
      return id.toLowerCase().includes(lower);
    })
      .slice(0, limit)
      .map(parseHit);
  }
}

function parseHit(id: string): IconSearchHit {
  const [prefix, ...rest] = id.split(":");
  return { id, prefix, name: rest.join(":") };
}

/** Fetch an SVG and return a data URL suitable for `iconImage`. */
export async function fetchIconDataUrl(iconId: string): Promise<string> {
  const id = toIconifyId(iconId);
  const [prefix, ...rest] = id.split(":");
  const name = rest.join(":");
  const res = await fetch(
    `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`
  );
  if (!res.ok) {
    throw new Error(`Could not download icon "${id}"`);
  }
  const svg = await res.text();
  // Left verbatim: monochrome sets keep `currentColor` so AppIcon can tint
  // them with the key style, and multi-color sets keep their own palette.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
