// ===== App router =====
function App() {
  const [screen, setScreen] = useState(()=>localStorage.getItem("setmo.screen")||"login");
  const go = (s)=>{ setScreen(s); try{localStorage.setItem("setmo.screen",s);}catch(e){} window.scrollTo&&window.scrollTo(0,0); };

  // fullscreen (no sidebar) screens
  const full = screen==="login" || screen==="session" || screen==="coachvoice" || screen==="invite_setup";

  const SCREENS = {
    login: Login, dashboard: Dashboard, practice: ServicePicker, session: LiveSession,
    results: Results, progress: Progress, leaderboard: Leaderboard, trainings: Trainings,
    coach: Coach, coachvoice: CoachVoice,
    a_dashboard: AdminDashboard, a_team: AdminTeam, a_setter: AdminSetter,
    a_catalog: AdminCatalog, a_billing: AdminBilling, a_leaderboard: Leaderboard,
    g_overview: GroupOverview, g_offices: GroupOffices, g_usage: GroupUsage, g_leaderboard: Leaderboard,
    p_practices: PlatformPractices, p_agents: PlatformAgents, p_catalog: PlatformCatalog, p_leaderboard: Leaderboard,
    invite_setup: AcceptInvite,
  };
  const Screen = SCREENS[screen] || Dashboard;

  if (full) {
    return (<><div className="app-bg"></div><div key={screen}><Screen go={go}/></div></>);
  }
  return (
    <><div className="app-bg"></div>
    <div className="shell">
      <Sidebar screen={screen} go={go}/>
      <main className="main" key={screen}><Screen go={go}/></main>
    </div></>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
