// ===== SetMo mock data =====
window.SetMoData = {
  user: { name: "Sam Carter", first: "Sam", initials: "SC", role: "Appointment Setter", office: "Brightwork Dental", rank: 2 },

  allowance: { used: 1.9, total: 3, poolUsed: 22.4, poolTotal: 36, low: false },

  // eight-skill rubric — universal + service-specific
  skills: [
    { key: "rapport",   name: "Rapport & warmth",   tier: "uni", score: 4.6, prev: 4.2 },
    { key: "listening", name: "Listening & empathy", tier: "uni", score: 4.4, prev: 4.3 },
    { key: "discovery", name: "Discovery — the 'why'", tier: "spc", score: 4.1, prev: 3.6 },
    { key: "painpoint", name: "Pain-point exploration", tier: "spc", score: 3.8, prev: 3.5 },
    { key: "objection", name: "Objection handling",  tier: "uni", score: 4.0, prev: 2.9 },
    { key: "confidence",name: "Confidence & leadership", tier: "uni", score: 4.5, prev: 4.1 },
    { key: "value",     name: "Value building",      tier: "spc", score: 4.8, prev: 4.4 },
    { key: "closing",   name: "Closing the appt",    tier: "uni", score: 4.5, prev: 3.9 },
  ],

  // recent sessions
  sessions: [
    { id: 1, when: "Today · 9:24 AM", persona: "Skeptical comparison shopper", service: "Implants", dur: "8:42", score: 4.6, delta: +0.7 },
    { id: 2, when: "Yesterday · 4:10 PM", persona: "Anxious first-timer", service: "Implants", dur: "6:18", score: 3.9, delta: +0.3 },
    { id: 3, when: "Mon · 11:02 AM", persona: "Price-driven, guarded", service: "Implants", dur: "9:55", score: 3.6, delta: -0.2 },
    { id: 4, when: "Fri · 2:47 PM", persona: "Warm but busy", service: "Implants", dur: "5:33", score: 3.8, delta: +0.5 },
  ],

  // results breakdown for the just-finished session
  lastResult: {
    score: 4.6, prev: 3.9, persona: "Skeptical comparison shopper", service: "Implants / full-arch", dur: "8:42",
    headline: "Strong rep. You turned a price objection into a booked consult — that's the whole game.",
    skills: [
      { name: "Rapport & warmth", tier: "uni", score: 4.6 },
      { name: "Listening & empathy", tier: "uni", score: 4.4 },
      { name: "Discovery — the 'why'", tier: "spc", score: 4.1 },
      { name: "Pain-point exploration", tier: "spc", score: 3.8 },
      { name: "Objection handling", tier: "uni", score: 4.0 },
      { name: "Confidence & leadership", tier: "uni", score: 4.5 },
      { name: "Value building", tier: "spc", score: 4.8 },
      { name: "Closing the appt", tier: "uni", score: 4.5 },
    ],
    wins: [
      "Named the $40k competing quote head-on instead of dodging it — built instant trust.",
      "Tied the full-arch outcome to her daughter's wedding. That's emotional discovery done right.",
    ],
    misses: [
      "You let the 'I need to think about it' sit for 6 seconds before responding.",
      "Missed a chance to explore why she's been putting off treatment for two years.",
    ],
    phrases: [
      { from: "\"We're a bit more expensive, but worth it.\"", to: "\"Can I show you exactly what that difference buys you over the next 20 years?\"" },
      { from: "\"Okay, take your time.\"", to: "\"What's the one thing you'd need to feel sure about to move forward today?\"" },
    ],
    rec: { skill: "Pain-point exploration", score: 3.8, why: "your pain-point score has sat under 4.0 for three sessions", training: "Uncovering the real 'why' behind a delay", mins: 12 },
    nextScenario: "The 'I'll call you back' ghost — a lead who's warm but keeps slipping away.",
  },

  // progress trend (last 8 sessions, overall)
  trend: [3.2, 3.5, 3.4, 3.8, 3.9, 3.6, 3.9, 4.6],
  trendObjection: [2.4, 2.6, 2.9, 2.8, 3.1, 3.0, 2.9, 4.0],

  // office leaderboard
  leaderboard: [
    { rank: 1, name: "Jordan Reyes", sub: "Brightwork Dental", initials: "JR", score: 4.8, move: +2, spark: [3,4,3,5,4,5,6,6], me:false, top:true },
    { rank: 2, name: "You (Sam Carter)", sub: "Brightwork Dental", initials: "SC", score: 4.6, move: +3, spark: [2,3,3,4,4,3,4,6], me:true },
    { rank: 3, name: "Maya Khan", sub: "Brightwork Dental", initials: "MK", score: 4.5, move: 0, spark: [4,4,5,4,5,4,5,5], me:false },
    { rank: 4, name: "Theo Davis", sub: "Brightwork Dental", initials: "TD", score: 4.2, move: +1, spark: [3,3,4,3,4,4,4,5], me:false },
    { rank: 5, name: "Priya Anand", sub: "Brightwork Dental", initials: "PA", score: 4.0, move: -1, spark: [4,5,4,4,3,4,3,4], me:false },
    { rank: 6, name: "Marcus Hill", sub: "Brightwork Dental", initials: "MH", score: 3.7, move: 0, spark: [2,3,3,3,4,3,4,4], me:false },
  ],

  // service types for the picker
  services: [
    { key:"implant", name:"Implants & full-arch", desc:"High-ticket reconstructive cases — the flagship call.", live:true, skills:8, value:"$25k–45k", icon:"implant" },
    { key:"denture", name:"Dentures & snap-in", desc:"Removable and implant-retained denture conversations.", live:true, skills:8, value:"$3k–12k", icon:"denture" },
    { key:"cosmetic", name:"Cosmetic & veneers", desc:"Smile-makeover, vision-casting led calls.", live:false, skills:7, value:"$8k–30k", icon:"cosmetic" },
    { key:"ortho", name:"Ortho & Invisalign", desc:"Aligner and braces consult booking.", live:false, skills:7, value:"$4k–7k", icon:"ortho" },
    { key:"wisdom", name:"Wisdom teeth", desc:"Surgical extraction scheduling.", live:false, skills:6, value:"$1k–3k", icon:"wisdom" },
    { key:"general", name:"General & hygiene", desc:"New-patient and recall booking fundamentals.", live:false, skills:6, value:"varies", icon:"general" },
  ],

  // ===== Phase-2 coaching content =====
  videos: [
    { id:1, title:"Turning price objections into consults", mins:9, skill:"Objection handling", why:"price pushback tripped you up in 2 of your last 4 calls", status:"new", thumb:"linear-gradient(135deg,#7c3aed,#4c1d95)", drop:"Dropped today" },
    { id:2, title:"Uncovering the real 'why' behind a delay", mins:12, skill:"Pain-point exploration", why:"your pain-point score has sat under 4.0 for three sessions", status:"start", progress:0, thumb:"linear-gradient(135deg,#8b5cf6,#6d28d9)" },
    { id:3, title:"The first 20 seconds: building instant rapport", mins:7, skill:"Rapport & warmth", why:"keeps your strongest skill sharp", status:"done", progress:100, thumb:"linear-gradient(135deg,#10b981,#065f46)" },
    { id:4, title:"Confident framing of high-ticket cases", mins:11, skill:"Confidence & leadership", why:"queued from your improving confidence trend", status:"locked", unlock:"Unlocks Thu", thumb:"linear-gradient(135deg,#3a3650,#1a1a2e)" },
    { id:5, title:"Closing without pressure", mins:10, skill:"Closing", why:"reinforce the move that booked your last consult", status:"start", progress:35, thumb:"linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id:6, title:"Handling 'I need to talk to my spouse'", mins:8, skill:"Objection handling", why:"a common stall you'll meet on full-arch calls", status:"locked", unlock:"Unlocks Sat", thumb:"linear-gradient(135deg,#3a3650,#1a1a2e)" },
  ],
  workbooks: [
    { id:1, title:"The Implant Consult Playbook", pages:24, done:8, desc:"Scripts, discovery questions, and objection maps for full-arch calls.", tag:"Core" },
    { id:2, title:"Objection Handling Field Guide", pages:16, done:16, desc:"The 12 objections you'll hear most — and the language that turns each one.", tag:"Objections" },
    { id:3, title:"Discovery Question Bank", pages:12, done:0, desc:"Open-ended prompts that surface the real 'why' fast.", tag:"Discovery" },
  ],
  coachStarters: [
    "How do I respond to \u201cI need to think about it\u201d?",
    "Help me sound confident quoting $40k",
    "They were quoted cheaper elsewhere — what do I say?",
    "Give me a warmer opening line",
  ],
  coachWelcome: "Hey Sam 👋 I'm your SetMo coach. I saw your last call — nice work turning that price objection around. Want to sharpen how you handle the \u201cI need to think about it\u201d stall, or work on something else? Ask me anything, or tap a starter below.",

  // ===== Office Admin =====
  adminUser: { name:"Dr. Lena Okafor", initials:"LO", role:"Office Admin", office:"Brightwork Dental" },
  practice: {
    name:"Brightwork Dental", city:"Austin, TX",
    offer:"$500 off full-arch · free consult", framing:"Free 30-minute implant consultation",
    deposit:"No deposit required to book",
  },
  team: [
    { id:"jr", name:"Jordan Reyes", initials:"JR", avg:4.8, delta:+0.2, usage:4.1, sessions:18, last:"12m ago", rec:"On track — sharpen closing", recSkill:"Closing", trend:[4.2,4.4,4.3,4.6,4.5,4.7,4.8], status:"top" },
    { id:"sc", name:"Sam Carter", initials:"SC", avg:4.6, delta:+0.7, usage:3.1, sessions:24, last:"Today", rec:"Pain-point exploration under 4.0", recSkill:"Pain-point", trend:[3.2,3.5,3.4,3.8,3.9,3.6,4.6], status:"rising" },
    { id:"mk", name:"Maya Khan", initials:"MK", avg:4.5, delta:0, usage:2.8, sessions:15, last:"1h ago", rec:"Deepen discovery questions", recSkill:"Discovery", trend:[4.4,4.5,4.4,4.5,4.5,4.4,4.5], status:"steady" },
    { id:"td", name:"Theo Davis", initials:"TD", avg:4.2, delta:+0.3, usage:2.2, sessions:11, last:"Yesterday", rec:"Objection handling reps", recSkill:"Objections", trend:[3.6,3.8,3.9,4.0,4.1,4.0,4.2], status:"rising" },
    { id:"pa", name:"Priya Anand", initials:"PA", avg:4.0, delta:-0.1, usage:1.5, sessions:9, last:"2d ago", rec:"Confidence framing on price", recSkill:"Confidence", trend:[4.2,4.1,4.0,4.1,4.0,4.1,4.0], status:"watch" },
    { id:"mh", name:"Marcus Hill", initials:"MH", avg:3.7, delta:+0.4, usage:0.9, sessions:6, last:"3d ago", rec:"Rapport in first 20 seconds", recSkill:"Rapport", trend:[3.0,3.2,3.3,3.4,3.5,3.6,3.7], status:"new" },
  ],
  billing: {
    seats:12, filled:12, cadence:"monthly", pricePerSeat:59.99, discount:0.10, discountLabel:"10% volume discount (10–14 seats)",
    nextInvoice:"Jul 1, 2026", nextAmount:"$647.89",
    invoices:[
      { date:"Jun 1, 2026", amt:"$647.89", desc:"12 seats · monthly", status:"Paid" },
      { date:"May 12, 2026", amt:"$89.00", desc:"+10 hr conversation bundle", status:"Paid" },
      { date:"May 1, 2026", amt:"$647.89", desc:"12 seats · monthly", status:"Paid" },
      { date:"Apr 1, 2026", amt:"$539.91", desc:"9 seats · monthly", status:"Paid" },
    ],
    bundles:[
      { hrs:5, price:49 },
      { hrs:10, price:89, popular:true },
      { hrs:20, price:159 },
    ],
  },

  // ===== Group / DSO =====
  groupUser: { name:"Marcus Webb", initials:"MW", role:"Group Admin", group:"Meridian DSO" },
  group: {
    name:"Meridian DSO", offices:5, setters:38, avg:4.3, globalRank:2, poolUsed:96.5, poolTotal:138,
  },
  offices: [
    { id:"o1", name:"Brightwork Dental", city:"Austin, TX", setters:12, avg:4.3, delta:+0.4, usage:22.4, pool:36, rank:1, trend:[3.9,4.0,4.1,4.0,4.2,4.2,4.3], status:"top" },
    { id:"o2", name:"Lakeside Implants", city:"Tucson, AZ", setters:9, avg:4.5, delta:+0.2, usage:19.1, pool:27, rank:1, trend:[4.2,4.3,4.3,4.4,4.4,4.5,4.5], status:"top" },
    { id:"o3", name:"Apex Oral Care", city:"Denver, CO", setters:8, avg:4.1, delta:+0.3, usage:14.8, pool:24, rank:3, trend:[3.6,3.8,3.9,4.0,4.0,4.0,4.1], status:"rising" },
    { id:"o4", name:"Coastal Smiles", city:"Tampa, FL", setters:6, avg:3.8, delta:-0.1, usage:8.2, pool:18, rank:4, trend:[4.0,3.9,3.9,3.8,3.9,3.8,3.8], status:"watch" },
    { id:"o5", name:"Summit Dental Co.", city:"Boise, ID", setters:3, avg:3.6, delta:+0.5, usage:3.0, pool:9, rank:5, trend:[2.9,3.1,3.2,3.3,3.4,3.5,3.6], status:"new" },
  ],

  // invite / account setup
  invite: { office:"Brightwork Dental", inviter:"Dr. Lena Okafor", email:"newsetter@brightworkdental.com", role:"Appointment Setter" },

  // ===== Platform Admin (Grow Dental internal) =====
  platformUser: { name:"Riley Chen", initials:"RC", role:"Platform Admin", org:"Grow Dental AI" },
  platform: { practices:42, groups:6, setters:418, sessionsMonth:"9.2k", mrr:"$28.4k", poolHours:"1,254" },
  practices: [
    { id:"p1", name:"Brightwork Dental", org:"Meridian DSO", city:"Austin, TX", seats:12, avg:4.3, plan:"Monthly", mrr:"$648", status:"active" },
    { id:"p2", name:"Lakeside Implants", org:"Meridian DSO", city:"Tucson, AZ", seats:9, avg:4.5, plan:"Quarterly", mrr:"$461", status:"active" },
    { id:"p3", name:"Apex Oral Care", org:"Meridian DSO", city:"Denver, CO", seats:8, avg:4.1, plan:"Monthly", mrr:"$432", status:"active" },
    { id:"p4", name:"Coastal Smiles", org:"Independent", city:"Tampa, FL", seats:6, avg:3.8, plan:"Monthly", mrr:"$324", status:"active" },
    { id:"p5", name:"Summit Dental Co.", org:"Meridian DSO", city:"Boise, ID", seats:3, avg:3.6, plan:"Monthly", mrr:"$162", status:"new" },
    { id:"p6", name:"Harbor Family Dental", org:"Independent", city:"Portland, OR", seats:5, avg:0, plan:"Trial", mrr:"$0", status:"trial" },
    { id:"p7", name:"Vista Dental Group", org:"Vista DSO", city:"San Diego, CA", seats:18, avg:4.2, plan:"Quarterly", mrr:"$917", status:"active" },
  ],
  agents: [
    { id:"impl", name:"Implant / full-arch / denture", short:"Implants", status:"live", version:"v1.4", skills:8, personas:18, sessions:"6.2k", note:"Reference rubric — the flagship call." },
    { id:"cosm", name:"Cosmetic & veneers", short:"Cosmetic", status:"draft", version:"v0.3", skills:7, personas:6, sessions:"—", note:"Vision-casting module in progress." },
    { id:"orth", name:"Ortho & Invisalign", short:"Ortho", status:"planned", version:"—", skills:7, personas:0, sessions:"—", note:"Queued behind cosmetic." },
    { id:"wisd", name:"Wisdom teeth", short:"Wisdom teeth", status:"planned", version:"—", skills:6, personas:0, sessions:"—", note:"Surgical scheduling persona set." },
    { id:"genl", name:"General & hygiene", short:"General", status:"planned", version:"—", skills:6, personas:0, sessions:"—", note:"New-patient & recall fundamentals." },
  ],
  catalogItems: [
    { id:"c1", title:"Turning price objections into consults", type:"Video", mins:9, skill:"Objection handling", status:"Published", recs:128 },
    { id:"c2", title:"Uncovering the real 'why' behind a delay", type:"Video", mins:12, skill:"Pain-point exploration", status:"Published", recs:96 },
    { id:"c3", title:"The first 20 seconds: building rapport", type:"Video", mins:7, skill:"Rapport & warmth", status:"Published", recs:74 },
    { id:"c4", title:"Confident framing of high-ticket cases", type:"Video", mins:11, skill:"Confidence & leadership", status:"Published", recs:51 },
    { id:"c5", title:"The Implant Consult Playbook", type:"Workbook", mins:24, skill:"Multiple", status:"Published", recs:212 },
    { id:"c6", title:"Objection Handling Field Guide", type:"Workbook", mins:16, skill:"Objection handling", status:"Published", recs:140 },
    { id:"c7", title:"Closing without pressure", type:"Video", mins:10, skill:"Closing", status:"Draft", recs:0 },
    { id:"c8", title:"Re-engaging a ghosting lead", type:"Video", mins:8, skill:"Discovery", status:"Draft", recs:0 },
  ],
};
