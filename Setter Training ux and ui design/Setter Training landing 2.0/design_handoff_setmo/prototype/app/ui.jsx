// ===== Shared UI: icons, shell, widgets =====
const { useState, useEffect, useRef } = React;

// --- icon set (stroke) ---
const ICONS = {
  home:   <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  mic:    <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
  chart:  <><path d="M4 19V5M4 19h16"/><path d="M8 16l3-4 3 2 4-6"/></>,
  book:   <><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M18 17H6a2 2 0 0 0-2 2"/></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6M10 16v-2M14 16v-2M8 20h8"/></>,
  team:   <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M15 20a6 6 0 0 1 6-6"/></>,
  card:   <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
  gear:   <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>,
  play:   <path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>,
  arrow:  <path d="M5 12h14M13 6l6 6-6 6"/>,
  check:  <path d="M20 6L9 17l-5-5"/>,
  x:      <path d="M6 6l12 12M18 6L6 18"/>,
  spark:  <path d="M12 3l2 6 6 .5-4.5 4 1.5 6L12 16l-5.5 3.5 1.5-6L3.5 9.5 10 9z"/>,
  bolt:   <path d="M13 2L4 14h7l-1 8 9-12h-7z"/>,
  clock:  <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  flame:  <path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2c0-3 2-5 2-8z"/>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>,
  lock:   <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  video:  <><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4-2v10l-4-2z"/></>,
  doc:    <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 13h5M10 17h5"/></>,
  chat:   <><path d="M4 5h16v11H9l-4 4z"/><path d="M8 10h8M8 13h5"/></>,
  send:   <><path d="M12 20V5M5 12l7-7 7 7"/></>,
  sound:  <><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 0 1 0 8"/></>,
  pause:  <><rect x="7" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/></>,
  building:<><path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16"/><path d="M13 9h6a1 1 0 0 1 1 1v11M4 21h17M7 8h2M7 12h2M7 16h2M16 13h1M16 17h1"/></>,
};
function Icon({ name, size=20, sw=1.8, ...p }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>{ICONS[name]}</svg>;
}

// --- sparkline ---
function Sparkline({ data, w=120, h=40, color="var(--mint)", fill=true }) {
  const max = Math.max(...data), min = Math.min(...data), rng = (max-min)||1;
  const pts = data.map((v,i)=>[ (i/(data.length-1))*w, h-4 - ((v-min)/rng)*(h-8) ]);
  const line = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const area = line+` L ${w} ${h} L 0 ${h} Z`;
  const gid = "sg"+Math.random().toString(36).slice(2,7);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.28"/><stop offset="1" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      {fill && <path d={area} fill={`url(#${gid})`}/>}
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3.2" fill={color}/>
    </svg>
  );
}

// --- circular score ring ---
function Ring({ value, max=5, size=132, stroke=11, label }) {
  const r = (size-stroke)/2, c = 2*Math.PI*r, pct = value/max;
  return (
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399"/><stop offset="1" stopColor="#10b981"/>
        </linearGradient></defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a2e" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#ringg)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c*(1-pct)}
          style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.34,1.56,.64,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",textAlign:"center"}}>
        <div>
          <div className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:size*0.34,lineHeight:1}}>{value}</div>
          {label && <div style={{color:"var(--muted)",fontSize:12,marginTop:2}}>{label}</div>}
        </div>
      </div>
    </div>
  );
}

// --- allowance meter ---
function AllowanceMeter({ a }) {
  const pct = Math.min(100, (a.poolUsed/a.poolTotal)*100);
  const remain = (a.poolTotal - a.poolUsed).toFixed(1);
  const low = pct > 80;
  return (
    <div className={"allow"+(low?" low":"")}>
      <div className="row"><span>Team practice pool</span><b>{remain} hrs left</b></div>
      <div className="bar"><i style={{width:pct+"%"}}></i></div>
      <div className="row" style={{margin:"7px 0 0"}}><span>{a.poolUsed} of {a.poolTotal} hrs used</span><span style={{color:low?"var(--amber)":"var(--mint)"}}>{low?"Running low":"Healthy"}</span></div>
    </div>
  );
}

// --- delta pill ---
function Delta({ v, suffix="" }) {
  if (v === 0) return <span className="muted" style={{fontWeight:700}}>—</span>;
  const up = v > 0;
  return <span className={up?"up":"down"} style={{fontWeight:700,fontSize:13}}>{up?"▲":"▼"} {Math.abs(v).toFixed(1)}{suffix}</span>;
}

