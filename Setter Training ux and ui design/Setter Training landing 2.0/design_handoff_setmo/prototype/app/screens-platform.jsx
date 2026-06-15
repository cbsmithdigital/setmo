// ===== Platform Admin (Grow Dental internal) =====

function statusChip(status){
  const map = {
    active:["mint","Active"], new:["purple","New"], trial:["","Trial"],
    live:["mint","Live"], draft:["purple","Draft"], planned:["","Planned"],
    Published:["mint","Published"], Draft:["purple","Draft"],
  };
  const [cls,lab] = map[status] || ["",status];
  return <span className={"chip "+(cls?cls:"")} style={{padding:"3px 11px",fontSize:12}}>{lab}</span>;
}

function PlatformKPIs() {
  const p = window.SetMoData.platform;
  return (
    <div className="grid g-4 rise" style={{marginBottom:18}}>
      <StatTile lab="Active practices" val={p.practices} sub="▲ 5 this month" subClass="up"/>
      <StatTile lab="Setters trained" val={p.setters} grad="var(--grad-num)" sub={p.groups+" DSO groups"}/>
      <StatTile lab="Sessions / mo" val={p.sessionsMonth} sub={p.poolHours+" call hours"}/>
      <StatTile lab="MRR" val={p.mrr} grad="var(--grad-mint)" sub="▲ 14% MoM" subClass="up"/>
    </div>
  );
}

