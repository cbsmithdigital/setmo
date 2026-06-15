// ===== Office Admin screens =====

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{width:46,height:27,borderRadius:99,padding:3,background:on?"var(--grad-mint)":"var(--s4)",transition:"background .25s",flex:"none",position:"relative"}}>
      <span style={{display:"block",width:21,height:21,borderRadius:"50%",background:"#fff",transform:on?"translateX(19px)":"translateX(0)",transition:"transform .25s var(--spring)",boxShadow:"0 2px 6px rgba(0,0,0,.3)"}}></span>
    </button>
  );
}

function trendColor(s){ return s==="watch"?"var(--amber)":s==="new"?"var(--purple-2)":"var(--mint)"; }

function AdminQuickActions({ go, onInvite, onBundle }) {
  return (
    <div className="tb-right">
      <button className="btn btn-ghost" onClick={onBundle}><Icon name="card" size={17}/> Buy bundle</button>
      <button className="btn btn-primary" onClick={onInvite}><Icon name="team" size={17}/> Invite setters</button>
    </div>
  );
}

// ---------- Overview ----------
function AdminDashboard({ go }) {
  const D = window.SetMoData;
  const [modal, setModal] = useState(null);
  const teamAvg = (D.team.reduce((s,t)=>s+t.avg,0)/D.team.length).toFixed(1);
  const pool = D.allowance;
  const poolPct = Math.round(pool.poolUsed/pool.poolTotal*100);
  const attention = D.team.filter(t=>t.status==="watch"||t.status==="new");
  return (
    <>
      <div className="topbar">
        <div className="tb-greet"><h1>{D.practice.name}</h1><p>{D.practice.city} · 6 of {D.billing.seats} seats practiced this week</p></div>
        <AdminQuickActions go={go} onInvite={()=>setModal("invite")} onBundle={()=>setModal("bundle")}/>
      </div>
      <div className="content">
        <div className="grid g-4 rise" style={{marginBottom:18}}>
          <StatTile lab="Team average" val={teamAvg} grad="var(--grad-mint)" sub="▲ 0.4 this month" subClass="up"/>
          <StatTile lab="Active setters" val="6" sub={"of "+D.billing.seats+" seats"}/>
          <StatTile lab="Sessions this week" val="83" sub="▲ 19 vs last week" subClass="up"/>
          <StatTile lab="Set rate (live)" val="38%" grad="var(--grad-num)" sub="▲ 6 pts since SetMo" subClass="up"/>
        </div>

        <div className="grid g-2" style={{gridTemplateColumns:"1.5fr 1fr",marginBottom:18}}>
          {/* team glance */}
          <div className="card card-pad rise" style={{animationDelay:".05s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <h3 style={{fontSize:18}}>Team at a glance</h3>
              <a className="muted" style={{fontSize:13.5,fontWeight:600,cursor:"pointer"}} onClick={()=>go("a_team")}>View team →</a>
            </div>
            {D.team.slice(0,5).map((t,i)=>(
              <button key={t.id} onClick={()=>{localStorage.setItem("setmo.setter",t.id);go("a_setter");}} style={{display:"flex",alignItems:"center",gap:14,padding:"11px 8px",width:"100%",textAlign:"left",borderTop:i?"1px solid var(--line-soft)":"none",borderRadius:8,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div className="lb-av" style={{width:36,height:36,fontSize:13}}>{t.initials}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14.5}}>{t.name}</div><div className="muted" style={{fontSize:12}}>{t.sessions} sessions · {t.last}</div></div>
                <Sparkline data={t.trend} w={72} h={28} color={trendColor(t.status)} fill={false}/>
                <Delta v={t.delta}/>
                <div className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:18,width:38,textAlign:"right"}}>{t.avg}</div>
              </button>
            ))}
          </div>
          {/* pool + attention */}
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div className="card card-pad rise" style={{animationDelay:".1s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{fontSize:17}}>Practice pool</h3><span className="chip mint" style={{padding:"3px 10px"}}>Healthy</span></div>
              <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:6}}>
                <span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:42,lineHeight:1}}>{(pool.poolTotal-pool.poolUsed).toFixed(1)}</span>
                <span className="muted" style={{fontSize:15,fontWeight:600,paddingBottom:6}}>hrs left of {pool.poolTotal}</span>
              </div>
              <div style={{height:9,borderRadius:99,background:"#181828",overflow:"hidden",margin:"8px 0 14px"}}><div style={{height:"100%",width:poolPct+"%",background:"var(--grad-mint)",borderRadius:99}}></div></div>
              <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>setModal("bundle")}><Icon name="card" size={16}/> Buy a conversation bundle</button>
            </div>
            <div className="card card-pad rise" style={{animationDelay:".15s"}}>
              <h3 style={{fontSize:17,marginBottom:14}}>Needs a nudge</h3>
              {attention.map((t,i)=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:i<attention.length-1?12:0}}>
                  <div className="lb-av" style={{width:34,height:34,fontSize:12,background:t.status==="new"?"linear-gradient(135deg,#a78bfa,#7c3aed)":"linear-gradient(135deg,#fbbf24,#f59e0b)"}}>{t.initials}</div>
                  <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{t.name}</div><div className="muted" style={{fontSize:12}}>{t.status==="new"?"New — only "+t.usage+"h practiced":t.rec}</div></div>
                  <span className="chip" style={{padding:"3px 9px",fontSize:11}}>{t.status==="new"?"New":"Watch"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {modal==="bundle" && <BundleModal onClose={()=>setModal(null)}/>}
      {modal==="invite" && <InviteModal onClose={()=>setModal(null)}/>}
    </>
  );
}