// --- sidebar nav ---
const NAV_SETTER = [
  { id:"dashboard", label:"Dashboard", icon:"home" },
  { id:"practice", label:"Practice", icon:"mic" },
  { id:"progress", label:"Progress", icon:"chart" },
  { id:"trainings", label:"Trainings", icon:"book", badge:"2" },
  { id:"coach", label:"Coach", icon:"chat", ai:true },
  { id:"leaderboard", label:"Leaderboard", icon:"trophy" },
];
const NAV_ADMIN = [
  { id:"a_dashboard", label:"Overview", icon:"home" },
  { id:"a_team", label:"Team", icon:"team" },
  { id:"a_catalog", label:"Service catalog", icon:"target" },
  { id:"a_billing", label:"Usage & billing", icon:"card" },
  { id:"a_leaderboard", label:"Leaderboard", icon:"trophy" },
];
const NAV_GROUP = [
  { id:"g_overview", label:"Group overview", icon:"home" },
  { id:"g_offices", label:"Offices", icon:"building" },
  { id:"g_usage", label:"Usage", icon:"card" },
  { id:"g_leaderboard", label:"Leaderboard", icon:"trophy" },
];
const NAV_PLATFORM = [
  { id:"p_practices", label:"Practices", icon:"building" },
  { id:"p_agents", label:"Agents", icon:"mic" },
  { id:"p_catalog", label:"Training catalog", icon:"book" },
  { id:"p_leaderboard", label:"Global leaderboard", icon:"trophy" },
];
function Sidebar({ screen, go }) {
  const D = window.SetMoData;
  const isAdmin = screen.startsWith("a_");
  const isGroup = screen.startsWith("g_");
  const isPlatform = screen.startsWith("p_");
  const NAV = isPlatform ? NAV_PLATFORM : isGroup ? NAV_GROUP : isAdmin ? NAV_ADMIN : NAV_SETTER;
  const user = isPlatform ? D.platformUser : isGroup ? D.groupUser : isAdmin ? D.adminUser : D.user;
  const roleLabel = isPlatform ? "PLATFORM" : isGroup ? "GROUP" : isAdmin ? "ADMIN" : null;
  let cur = screen;
  if (["results","session"].includes(screen)) cur = "practice";
  else if (screen==="coachvoice") cur = "coach";
  else if (screen==="a_setter") cur = "a_team";
  const home = isPlatform ? "p_practices" : isGroup ? "g_overview" : isAdmin ? "a_dashboard" : "dashboard";
  const VIEWS = [["dashboard","Setter","mic"],["a_dashboard","Office","team"],["g_overview","Group","building"],["p_practices","Platform","shield"]];
  const curView = isPlatform ? "p_practices" : isGroup ? "g_overview" : isAdmin ? "a_dashboard" : "dashboard";
  return (
    <aside className="sidebar">
      <button className="sb-logo" onClick={()=>go(home)}><img src="assets/setmo-icon.png" alt="" style={{width:34,height:34,objectFit:"contain"}}/><span>Set<span style={{color:"var(--mint)"}}>Mo</span></span>{roleLabel && <span className="chip" style={{marginLeft:6,padding:"2px 8px",fontSize:10.5,fontFamily:"DM Sans",letterSpacing:".04em"}}>{roleLabel}</span>}</button>
      <nav className="nav">
        {NAV.map(n=>(
          <button key={n.id} className={"nav-i"+(cur===n.id?" on":"")} onClick={()=>go(n.id)}>
            <Icon name={n.icon}/>{n.label}{n.badge && <span className="badge">{n.badge}</span>}{n.ai && <span className="badge" style={{background:"linear-gradient(135deg,#a78bfa,#7c3aed)",color:"#fff"}}>AI</span>}
          </button>
        ))}
      </nav>
      {!isAdmin && !isGroup && !isPlatform && <>
        <div className="sb-sec">Office</div>
        <nav className="nav">
          <button className="nav-i" onClick={()=>go("leaderboard")}><Icon name="team"/>My team</button>
        </nav>
      </>}
      <div className="sb-foot">
        {/* workspace switcher (prototype) */}
        <div className="sb-sec" style={{padding:"4px 8px 8px"}}>Switch workspace</div>
        <div style={{display:"flex",gap:5,background:"var(--s2)",border:"1px solid var(--line)",borderRadius:10,padding:4,marginBottom:12}}>
          {VIEWS.map(([id,lab,ic])=>(
            <button key={id} onClick={()=>go(id)} title={lab} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"7px 2px",borderRadius:7,fontSize:10.5,fontWeight:600,background:curView===id?"var(--grad)":"transparent",color:curView===id?"#fff":"var(--muted)",transition:"all .2s"}}>
              <Icon name={ic} size={15}/>{lab}
            </button>
          ))}
        </div>
        <div className="sb-user">
          <div className="av">{user.initials}</div>
          <div style={{minWidth:0}}>
            <div className="nm">{user.name}</div>
            <div className="rl">{user.role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Icon, Sparkline, Ring, AllowanceMeter, Delta, Sidebar, useState, useEffect, useRef });
