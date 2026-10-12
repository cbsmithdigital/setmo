// The phone tab bar: each role's four most-used screens sit at the bottom of the
// screen (thumb reach), and everything else stays in the menu behind "More".
// Shared by the layout (which leaves room for the bar) and the sidebar (which
// draws it). A role with fewer than two tabs gets no bar — just the menu.

const SETTER_TABS = ["/dashboard", "/practice", "/progress", "/coach"];

export const TABS_BY_ROLE: Record<string, string[]> = {
  SETTER: SETTER_TABS,
  OFFICE_ADMIN: ["/office", "/office/team", "/office/live", "/coach"],
  GROUP_ADMIN: ["/group", "/group/performance", "/office/live", "/coach"],
  MULTI_PRACTICE_ADMIN: ["/group", "/group/performance", "/office/live", "/coach"],
  CALL_CENTER_ADMIN: ["/callcenter", "/callcenter/team", "/callcenter/live", "/coach"],
  CALL_CENTER_MANAGER: ["/callcenter", "/callcenter/team", "/callcenter/live", "/coach"],
  PARTNER_ADMIN: ["/partner", "/partner/team"],
  PLATFORM_ADMIN: ["/platform", "/platform/accounts", "/platform/trainings", "/platform/partners"],
  SUPPORT: ["/platform", "/platform/accounts", "/platform/trainings", "/platform/partners"],
};

/** Shorter names where the menu's label is too long for a tab. */
export const TAB_LABEL: Record<string, string> = {
  "/dashboard": "Home",
  "/office": "Home",
  "/callcenter": "Home",
  "/partner": "Home",
  "/office/team": "Team",
  "/callcenter/team": "Team",
  "/partner/team": "Team",
  "/office/live": "Live calls",
  "/callcenter/live": "Live calls",
  "/coach": "Setty",
};

/** The tab hrefs for this person (call-center agents get the setter's). */
export function tabsFor(role: string, isAgent = false): string[] {
  const tabs = isAgent ? SETTER_TABS : TABS_BY_ROLE[role] ?? [];
  return tabs.length >= 2 ? tabs : [];
}