// ---------- Team list ----------
function AdminTeam({ go }) {
  const D = window.SetMoData;
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const rows = D.team.filter(t=> filter==="all" ? true : filter==="rising" ? (t.status==="rising"||t.status==="top") : (t.status==="watch"||t.status==="new"));
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Team</h1><p>Every setter's usage, score trend, and what to coach next.</p></div>
        <AdminQuickActions go={go} onInvite={()=>setModal("invite")} onBundle={()=>setModal("bundle")}/></div>
      <div className="content">
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[["all","All setters"],["rising","Rising"],["attention","Needs attention"]].map(([k,l])=>(
            <button key={k} className={"btn "+(filter===k?"btn-primary":"btn-ghost")} style={{padding:"9px 16px",fontSize:14}} onClick={()=>setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="card rise" style={{overflow:"hidden"}}>
          {/* header */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1.3fr 1fr 1.3fr 1.6fr 30px",gap:16,padding:"14px 22px",borderBottom:"1px solid var(--line)",fontSize:11.5,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--muted)"}}>
            <div>Setter</div><div>Usage</div><div>Sessions</div><div>Avg score</div><div>Coach next</div><div></div>
          </div>
          {rows.map((t,i)=>(
            <button key={t.id} onClick={()=>{localStorage.setItem("setmo.setter",t.id);go("a_setter");}} style={{display:"grid",gridTemplateColumns:"2fr 1.3fr 1fr 1.3fr 1.6fr 30px",gap:16,alignItems:"center",padding:"15px 22px",width:"100%",textAlign:"left",borderTop:i?"1px solid var(--line-soft)":"none",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                <div className="lb-av" style={{width:38,height:38,fontSize:13}}>{t.initials}</div>
                <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14.5}}>{t.name}</div><div className="muted" style={{fontSize:12}}>Active {t.last}</div></div>
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:6,borderRadius:99,background:"#181828",overflow:"hidden",maxWidth:90}}><div style={{height:"100%",width:Math.min(100,t.usage/3*100)+"%",background:"var(--grad)",borderRadius:99}}></div></div></div>
                <div className="muted" style={{fontSize:12,marginTop:4}}>{t.usage}h used</div>
              </div>
              <div style={{fontWeight:600,fontSize:14}}>{t.sessions}</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Sparkline data={t.trend} w={56} h={26} color={trendColor(t.status)} fill={false}/>
                <span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:18}}>{t.avg}</span>
                <Delta v={t.delta}/>
              </div>
              <div><span className="chip purple" style={{padding:"4px 10px",fontSize:12}}>{t.recSkill}</span></div>
              <div style={{color:"var(--muted)"}}>›</div>
            </button>
          ))}
        </div>
      </div>
      {modal==="bundle" && <BundleModal onClose={()=>setModal(null)}/>}
      {modal==="invite" && <InviteModal onClose={()=>setModal(null)}/>}
    </>
  );
}

