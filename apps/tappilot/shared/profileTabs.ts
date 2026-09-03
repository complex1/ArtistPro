import {
  DEFAULT_GRID,
  MAX_PROFILE_TABS,
  type Profile,
  type ProfileGrid,
  type ProfileTab,
  type Widget,
} from "./types";

export { MAX_PROFILE_TABS };

export function profileTabs(profile: Pick<Profile, "tabs">): ProfileTab[] {
  return Array.isArray(profile.tabs) ? profile.tabs : [];
}

/** Widgets on a specific tab, or untabbed widgets when `tabId` is null. */
export function widgetsForTab(
  widgets: Widget[],
  tabId: string | null
): Widget[] {
  if (!tabId) return widgets.filter((w) => !w.tabId);
  return widgets.filter((w) => w.tabId === tabId);
}

/** Grid for a tab, falling back to the profile default grid. */
export function resolveGrid(
  profile: Pick<Profile, "grid" | "tabs">,
  tabId?: string | null
): ProfileGrid {
  if (tabId) {
    const tab = profileTabs(profile).find((t) => t.id === tabId);
    if (tab?.grid) {
      return {
        cols: Math.max(1, tab.grid.cols || DEFAULT_GRID.cols),
        rows: Math.max(1, tab.grid.rows || DEFAULT_GRID.rows),
      };
    }
  }
  return {
    cols: Math.max(1, profile.grid?.cols || DEFAULT_GRID.cols),
    rows: Math.max(1, profile.grid?.rows || DEFAULT_GRID.rows),
  };
}

/**
 * Active deck for editing/playback.
 * - No tabs → all widgets + profile.grid
 * - With tabs → widgets for `activeTabId` (or first tab) + that tab's grid
 */
export function resolveActiveDeck(
  profile: Profile,
  activeTabId?: string | null
): { tabId: string | null; tab: ProfileTab | null; grid: ProfileGrid; widgets: Widget[] } {
  const tabs = profileTabs(profile);
  if (tabs.length === 0) {
    return {
      tabId: null,
      tab: null,
      grid: resolveGrid(profile, null),
      widgets: profile.widgets,
    };
  }
  const tab =
    (activeTabId && tabs.find((t) => t.id === activeTabId)) || tabs[0];
  return {
    tabId: tab.id,
    tab,
    grid: resolveGrid(profile, tab.id),
    widgets: widgetsForTab(profile.widgets, tab.id),
  };
}
