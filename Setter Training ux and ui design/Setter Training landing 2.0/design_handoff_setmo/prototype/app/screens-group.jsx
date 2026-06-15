// ===== Group / DSO screens + Accept-invite =====

function AcceptInvite({ go }) {
  const D = window.SetMoData;
  const inv = D.invite;
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const ready = name.trim().length>1 && pw.length>=6;
  return (
    <div style={{minHeight:"100vh",display:"grid",gridTemplateColumns:"1fr 1fr",position:"relative",zIndex:1}}>
      <div style={{display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 8vw",maxWidth:560,margin:"0 auto",width:"100%"}}>
        <button className="sb-logo" style={{padding:"0 0 30px"}} onClick={()=>go("login")}><img src="assets/setmo-icon.png" alt="" style={{width:34,height:34,objectFit:"contain"}}/><span>Set<span style={{color:"var(--mint)"}}>Mo</span></span></button>
        <div className="chip purple" style={{marginBottom:18,width:"fit-content"}}><Icon name="team" size={14}/> You've been invited</div>
        <h1 style={{fontSize:34,marginBottom:10}}>Join {inv.office}.</h1>
        <p className="muted" style={{fontSize:16,marginBottom:28}}>{inv.inviter} invited you to practice your lead calls on SetMo. Set up your account to get started.</p>
        <div className="field"><label>Work email</label><input className="input" value={inv.email} disabled style={{opacity:.7}}/></div>
        <div className="field"><label>Your full name</label><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex Rivera" autoFocus/></div>
        <div className="field"><label>Create a password</label><input className="input" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 6 characters"/></div>
        <label style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:13.5,color:"var(--muted)",cursor:"pointer",margin:"4px 0 22px"}}><input type="checkbox" defaultChecked style={{accentColor:"#8b5cf6",marginTop:3}}/> I agree to SetMo's Terms and acknowledge all practice personas are fictional — no real patient data is involved.</label>
        <button className="btn btn-primary btn-lg btn-block" disabled={!ready} style={{opacity:ready?1:.5}} onClick={()=>go("dashboard")}>Create account &amp; start <Icon name="arrow"/></button>
        <p className="muted" style={{fontSize:13.5,marginTop:18,textAlign:"center"}}>Already set up? <a style={{color:"var(--purple-2)",fontWeight:600,cursor:"pointer"}} onClick={()=>go("login")}>Sign in</a></p>
      </div>
      <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#15132a,#0a0a14)",borderLeft:"1px solid var(--line)",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 6vw"}}>
        <div style={{position:"absolute",width:360,height:360,borderRadius:"50%",background:"radial-gradient(circle,rgba(52,211,153,.3),transparent 70%)",right:-80,top:-40,filter:"blur(10px)"}}></div>
        <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.4),transparent 70%)",left:-70,bottom:-50,filter:"blur(10px)"}}></div>
        <div style={{position:"relative",zIndex:2}}>
          <h2 style={{fontSize:28,maxWidth:"13em",lineHeight:1.18,marginBottom:26}}>Here's what your first week looks like.</h2>
          {[["mic","Practice real calls","Talk to an AI patient that pushes back — no live leads at risk."],["chart","See exactly where you stand","Eight skills scored every call, with the words to use next time."],["trophy","Climb the leaderboard","Earn your spot on the team board as you improve."]].map(([ic,t,d],i)=>(
            <div key={i} style={{display:"flex",gap:14,marginBottom:20,maxWidth:380}}>
              <div style={{width:42,height:42,borderRadius:12,background:"var(--s3)",display:"grid",placeItems:"center",color:"var(--mint)",flex:"none"}}><Icon name={ic} size={20}/></div>
              <div><div style={{fontWeight:700,fontSize:15.5,marginBottom:3}}>{t}</div><div className="muted" style={{fontSize:13.5,lineHeight:1.45}}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Group overview ----------
function officeStatusColor(s){ return s==="watch"?"var(--amber)":s==="new"?"var(--purple-2)":"var(--mint)"; }

function GroupOverview({ go }) {
  const D = window.SetMoData;
  const g = D.group;
  const poolPct = Math.round(g.poolUsed/g.poolTotal*100);
  return (
    <>
      <div className="topbar">
        <div className="tb-greet"><h1>{g.name}</h1><p>{g.offices} offices · {g.setters} setters · #{g.globalRank} on the global leaderboard</p></div>
        <div className="tb-right"><button className="btn btn-ghost" onClick={()=>go("g_leaderboard")}><Icon name="trophy" size={17}/> Global standing</button><button className="btn btn-primary" onClick={()=>go("g_offices")}><Icon name="building" size={17}/> All offices</button></div>
      </div>
      <div className="content">
        <div className="grid g-4 rise" style={{marginBottom:18}}>
          <StatTile lab="Group average" val={g.avg} grad="var(--grad-mint)" sub="▲ 0.3 this month" subClass="up"/>
          <StatTile lab="Offices" val={g.offices} sub="all active"/>
          <StatTile lab="Total setters" val={g.setters} sub="▲ 4 this month" subClass="up"/>
          <StatTile lab="Global rank" val={"#"+g.globalRank} grad="var(--grad-num)" sub="of all practices"/>
        </div>
        <div className="grid g-2" style={{gridTemplateColumns:"1.5fr 1fr",marginBottom:18}}>
          <div className="card card-pad rise" style={{animationDelay:".05s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <h3 style={{fontSize:18}}>Offices at a glance</h3>
              <a className="muted" style={{fontSize:13.5,fontWeight:600,cursor:"pointer"}} onClick={()=>go("g_offices")}>View all →</a>
            </div>
            {D.offices.map((o,i)=>(
              <button key={o.id} onClick={()=>go("a_dashboard")} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 8px",width:"100%",textAlign:"left",borderTop:i?"1px solid var(--line-soft)":"none",borderRadius:8,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div className="lb-av" style={{width:38,height:38,fontSize:11,borderRadius:11,background:o.status==="watch"?"linear-gradient(135deg,#fbbf24,#f59e0b)":"var(--grad)"}}>{o.name.split(" ").map(w=>w[0]).slice(0,2).join("")}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14.5}}>{o.name}</div><div className="muted" style={{fontSize:12}}>{o.city} · {o.setters} setters</div></div>
                <Sparkline data={o.trend} w={70} h={28} color={officeStatusColor(o.status)} fill={false}/>
                <Delta v={o.delta}/>
                <div className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:18,width:38,textAlign:"right"}}>{o.avg}</div>
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div className="card card-pad rise" style={{animationDelay:".1s",background:"linear-gradient(150deg,rgba(52,211,153,.14),var(--s2))"}}>
              <div className="chip mint" style={{marginBottom:14}}><Icon name="trophy" size={13}/> Global leaderboard</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:8}}>
                <span className="grad-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:48,lineHeight:1}}>#{g.globalRank}</span>
                <span className="muted" style={{fontSize:14,paddingBottom:8}}>of all SetMo practices</span>
              </div>
              <p className="muted" style={{fontSize:13.5,marginBottom:16}}>Fairness-weighted on average score and improvement — you're 0.1 behind 1st.</p>
              <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>go("g_leaderboard")}>See the board</button>
            </div>
            <div className="card card-pad rise" style={{animationDelay:".15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h3 style={{fontSize:17}}>Group pool</h3><span className="chip mint" style={{padding:"3px 10px"}}>Healthy</span></div>
              <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:8}}><span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:36,lineHeight:1}}>{(g.poolTotal-g.poolUsed).toFixed(0)}</span><span className="muted" style={{fontSize:14,fontWeight:600,paddingBottom:5}}>hrs left of {g.poolTotal}</span></div>
              <div style={{height:8,borderRadius:99,background:"#181828",overflow:"hidden",margin:"6px 0 0"}}><div style={{height:"100%",width:poolPct+"%",background:"var(--grad-mint)",borderRadius:99}}></div></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- Offices list ----------
function GroupOffices({ go }) {
  const D = window.SetMoData;
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Offices</h1><p>Every practice in {D.group.name} — drill into any one to manage it.</p></div>
        <div className="tb-right"><button className="btn btn-primary"><Icon name="building" size={17}/> Add office</button></div></div>
      <div className="content">
        <div className="card rise" style={{overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1.4fr 1.4fr 1fr 30px",gap:16,padding:"14px 22px",borderBottom:"1px solid var(--line)",fontSize:11.5,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--muted)"}}>
            <div>Office</div><div>Setters</div><div>Avg score</div><div>Pool used</div><div>Office rank</div><div></div>
          </div>
          {D.offices.map((o,i)=>{
            const pct=Math.round(o.usage/o.pool*100);
            return (
              <button key={o.id} onClick={()=>go("a_dashboard")} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1.4fr 1.4fr 1fr 30px",gap:16,alignItems:"center",padding:"15px 22px",width:"100%",textAlign:"left",borderTop:i?"1px solid var(--line-soft)":"none",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                  <div className="lb-av" style={{width:38,height:38,fontSize:11,borderRadius:11,background:o.status==="watch"?"linear-gradient(135deg,#fbbf24,#f59e0b)":"var(--grad)"}}>{o.name.split(" ").map(w=>w[0]).slice(0,2).join("")}</div>
                  <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14.5}}>{o.name}</div><div className="muted" style={{fontSize:12}}>{o.city}</div></div>
                </div>
                <div style={{fontWeight:600,fontSize:14}}>{o.setters}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}><Sparkline data={o.trend} w={50} h={26} color={officeStatusColor(o.status)} fill={false}/><span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:18}}>{o.avg}</span><Delta v={o.delta}/></div>
                <div><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:6,borderRadius:99,background:"#181828",overflow:"hidden",maxWidth:80}}><div style={{height:"100%",width:pct+"%",background:pct>80?"linear-gradient(90deg,#f59e0b,#ef4444)":"var(--grad-mint)",borderRadius:99}}></div></div></div><div className="muted" style={{fontSize:12,marginTop:4}}>{o.usage} / {o.pool} hrs</div></div>
                <div><span className={"chip "+(o.rank===1?"mint":"")} style={{padding:"3px 10px",fontSize:12}}>#{o.rank} in service</span></div>
                <div style={{color:"var(--muted)"}}>›</div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------- Group usage ----------
function GroupUsage({ go }) {
  const D = window.SetMoData;
  const g = D.group;
  const [modal, setModal] = useState(null);
  const poolPct = Math.round(g.poolUsed/g.poolTotal*100);
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Group usage</h1><p>Practice time pooled across all {g.offices} offices.</p></div>
        <div className="tb-right"><button className="btn btn-primary" onClick={()=>setModal("bundle")}><Icon name="card" size={17}/> Buy group bundle</button></div></div>
      <div className="content">
        <div className="card card-pad card-glow rise" style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{fontSize:18}}>Group practice pool</h3><span className="chip mint" style={{padding:"3px 10px"}}>Healthy</span></div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:8}}><span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:52,lineHeight:1}}>{(g.poolTotal-g.poolUsed).toFixed(0)}</span><span className="muted" style={{fontSize:16,fontWeight:600,paddingBottom:8}}>of {g.poolTotal} hrs left this month</span></div>
          <div style={{height:11,borderRadius:99,background:"#181828",overflow:"hidden",margin:"8px 0 8px"}}><div style={{height:"100%",width:poolPct+"%",background:"var(--grad-mint)",borderRadius:99}}></div></div>
          <p className="muted" style={{fontSize:13}}>{g.setters} seats × 3 hrs = {g.setters*3} hrs included across the group, plus purchased bundles.</p>
        </div>
        <div className="eyebrow" style={{marginBottom:12}}>Usage by office</div>
        <div className="card card-pad rise" style={{animationDelay:".06s"}}>
          {D.offices.map((o,i)=>{
            const pct=Math.round(o.usage/o.pool*100);
            return (
              <div key={o.id} style={{display:"flex",alignItems:"center",gap:16,padding:"13px 0",borderTop:i?"1px solid var(--line-soft)":"none"}}>
                <div className="lb-av" style={{width:34,height:34,fontSize:11,borderRadius:10,background:"var(--grad)"}}>{o.name.split(" ").map(w=>w[0]).slice(0,2).join("")}</div>
                <div style={{width:170,flex:"none"}}><div style={{fontWeight:600,fontSize:14}}>{o.name}</div><div className="muted" style={{fontSize:12}}>{o.setters} setters</div></div>
                <div style={{flex:1,height:9,borderRadius:99,background:"#181828",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:pct>80?"linear-gradient(90deg,#f59e0b,#ef4444)":"var(--grad)",borderRadius:99}}></div></div>
                <div className="muted" style={{fontSize:13,width:96,textAlign:"right"}}>{o.usage} / {o.pool} hrs</div>
              </div>
            );
          })}
        </div>
      </div>
      {modal==="bundle" && <BundleModal onClose={()=>setModal(null)}/>}
    </>
  );
}

Object.assign(window, { AcceptInvite, GroupOverview, GroupOffices, GroupUsage });