// ---------- Setter detail ----------
function AdminSetter({ go }) {
  const D = window.SetMoData;
  const id = localStorage.getItem("setmo.setter") || "sc";
  const t = D.team.find(x=>x.id===id) || D.team[1];
  const labels = ["S1","S2","S3","S4","S5","S6","Now"];
  return (
    <>
      <div className="topbar"><div className="tb-greet">
        <button className="btn btn-ghost" onClick={()=>go("a_team")} style={{marginBottom:12,padding:"7px 14px",fontSize:13.5}}>← Team</button>
        <h1>{t.name}</h1><p>Appointment setter · active {t.last} · {t.sessions} sessions</p>
      </div></div>
      <div className="content">
        <div className="card card-pad card-glow rise" style={{display:"flex",gap:30,alignItems:"center",marginBottom:18,flexWrap:"wrap"}}>
          <Ring value={t.avg} size={132}/>
          <div style={{display:"flex",gap:36,flexWrap:"wrap"}}>
            <div><div className="muted" style={{fontSize:12.5,marginBottom:6}}>Trend</div><div style={{fontFamily:"Lato",fontWeight:900,fontSize:24}}><Delta v={t.delta}/></div></div>
            <div><div className="muted" style={{fontSize:12.5,marginBottom:6}}>Practice time</div><div style={{fontFamily:"Lato",fontWeight:900,fontSize:24}}>{t.usage}h</div></div>
            <div><div className="muted" style={{fontSize:12.5,marginBottom:6}}>Sessions</div><div style={{fontFamily:"Lato",fontWeight:900,fontSize:24}}>{t.sessions}</div></div>
            <div><div className="muted" style={{fontSize:12.5,marginBottom:6}}>Focus skill</div><div className="chip purple" style={{marginTop:4}}>{t.recSkill}</div></div>
          </div>
        </div>
        <div className="grid g-2" style={{gridTemplateColumns:"1.3fr 1fr",marginBottom:18}}>
          <div className="card card-pad rise" style={{animationDelay:".05s"}}>
            <h3 style={{fontSize:18,marginBottom:18}}>Score over time</h3>
            <LineChart labels={labels} series={[{data:t.trend,color:trendColor(t.status)}]}/>
          </div>
          <div className="card card-pad rise" style={{animationDelay:".1s"}}>
            <h3 style={{fontSize:18,marginBottom:14}}>Skill breakdown</h3>
            {D.skills.slice(0,6).map((s,i)=>(
              <div key={s.key} className="skill" style={{padding:"7px 0"}}>
                <div className="nm" style={{width:150,fontSize:13.5}}><span className={s.tier==="uni"?"uni":"spc"}></span>{s.name}</div>
                <div className="track"><div className={"fill"+(s.score>=4.4?" mint":"")} style={{width:(s.score/5*100)+"%"}}></div></div>
                <div className="sc" style={{fontSize:14}}>{s.score}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad rise" style={{animationDelay:".15s",background:"linear-gradient(150deg,rgba(139,92,246,.14),var(--s2))"}}>
          <div className="chip purple" style={{marginBottom:12}}><Icon name="target" size={13}/> Current recommendation</div>
          <h3 style={{fontSize:19,marginBottom:8}}>{t.rec}</h3>
          <p className="muted" style={{fontSize:14}}>SetMo surfaced this from {t.name.split(" ")[0]}'s last sessions — assign the matching training or have them run a focused rep.</p>
        </div>
      </div>
    </>
  );
}

// ---------- Service catalog ----------
function AdminCatalog({ go }) {
  const D = window.SetMoData;
  const [offered, setOffered] = useState(()=>Object.fromEntries(D.services.map(s=>[s.key,s.live])));
  const [p, setP] = useState(D.practice);
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Service catalog</h1><p>Choose what your practice offers, and the details your AI lead uses in role-play.</p></div>
        <div className="tb-right"><button className="btn btn-primary"><Icon name="check" size={17}/> Save changes</button></div></div>
      <div className="content">
        <div className="grid g-2" style={{gridTemplateColumns:"1.1fr 1fr",alignItems:"start"}}>
          {/* services */}
          <div className="card card-pad rise">
            <h3 style={{fontSize:18,marginBottom:4}}>Services offered</h3>
            <p className="muted" style={{fontSize:13.5,marginBottom:18}}>This gates which call types your setters can train on, and what the agent offers the lead.</p>
            {D.services.map((s,i)=>(
              <div key={s.key} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderTop:i?"1px solid var(--line-soft)":"none"}}>
                <div style={{width:38,height:38,borderRadius:11,background:"var(--s3)",display:"grid",placeItems:"center",color:"var(--purple-2)",flex:"none"}}><Icon name="target" size={18}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14.5,display:"flex",alignItems:"center",gap:8}}>{s.name}{!s.live && <span className="chip" style={{padding:"1px 8px",fontSize:10.5}}>Agent soon</span>}</div>
                  <div className="muted" style={{fontSize:12.5}}>{s.desc}</div>
                </div>
                <Toggle on={!!offered[s.key]} onClick={()=> s.live && setOffered(o=>({...o,[s.key]:!o[s.key]}))}/>
              </div>
            ))}
          </div>
          {/* practice details */}
          <div className="card card-pad rise" style={{animationDelay:".07s"}}>
            <h3 style={{fontSize:18,marginBottom:4}}>Practice details for role-play</h3>
            <p className="muted" style={{fontSize:13.5,marginBottom:18}}>The AI lead uses these so calls feel like your actual practice.</p>
            <div className="field"><label>Practice name</label><input className="input" value={p.name} onChange={e=>setP({...p,name:e.target.value})}/></div>
            <div className="field"><label>City</label><input className="input" value={p.city} onChange={e=>setP({...p,city:e.target.value})}/></div>
            <div className="field"><label>Offer / voucher framing</label><input className="input" value={p.offer} onChange={e=>setP({...p,offer:e.target.value})}/></div>
            <div className="field"><label>Appointment framing</label><input className="input" value={p.framing} onChange={e=>setP({...p,framing:e.target.value})}/></div>
            <div className="field" style={{marginBottom:0}}><label>Deposit policy</label><input className="input" value={p.deposit} onChange={e=>setP({...p,deposit:e.target.value})}/></div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- Billing ----------
