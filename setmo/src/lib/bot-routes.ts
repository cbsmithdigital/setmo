// Public form endpoints that get Vercel BotID's invisible bot check. The browser
// list (instrumentation-client) and the server checks must name the same routes:
// a route checked on the server but missing here would refuse real people.
export const BOT_CHECKED_ROUTES: { path: string; method: "POST" }[] = [
  { path: "/api/audit", method: "POST" }, // start a free assessment (emails a verify link)
  { path: "/api/audit/*/invite", method: "POST" }, // send the assessment to a setter
  { path: "/api/auth/signup", method: "POST" },
  { path: "/api/auth/request-reset", method: "POST" },
  { path: "/api/auth/request-setup", method: "POST" },
  { path: "/api/partners/apply", method: "POST" },
];