// ---------- Practices ----------
function PlatformPractices({ go }) {
  const D = window.SetMoData;
  const [q, setQ] = useState("");
  const rows = D.practices.filter(p=> (p.name+p.org+p.city).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Practices</h1><p>Every account on SetMo — across all groups and independents.</p></div>
        <div className="tb-right"><button className="btn btn-ghost"><Icon name="card" size={17}/> Billing</button><button className="btn btn-primary"><Icon name="building" size={17}/> Add practice</button></div></div>
      <div className="content">
        <PlatformKPIs/>
        <div style={{display:"flex",gap:12,marginBottom:14,alignItems:"center"}}>
          <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search practices, groups, cities…" style={{maxWidth:340}}/>
          <span className="muted" style={{fontSize:13.5}}>{rows.length} of {D.practices.length} practices</span>
        </div>
        <div className="card rise" style={{overflow:"hidden",animationDelay:".05s"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1.4fr 1fr 1.2fr 1fr 1fr 30px",gap:14,padding:"14px 22px",borderBottom:"1px solid var(--line)",fontSize:11.5,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--muted)"}}>
            <div>Practice</div><div>Group</div><div>Seats</div><div>Avg score</div><div>MRR</div><div>Status</div><div></div>
          </div>
          {rows.map((p,i)=>(
            <button key={p.id} onClick={()=>go("a_dashboard")} style={{display:"grid",gridTemplateColumns:"2fr 1.4fr 1fr 1.2fr 1fr 1fr 30px",gap:14,alignItems:"center",padding:"15px 22px",width:"100%",textAlign:"left",borderTop:i?"1px solid var(--line-soft)":"none",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                <div className="lb-av" style={{width:38,height:38,fontSize:11,borderRadius:11,background:p.status==="trial"?"var(--s4)":"var(--grad)"}}>{p.name.split(" ").map(w=>w[0]).slice(0,2).join("")}</div>
                <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14.5}}>{p.name}</div><div className="muted" style={{fontSize:12}}>{p.city}</div></div>
              </div>
              <div style={{fontSize:13.5,color:p.org==="Independent"?"var(--muted)":"var(--text-2)"}}>{p.org}</div>
              <div style={{fontWeight:600,fontSize:14}}>{p.seats}</div>
              <div>{p.avg>0 ? <span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:18}}>{p.avg}</span> : <span className="muted" style={{fontSize:13}}>—</span>}</div>
              <div style={{fontWeight:600,fontSize:14}}>{p.mrr}</div>
              <div>{statusChip(p.status)}</div>
              <div style={{color:"var(--muted)"}}>›</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Agents ----------
function PlatformAgents({ go }) {
  const D = window.SetMoData;
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Agents</h1><p>One specialized voice agent per service type — shared base, per-service modules.</p></div>
        <div className="tb-right"><button className="btn btn-primary"><Icon name="bolt" size={17}/> New agent module</button></div></div>
      <div className="content">
        <div className="card card-pad rise" style={{marginBottom:18,display:"flex",gap:16,alignItems:"center",background:"linear-gradient(120deg,rgba(139,92,246,.16),var(--s2))"}}>
          <div style={{width:46,height:46,borderRadius:13,background:"var(--grad)",display:"grid",placeItems:"center",color:"#fff",flex:"none"}}><Icon name="shield" size={22}/></div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15.5,marginBottom:3}}>Shared base agent · v2.1</div><div className="muted" style={{fontSize:13.5}}>Voice realism, trust-meter mechanic, character-lock, feedback format and contact handling — maintained once, reused by every service module.</div></div>
          <button className="btn btn-ghost">Edit base</button>
        </div>
        <div className="grid g-2">
          {D.agents.map((a,i)=>(
            <div key={a.id} className="card card-pad rise" style={{animationDelay:(i*0.04)+"s",opacity:a.status==="planned"?.66:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div style={{display:"flex",gap:13,alignItems:"center"}}>
                  <div style={{width:44,height:44,borderRadius:12,background:a.status==="live"?"var(--grad)":"var(--s3)",display:"grid",placeItems:"center",color:a.status==="live"?"#fff":"var(--purple-2)",flex:"none"}}><Icon name="mic" size={20}/></div>
                  <div><div style={{fontWeight:700,fontSize:16}}>{a.short}</div><div className="muted" style={{fontSize:12.5}}>{a.version!=="—"?a.version:"not started"}</div></div>
                </div>
                {statusChip(a.status)}
              </div>
              <p className="muted" style={{fontSize:13.5,marginBottom:16,minHeight:38}}>{a.note}</p>
              <div style={{display:"flex",gap:20,paddingTop:14,borderTop:"1px solid var(--line-soft)"}}>
                <div><div className="muted" style={{fontSize:11.5}}>Rubric</div><div style={{fontWeight:700,fontSize:15}}>{a.skills} skills</div></div>
                <div><div className="muted" style={{fontSize:11.5}}>Personas</div><div style={{fontWeight:700,fontSize:15}}>{a.personas||"—"}</div></div>
                <div><div className="muted" style={{fontSize:11.5}}>Sessions</div><div style={{fontWeight:700,fontSize:15}}>{a.sessions}</div></div>
                <button className="btn btn-ghost" style={{marginLeft:"auto",padding:"8px 14px",fontSize:13.5}} disabled={a.status==="planned"} >{a.status==="live"?"Configure":a.status==="draft"?"Continue":"Plan"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Training catalog management ----------
function PlatformCatalog({ go }) {
  const D = window.SetMoData;
  const [tab, setTab] = useState("all");
  const rows = D.catalogItems.filter(c=> tab==="all"?true: tab==="video"?c.type==="Video": tab==="workbook"?c.type==="Workbook":c.status==="Draft");
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Training catalog</h1><p>The coaching content SetMo recommends — mapped to the skills each one targets.</p></div>
        <div className="tb-right"><button className="btn btn-primary"><Icon name="book" size={17}/> Add training</button></div></div>
      <div className="content">
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[["all","All"],["video","Videos"],["workbook","Workbooks"],["draft","Drafts"]].map(([k,l])=>(
            <button key={k} className={"btn "+(tab===k?"btn-primary":"btn-ghost")} style={{padding:"9px 16px",fontSize:14}} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="card rise" style={{overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2.4fr 1fr 1.4fr 1fr 1fr 30px",gap:14,padding:"14px 22px",borderBottom:"1px solid var(--line)",fontSize:11.5,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--muted)"}}>
            <div>Title</div><div>Type</div><div>Targets skill</div><div>Recommended</div><div>Status</div><div></div>
          </div>
          {rows.map((c,i)=>(
            <div key={c.id} style={{display:"grid",gridTemplateColumns:"2.4fr 1fr 1.4fr 1fr 1fr 30px",gap:14,alignItems:"center",padding:"15px 22px",borderTop:i?"1px solid var(--line-soft)":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                <div style={{width:38,height:38,borderRadius:10,background:"var(--s3)",display:"grid",placeItems:"center",color:"var(--purple-2)",flex:"none"}}><Icon name={c.type==="Video"?"video":"doc"} size={18}/></div>
                <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div><div className="muted" style={{fontSize:12}}>{c.mins} {c.type==="Video"?"min":"pages"}</div></div>
              </div>
              <div style={{fontSize:13.5}} className="muted">{c.type}</div>
              <div><span className="chip purple" style={{padding:"3px 10px",fontSize:12}}>{c.skill}</span></div>
              <div style={{fontWeight:600,fontSize:14}}>{c.recs>0?c.recs.toLocaleString()+"×":"—"}</div>
              <div>{statusChip(c.status)}</div>
              <div style={{color:"var(--muted)"}}>›</div>
            </div>
          ))}
        </div>
        <p className="muted" style={{fontSize:13,marginTop:16,display:"flex",gap:8,alignItems:"center"}}><Icon name="target" size={14}/> Each training maps to a rubric skill, so SetMo can recommend it the moment a setter's score dips — with the reason attached.</p>
      </div>
    </>
  );
}

Object.assign(window, { PlatformPractices, PlatformAgents, PlatformCatalog });