function AdminBilling({ go }) {
  const D = window.SetMoData;
  const b = D.billing;
  const [cadence, setCadence] = useState(b.cadence);
  const [modal, setModal] = useState(null);
  const pool = D.allowance;
  const poolPct = Math.round(pool.poolUsed/pool.poolTotal*100);
  const monthly = (b.seats*b.pricePerSeat*(1-b.discount));
  const total = cadence==="quarterly" ? monthly*3*0.95 : monthly;
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Usage & billing</h1><p>Seats, your practice pool, bundles, and invoices.</p></div>
        <div className="tb-right"><button className="btn btn-primary" onClick={()=>setModal("invite")}><Icon name="team" size={17}/> Invite setters</button></div></div>
      <div className="content">
        {/* pool + plan */}
        <div className="grid g-2" style={{marginBottom:18}}>
          <div className="card card-pad rise">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{fontSize:18}}>Practice pool</h3><span className={"chip "+(poolPct>80?"":"mint")} style={{padding:"3px 10px"}}>{poolPct>80?"Running low":"Healthy"}</span></div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:8}}>
              <span className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:48,lineHeight:1}}>{(pool.poolTotal-pool.poolUsed).toFixed(1)}</span>
              <span className="muted" style={{fontSize:15,fontWeight:600,paddingBottom:8}}>of {pool.poolTotal} hrs left</span>
            </div>
            <div style={{height:10,borderRadius:99,background:"#181828",overflow:"hidden",margin:"6px 0 8px"}}><div style={{height:"100%",width:poolPct+"%",background:"var(--grad-mint)",borderRadius:99}}></div></div>
            <p className="muted" style={{fontSize:12.5,marginBottom:16}}>{b.seats} seats × 3 hrs = {b.seats*3} hrs included, plus purchased bundles. No surprise overage — sessions pause when the pool runs out.</p>
            <button className="btn btn-primary" onClick={()=>setModal("bundle")}><Icon name="card" size={16}/> Buy a conversation bundle</button>
          </div>
          <div className="card card-pad rise" style={{animationDelay:".06s"}}>
            <h3 style={{fontSize:18,marginBottom:14}}>Plan</h3>
            <div style={{display:"flex",alignItems:"flex-end",gap:6,marginBottom:4}}>
              <span style={{fontFamily:"Lato",fontWeight:900,fontSize:40}} className="grad-text">${total.toFixed(0)}</span>
              <span className="muted" style={{fontSize:14,paddingBottom:6}}>/ {cadence==="quarterly"?"quarter":"month"}</span>
            </div>
            <p className="muted" style={{fontSize:13,marginBottom:16}}>{b.seats} seats · ${b.pricePerSeat}/seat · {b.discountLabel}{cadence==="quarterly"?" · extra 5% quarterly":""}</p>
            <div style={{display:"flex",gap:6,background:"var(--s1)",border:"1px solid var(--line)",borderRadius:99,padding:5,marginBottom:16,width:"fit-content"}}>
              {["monthly","quarterly"].map(c=>(
                <button key={c} onClick={()=>setCadence(c)} className={"btn "+(cadence===c?"btn-primary":"")} style={{padding:"7px 18px",fontSize:13.5,color:cadence===c?"#fff":"var(--muted)",textTransform:"capitalize"}}>{c}</button>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5,padding:"10px 0",borderTop:"1px solid var(--line-soft)"}}><span className="muted">Seats filled</span><b>{b.filled} / {b.seats}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5,padding:"10px 0",borderTop:"1px solid var(--line-soft)"}}><span className="muted">Next invoice</span><b>{b.nextAmount} · {b.nextInvoice}</b></div>
          </div>
        </div>

        {/* bundles */}
        <div className="eyebrow" style={{marginBottom:12}}>Top up with a conversation bundle</div>
        <div className="grid g-3 rise" style={{marginBottom:24,animationDelay:".1s"}}>
          {b.bundles.map(bd=>(
            <button key={bd.hrs} onClick={()=>setModal("bundle")} className="card card-pad" style={{textAlign:"left",borderColor:bd.popular?"var(--purple)":"var(--line)",boxShadow:bd.popular?"0 0 0 1px var(--purple)":"var(--shadow-card)",transition:"transform .2s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-4px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontFamily:"Lato",fontWeight:900,fontSize:30}}>+{bd.hrs}<span style={{fontSize:16}}>hrs</span></span>{bd.popular && <span className="chip purple" style={{padding:"3px 10px"}}>Popular</span>}</div>
              <div className="muted" style={{fontSize:13.5,marginBottom:14}}>≈ {bd.hrs} more hours of practice across your team.</div>
              <div style={{fontFamily:"Lato",fontWeight:900,fontSize:22}} className="mint-text">${bd.price}</div>
            </button>
          ))}
        </div>

        {/* invoices */}
        <div className="eyebrow" style={{marginBottom:12}}>Invoices</div>
        <div className="card rise" style={{overflow:"hidden",animationDelay:".15s"}}>
          {b.invoices.map((inv,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr 90px",gap:16,alignItems:"center",padding:"14px 22px",borderTop:i?"1px solid var(--line-soft)":"none"}}>
              <div style={{fontWeight:600,fontSize:14}}>{inv.date}</div>
              <div className="muted" style={{fontSize:13.5}}>{inv.desc}</div>
              <div style={{fontWeight:700,fontSize:14}}>{inv.amt}</div>
              <div><span className="chip mint" style={{padding:"3px 11px",fontSize:12}}>{inv.status}</span></div>
            </div>
          ))}
        </div>
      </div>
      {modal==="bundle" && <BundleModal onClose={()=>setModal(null)}/>}
      {modal==="invite" && <InviteModal onClose={()=>setModal(null)}/>}
    </>
  );
}

