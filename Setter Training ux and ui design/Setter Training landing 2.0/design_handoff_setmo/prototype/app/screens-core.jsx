// ===== Core screens: Login, Dashboard, ServicePicker, Trainings =====

function Login({ go }) {
  const D = window.SetMoData;
  return (
    <div style={{minHeight:"100vh",display:"grid",gridTemplateColumns:"1fr 1fr",position:"relative",zIndex:1}}>
      <div style={{display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 8vw",maxWidth:560,margin:"0 auto",width:"100%"}}>
        <button className="sb-logo" style={{padding:"0 0 36px"}} onClick={()=>go("dashboard")}><img src="assets/setmo-icon.png" alt="" style={{width:36,height:36,objectFit:"contain"}}/><span>Set<span style={{color:"var(--mint)"}}>Mo</span></span></button>
        <h1 style={{fontSize:38,marginBottom:10}}>Welcome back.</h1>
        <p className="muted" style={{fontSize:16,marginBottom:30}}>Ready to run a few reps? Let's set more.</p>
        <div className="field"><label>Work email</label><input className="input" type="email" defaultValue="sam@brightworkdental.com" placeholder="you@practice.com"/></div>
        <div className="field"><label>Password</label><input className="input" type="password" defaultValue="password" placeholder="••••••••"/></div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"4px 0 22px"}}>
          <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13.5,color:"var(--muted)",cursor:"pointer"}}><input type="checkbox" defaultChecked style={{accentColor:"#8b5cf6"}}/> Keep me signed in</label>
          <a style={{fontSize:13.5,color:"var(--purple-2)",fontWeight:600,cursor:"pointer"}}>Forgot password?</a>
        </div>
        <button className="btn btn-primary btn-lg btn-block" onClick={()=>go("dashboard")}>Sign in <Icon name="arrow"/></button>
        <p className="muted" style={{fontSize:13.5,marginTop:20,textAlign:"center"}}>Invited by your office? <a style={{color:"var(--purple-2)",fontWeight:600,cursor:"pointer"}} onClick={()=>go("invite_setup")}>Set up your account</a></p>
      </div>
      <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#15132a,#0a0a14)",borderLeft:"1px solid var(--line)",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 6vw"}}>
        <div style={{position:"absolute",width:380,height:380,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.5),transparent 70%)",right:-80,top:-60,filter:"blur(10px)"}}></div>
        <div style={{position:"absolute",width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(52,211,153,.28),transparent 70%)",left:-60,bottom:-40,filter:"blur(10px)"}}></div>
        <div style={{position:"relative",zIndex:2}}>
          <div className="chip mint" style={{marginBottom:22}}><span className="live-dot"></span> Your last 7 sessions trending up</div>
          <h2 style={{fontSize:30,maxWidth:"14em",lineHeight:1.15,marginBottom:30}}>"Every rep is one your team would've fumbled on a real lead."</h2>
          <div className="card card-pad card-glow" style={{maxWidth:380}}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <Ring value={4.6} size={104} stroke={9} label="avg score"/>
              <div>
                <div className="eyebrow" style={{marginBottom:6}}>This week</div>
                <div style={{fontSize:15,color:"var(--text-2)",lineHeight:1.4}}>Up <b className="mint-text" style={{fontFamily:"Lato",fontWeight:900}}>+12%</b> across 6 sessions. Objection handling jumped from 2.9 to 4.0.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ lab, val, sub, subClass, grad, spark, sparkColor }) {
  return (
    <div className="stat-tile">
      <div className="lab">{lab}</div>
      <div className="val" style={grad?{background:grad,WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"}:null}>{val}</div>
      {sub && <div className={"sub "+(subClass||"")}>{sub}</div>}
      {spark && <div style={{marginTop:14}}><Sparkline data={spark} w={160} h={38} color={sparkColor||"var(--mint)"}/></div>}
    </div>
  );
}

function Dashboard({ go }) {
  const D = window.SetMoData;
  const avg = (D.skills.reduce((s,x)=>s+x.score,0)/D.skills.length).toFixed(1);
  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Good morning, {D.user.first} 👋</h1>
          <p>You're on a <b style={{color:"var(--mint)"}}>7-day streak</b> — keep it alive with a rep today.</p>
        </div>
        <div className="tb-right"><AllowanceMeter a={D.allowance}/></div>
      </div>
      <div className="content">
        {/* hero CTA + ring */}
        <div className="grid g-2 rise" style={{gridTemplateColumns:"1.5fr 1fr",marginBottom:18}}>
          <div className="card card-pad card-glow" style={{display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:210,overflow:"hidden"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:11}}>
              <div className="chip purple"><Icon name="bolt" size={14}/> Ready when you are</div>
              <h2 style={{fontSize:30,maxWidth:"15em"}}>Run a rep against a fresh lead.</h2>
              <p className="muted" style={{fontSize:15.5,maxWidth:"32em"}}>Implant / full-arch · adaptive difficulty tuned to your last sessions. You won't know who's calling until you pick up.</p>
            </div>
            <div style={{display:"flex",gap:12,marginTop:20}}>
              <button className="btn btn-primary btn-lg" onClick={()=>go("practice")}><Icon name="mic"/> Start practice</button>
              <button className="btn btn-ghost btn-lg" onClick={()=>go("progress")}>View progress</button>
            </div>
          </div>
          <div className="card card-pad" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
            <div className="eyebrow">Current skill level</div>
            <Ring value={parseFloat(avg)} size={150} label="overall avg"/>
            <div className="chip mint"><Delta v={+0.4}/> vs last week</div>
          </div>
        </div>

        {/* stat row */}
        <div className="grid g-4 rise" style={{marginBottom:18,animationDelay:".05s"}}>
          <StatTile lab="Sessions this week" val="6" sub="▲ 2 vs last week" subClass="up"/>
          <StatTile lab="Best skill" val="4.8" grad="var(--grad-mint)" sub="Value building"/>
          <StatTile lab="Focus area" val="3.8" grad="linear-gradient(135deg,#fbbf24,#f59e0b)" sub="Pain-point exploration"/>
          <StatTile lab="Office rank" val="#2" sub="▲ 3 places" subClass="up"/>
        </div>

        <div className="grid g-2" style={{gridTemplateColumns:"1.5fr 1fr"}}>
          {/* recent sessions */}
          <div className="card card-pad rise" style={{animationDelay:".1s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{fontSize:18}}>Recent sessions</h3>
              <a className="muted" style={{fontSize:13.5,fontWeight:600,cursor:"pointer"}} onClick={()=>go("progress")}>View all →</a>
            </div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {D.sessions.map((s,i)=>(
                <button key={s.id} onClick={()=>go("results")} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 8px",borderRadius:10,textAlign:"left",borderTop:i?"1px solid var(--line-soft)":"none",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{width:42,height:42,borderRadius:11,background:"var(--s3)",display:"grid",placeItems:"center",color:"var(--purple-2)",flex:"none"}}><Icon name="mic" size={18}/></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.persona}</div>
                    <div className="muted" style={{fontSize:12.5}}>{s.when} · {s.dur}</div>
                  </div>
                  <Delta v={s.delta}/>
                  <div style={{fontFamily:"Lato",fontWeight:900,fontSize:19,width:44,textAlign:"right"}} className={s.score>=4?"mint-text":"grad-text"}>{s.score}</div>
                </button>
              ))}
            </div>
          </div>

          {/* leaderboard peek + recommendation */}
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div className="card card-pad rise" style={{animationDelay:".15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <h3 style={{fontSize:18}}>Office leaderboard</h3>
                <a className="muted" style={{fontSize:13.5,fontWeight:600,cursor:"pointer"}} onClick={()=>go("leaderboard")}>Full board →</a>
              </div>
              <div className="lb">
                {D.leaderboard.slice(0,3).map(p=>(
                  <div key={p.rank} className={"lb-row"+(p.me?" me":"")+(p.top?" top":"")} style={{padding:"9px 12px"}}>
                    <div className="lb-rank">{p.rank}</div>
                    <div className="lb-av" style={{width:32,height:32,fontSize:12}}>{p.initials}</div>
                    <div className="lb-nm" style={{fontSize:14}}>{p.me?"You":p.name}</div>
                    <div className="lb-sc mint-text" style={{fontSize:17,width:40}}>{p.score}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card card-pad rise" style={{animationDelay:".2s",background:"linear-gradient(150deg,rgba(139,92,246,.16),var(--s2))"}}>
              <div className="chip purple" style={{marginBottom:12}}><Icon name="target" size={13}/> Recommended for you</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Uncovering the real 'why'</div>
              <p className="muted" style={{fontSize:13.5,marginBottom:14}}>Because your pain-point score has sat under 4.0 for three sessions.</p>
              <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>go("trainings")}>Start 12-min training</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ServiceIcon({ kind }) {
  return <div style={{width:46,height:46,borderRadius:13,background:"var(--s3)",display:"grid",placeItems:"center",color:"var(--purple-2)",flex:"none"}}><Icon name="target" size={22}/></div>;
}

function ServicePicker({ go }) {
  const D = window.SetMoData;
  const [sel, setSel] = useState("implant");
  const [diff, setDiff] = useState("adaptive");
  const chosen = D.services.find(s=>s.key===sel);
  return (
    <>
      <div className="topbar">
        <div className="tb-greet"><h1>Start a practice session</h1><p>Pick what you want to drill. You won't see the lead's persona until the call begins.</p></div>
        <div className="tb-right"><AllowanceMeter a={D.allowance}/></div>
      </div>
      <div className="content">
        <div className="eyebrow" style={{marginBottom:14}}>1 · Choose a call type</div>
        <div className="grid g-3" style={{marginBottom:30}}>
          {D.services.map(s=>(
            <button key={s.key} disabled={!s.live} onClick={()=>s.live&&setSel(s.key)}
              className={"card card-pad"+(sel===s.key?" card-glow":"")}
              style={{textAlign:"left",cursor:s.live?"pointer":"not-allowed",opacity:s.live?1:.5,
                borderColor:sel===s.key?"var(--purple)":"var(--line)",
                boxShadow:sel===s.key?"0 0 0 1px var(--purple), 0 18px 40px -24px rgba(124,58,237,.6)":"var(--shadow-card)",
                transition:"border-color .2s, box-shadow .2s, transform .2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <ServiceIcon kind={s.icon}/>
                {s.live ? <span className="chip mint" style={{padding:"3px 9px"}}>Live</span> : <span className="chip" style={{padding:"3px 9px"}}>Soon</span>}
              </div>
              <div style={{fontWeight:700,fontSize:16.5,marginBottom:5}}>{s.name}</div>
              <p className="muted" style={{fontSize:13.5,marginBottom:14,minHeight:38}}>{s.desc}</p>
              <div style={{display:"flex",gap:16,fontSize:12.5}} className="muted">
                <span><b style={{color:"var(--text-2)"}}>{s.skills}</b> skills</span>
                <span><b style={{color:"var(--text-2)"}}>{s.value}</b> case value</span>
              </div>
            </button>
          ))}
        </div>

        <div className="eyebrow" style={{marginBottom:14}}>2 · Set the challenge</div>
        <div className="card card-pad" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:24,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:10}}>
            {[["adaptive","Adaptive","Tunes to your level"],["warm","Warm lead","Easier — friendly"],["tough","Tough lead","Guarded & skeptical"]].map(([k,t,d])=>(
              <button key={k} onClick={()=>setDiff(k)} className="card-pad" style={{padding:"14px 18px",borderRadius:12,textAlign:"left",border:"1px solid "+(diff===k?"var(--purple)":"var(--line)"),background:diff===k?"rgba(139,92,246,.12)":"var(--s1)",transition:"all .2s"}}>
                <div style={{fontWeight:700,fontSize:14.5,display:"flex",alignItems:"center",gap:7}}>{diff===k&&<span style={{width:7,height:7,borderRadius:9,background:"var(--purple-2)"}}></span>}{t}</div>
                <div className="muted" style={{fontSize:12.5,marginTop:3}}>{d}</div>
              </button>
            ))}
          </div>
          <div style={{textAlign:"right"}}>
            <div className="muted" style={{fontSize:13,marginBottom:10}}>Practicing <b style={{color:"var(--text-2)"}}>{chosen.name}</b> · ~8 min · draws from your pool</div>
            <button className="btn btn-primary btn-lg" onClick={()=>go("session")}><Icon name="mic"/> Start call</button>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Login, Dashboard, ServicePicker, StatTile });