// ---------- Modals ----------
function ModalShell({ children, onClose, w=520 }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:100,background:"rgba(6,6,12,.72)",backdropFilter:"blur(6px)",display:"grid",placeItems:"center",padding:24,animation:"fade .2s ease"}}>
      <style>{`@keyframes fade{from{opacity:0}to{opacity:1}}`}</style>
      <div onClick={e=>e.stopPropagation()} className="card card-glow" style={{width:"min("+w+"px,94vw)",animation:"popin .3s var(--spring) both"}}>{children}</div>
    </div>
  );
}

function BundleModal({ onClose }) {
  const D = window.SetMoData;
  const [sel, setSel] = useState(10);
  const [done, setDone] = useState(false);
  const chosen = D.billing.bundles.find(b=>b.hrs===sel);
  return (
    <ModalShell onClose={onClose} w={540}>
      <div className="card-pad">
        {!done ? <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <h2 style={{fontSize:22}}>Buy a conversation bundle</h2>
            <button onClick={onClose} style={{color:"var(--muted)"}}><Icon name="x" size={20}/></button>
          </div>
          <p className="muted" style={{fontSize:14,marginBottom:20}}>Prepaid hours that stack on your included pool. One-time charge, no subscription change.</p>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            {D.billing.bundles.map(b=>(
              <button key={b.hrs} onClick={()=>setSel(b.hrs)} className="card-pad" style={{padding:"15px 18px",borderRadius:12,textAlign:"left",border:"1px solid "+(sel===b.hrs?"var(--purple)":"var(--line)"),background:sel===b.hrs?"rgba(139,92,246,.1)":"var(--s1)",display:"flex",alignItems:"center",gap:14,transition:"all .2s"}}>
                <span style={{width:20,height:20,borderRadius:"50%",border:"2px solid "+(sel===b.hrs?"var(--purple)":"var(--faint)"),display:"grid",placeItems:"center",flex:"none"}}>{sel===b.hrs&&<span style={{width:9,height:9,borderRadius:"50%",background:"var(--purple)"}}></span>}</span>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:16}}>+{b.hrs} hours {b.popular&&<span className="chip purple" style={{padding:"1px 8px",fontSize:10.5,marginLeft:6}}>Popular</span>}</div><div className="muted" style={{fontSize:12.5}}>≈ ${(b.price/b.hrs).toFixed(0)}/hr of team practice</div></div>
                <div style={{fontFamily:"Lato",fontWeight:900,fontSize:20}} className="mint-text">${b.price}</div>
              </button>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderTop:"1px solid var(--line)",marginBottom:18}}>
            <span className="muted" style={{fontSize:14}}>Total today</span><span style={{fontFamily:"Lato",fontWeight:900,fontSize:24}}>${chosen.price}.00</span>
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={()=>setDone(true)}><Icon name="card" size={18}/> Pay ${chosen.price} with Stripe</button>
          <p className="muted" style={{fontSize:12,textAlign:"center",marginTop:12}}>Secured by Stripe · adds {chosen.hrs} hrs to your pool instantly</p>
        </> : <div style={{textAlign:"center",padding:"16px 8px"}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:"var(--grad-mint)",display:"grid",placeItems:"center",margin:"0 auto 18px",color:"#06281d"}}><Icon name="check" size={32} sw={3}/></div>
          <h2 style={{fontSize:23,marginBottom:8}}>+{chosen.hrs} hours added 🎉</h2>
          <p className="muted" style={{fontSize:14.5,marginBottom:22,maxWidth:"26em",margin:"0 auto 22px"}}>Your practice pool just topped up. Your team can keep practicing right away.</p>
          <button className="btn btn-primary btn-lg" onClick={onClose}>Done</button>
        </div>}
      </div>
    </ModalShell>
  );
}

function InviteModal({ onClose }) {
  const [emails, setEmails] = useState(["",""]);
  const [done, setDone] = useState(false);
  const valid = emails.filter(e=>/.+@.+\..+/.test(e)).length;
  return (
    <ModalShell onClose={onClose} w={500}>
      <div className="card-pad">
        {!done ? <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <h2 style={{fontSize:22}}>Invite setters</h2>
            <button onClick={onClose} style={{color:"var(--muted)"}}><Icon name="x" size={20}/></button>
          </div>
          <p className="muted" style={{fontSize:14,marginBottom:20}}>They'll get an email invite to set up their account and start practicing. Each active setter uses one seat.</p>
          {emails.map((em,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:10}}>
              <input className="input" type="email" value={em} placeholder="name@brightworkdental.com" onChange={e=>setEmails(emails.map((x,j)=>j===i?e.target.value:x))} style={{flex:1}}/>
              {emails.length>1 && <button onClick={()=>setEmails(emails.filter((_,j)=>j!==i))} className="btn btn-ghost" style={{padding:"0 14px"}}><Icon name="x" size={16}/></button>}
            </div>
          ))}
          <button onClick={()=>setEmails([...emails,""])} className="btn btn-ghost" style={{fontSize:13.5,padding:"9px 14px",marginBottom:20}}>+ Add another</button>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderTop:"1px solid var(--line)",marginBottom:18}}>
            <span className="muted" style={{fontSize:13.5}}>{valid} invite{valid===1?"":"s"} · {12-6} seats free</span>
          </div>
          <button className="btn btn-primary btn-block btn-lg" disabled={!valid} style={{opacity:valid?1:.5}} onClick={()=>setDone(true)}><Icon name="send" size={18}/> Send {valid||""} invite{valid===1?"":"s"}</button>
        </> : <div style={{textAlign:"center",padding:"16px 8px"}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:"var(--grad)",display:"grid",placeItems:"center",margin:"0 auto 18px",color:"#fff"}}><Icon name="send" size={28}/></div>
          <h2 style={{fontSize:23,marginBottom:8}}>Invites on their way</h2>
          <p className="muted" style={{fontSize:14.5,maxWidth:"26em",margin:"0 auto 22px"}}>We emailed {valid} setter{valid===1?"":"s"}. They'll appear on your team the moment they accept.</p>
          <button className="btn btn-primary btn-lg" onClick={onClose}>Done</button>
        </div>}
      </div>
    </ModalShell>
  );
}

Object.assign(window, { AdminDashboard, AdminTeam, AdminSetter, AdminCatalog, AdminBilling, BundleModal, InviteModal, Toggle });
