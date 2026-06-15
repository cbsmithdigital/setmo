// ===== Signature live session + post-session results =====

function Waveform({ active, bars=44 }) {
  const arr = useRef([...Array(bars)].map(()=>0.2+Math.random()*0.8));
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,height:120}}>
      {arr.current.map((seed,i)=>(
        <i key={i} style={{
          width:6,borderRadius:99,
          background:"linear-gradient(180deg,#a78bfa,#7c3aed)",
          height:active?undefined:14,
          animation:active?`wf 1.1s ${(seed*0.9).toFixed(2)}s ease-in-out infinite`:"none",
          opacity: active?1:.4,
        }}/>
      ))}
      <style>{`@keyframes wf{0%,100%{height:${active?16:14}px}50%{height:${active?78:14}px}}`}</style>
    </div>
  );
}

function LiveSession({ go }) {
  const [phase, setPhase] = useState("pre"); // pre | live | wrap
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const remainMin = 47;

  useEffect(()=>{
    if (phase!=="live") return;
    const t = setInterval(()=>setSecs(s=>s+1), 1000);
    return ()=>clearInterval(t);
  },[phase]);

  useEffect(()=>{
    if (phase!=="wrap") return;
    const t = setTimeout(()=>go("results"), 2600);
    return ()=>clearTimeout(t);
  },[phase]);

  const mm = String(Math.floor(secs/60)).padStart(2,"0");
  const ss = String(secs%60).padStart(2,"0");

  // PRE-CALL
  if (phase==="pre") {
    return (
      <div style={{minHeight:"100vh",display:"grid",placeItems:"center",position:"relative",zIndex:1,padding:24}}>
        <div className="rise" style={{textAlign:"center",maxWidth:480}}>
          <div style={{width:96,height:96,borderRadius:"50%",margin:"0 auto 28px",display:"grid",placeItems:"center",
            background:"radial-gradient(circle,rgba(139,92,246,.25),transparent 70%)",border:"1px solid rgba(139,92,246,.4)"}}>
            <div style={{width:64,height:64,borderRadius:"50%",background:"var(--grad)",display:"grid",placeItems:"center",boxShadow:"var(--glow)"}}><Icon name="mic" size={28} color="#fff"/></div>
          </div>
          <div className="chip purple" style={{marginBottom:18}}>Implant / full-arch · adaptive</div>
          <h1 style={{fontSize:34,marginBottom:16,lineHeight:1.12}}>You're calling a new lead.</h1>
          <p className="muted" style={{fontSize:16,marginBottom:8,maxWidth:"26em",margin:"0 auto 8px"}}>You won't know who picks up — that's the point. Stay warm, listen for the real reason they called, and lead them to a booked appointment.</p>
          <p style={{fontSize:13.5,color:"var(--faint)",margin:"18px 0 26px",display:"flex",gap:8,alignItems:"center",justifyContent:"center"}}><Icon name="mic" size={15}/> SetMo needs your microphone for this call.</p>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <button className="btn btn-ghost btn-lg" onClick={()=>go("practice")}>Back</button>
            <button className="btn btn-primary btn-lg" onClick={()=>{setPhase("live");setSecs(0);}}><Icon name="mic"/> Allow mic & start call</button>
          </div>
        </div>
      </div>
    );
  }

  // WRAP
  if (phase==="wrap") {
    return (
      <div style={{minHeight:"100vh",display:"grid",placeItems:"center",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center"}} className="rise">
          <div style={{width:64,height:64,margin:"0 auto 22px",borderRadius:"50%",border:"3px solid var(--s3)",borderTopColor:"var(--purple)",animation:"spin .9s linear infinite"}}></div>
          <h2 style={{fontSize:26,marginBottom:8}}>Scoring your call…</h2>
          <p className="muted">Grading 8 skills and writing your feedback.</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  // LIVE
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1}}>
      {/* top bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 32px"}}>
        <div className="chip mint" style={{padding:"7px 14px",fontSize:13}}><span className="live-dot"></span> LIVE PRACTICE</div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div className="chip"><Icon name="clock" size={14}/> {remainMin} min left in pool</div>
        </div>
      </div>

      {/* center */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:24}}>
        <div style={{position:"absolute",width:520,height:520,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.18),transparent 65%)",pointerEvents:"none"}}></div>
        <div className="muted" style={{fontSize:14,position:"relative"}}>Implant / full-arch lead · undisclosed persona</div>
        <div style={{fontFamily:"Lato",fontWeight:900,fontSize:64,letterSpacing:"-0.04em",position:"relative",fontVariantNumeric:"tabular-nums"}}>{mm}:{ss}</div>
        <div style={{maxWidth:560,width:"100%",position:"relative",margin:"10px 0"}}>
          <Waveform active={!muted}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,position:"relative",color:"var(--text-2)",fontSize:15,background:"var(--s2)",border:"1px solid var(--line)",padding:"11px 18px",borderRadius:99,maxWidth:"34em",textAlign:"center"}}>
          <span style={{width:8,height:8,borderRadius:9,background:"var(--purple-2)",flex:"none"}}></span>
          <span>{muted?"You're muted — unmute to keep talking":"\u201cHonestly, I've been quoted $40,000 somewhere else…\u201d"}</span>
        </div>
      </div>

      {/* controls */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,padding:"0 24px 44px",position:"relative"}}>
        <button className="btn btn-ghost btn-lg" onClick={()=>setMuted(m=>!m)} style={{minWidth:130,background:muted?"rgba(239,68,68,.14)":"var(--s3)",borderColor:muted?"rgba(239,68,68,.4)":"var(--line)",color:muted?"#fca5a5":"var(--text)"}}>
          <Icon name="mic" size={18}/> {muted?"Muted":"Mute"}
        </button>
        <button className="btn btn-primary btn-lg" onClick={()=>setPhase("wrap")} style={{padding:"16px 34px"}}>
          End call &amp; get feedback <Icon name="arrow"/>
        </button>
      </div>
    </div>
  );
}

// ===== RESULTS =====
function ResultSkill({ s, i }) {
  return (
    <div className="skill" style={{padding:"7px 0"}}>
      <div className="nm"><span className={s.tier==="uni"?"uni":"spc"}></span>{s.name}</div>
      <div className="track"><div className={"fill"+(s.score>=4.4?" mint":"")} style={{width:(s.score/5*100)+"%",animationDelay:(i*0.05)+"s"}}></div></div>
      <div className="sc" style={{color:s.score>=4.4?"var(--mint)":s.score<4?"var(--amber)":"#fff"}}>{s.score}</div>
    </div>
  );
}

function Results({ go }) {
  const D = window.SetMoData;
  const r = D.lastResult;
  return (
    <>
      <div className="topbar">
        <div className="tb-greet"><h1>How you did</h1><p>{r.service} · {r.persona} · {r.dur}</p></div>
        <div className="tb-right"><button className="btn btn-ghost" onClick={()=>go("dashboard")}>Done</button><button className="btn btn-primary" onClick={()=>go("practice")}><Icon name="mic"/> Run another</button></div>
      </div>
      <div className="content">
        {/* headline score */}
        <div className="card card-pad card-glow rise" style={{display:"flex",gap:30,alignItems:"center",marginBottom:18,flexWrap:"wrap"}}>
          <Ring value={r.score} size={150}/>
          <div style={{flex:1,minWidth:240}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span className="chip mint"><Icon name="spark" size={13}/> Up from {r.prev}</span>
              <span className="chip purple">Best objection score yet</span>
            </div>
            <h2 style={{fontSize:24,maxWidth:"22em",lineHeight:1.2}}>{r.headline}</h2>
          </div>
        </div>

        <div className="grid g-2" style={{gridTemplateColumns:"1.1fr .9fr",marginBottom:18}}>
          {/* skill breakdown */}
          <div className="card card-pad rise" style={{animationDelay:".05s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <h3 style={{fontSize:18}}>Skill breakdown</h3>
              <div style={{display:"flex",gap:14,fontSize:12}} className="muted">
                <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:7,height:7,borderRadius:9,background:"var(--purple)"}}></span>Universal</span>
                <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:7,height:7,borderRadius:9,background:"var(--mint)"}}></span>Implant-specific</span>
              </div>
            </div>
            {r.skills.map((s,i)=><ResultSkill key={i} s={s} i={i}/>)}
          </div>

          {/* wins + misses */}
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div className="card card-pad rise" style={{animationDelay:".1s"}}>
              <h3 style={{fontSize:17,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><span style={{color:"var(--mint)"}}><Icon name="check" size={18} sw={2.6}/></span> What you nailed</h3>
              {r.wins.map((w,i)=>(
                <div key={i} style={{display:"flex",gap:11,marginBottom:12}}>
                  <span style={{width:22,height:22,borderRadius:7,background:"rgba(52,211,153,.14)",color:"var(--mint)",display:"grid",placeItems:"center",flex:"none",marginTop:1}}><Icon name="check" size={13} sw={3}/></span>
                  <span style={{fontSize:14,color:"var(--text-2)"}}>{w}</span>
                </div>
              ))}
            </div>
            <div className="card card-pad rise" style={{animationDelay:".15s"}}>
              <h3 style={{fontSize:17,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><span style={{color:"var(--amber)"}}><Icon name="target" size={17}/></span> Where to grow</h3>
              {r.misses.map((w,i)=>(
                <div key={i} style={{display:"flex",gap:11,marginBottom:12}}>
                  <span style={{width:22,height:22,borderRadius:7,background:"rgba(251,191,36,.14)",color:"var(--amber)",display:"grid",placeItems:"center",flex:"none",marginTop:1,fontWeight:800,fontSize:12,fontFamily:"Lato"}}>{i+1}</span>
                  <span style={{fontSize:14,color:"var(--text-2)"}}>{w}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* replacement phrases */}
        <div className="card card-pad rise" style={{marginBottom:18,animationDelay:".2s"}}>
          <h3 style={{fontSize:18,marginBottom:4}}>Try these next time</h3>
          <p className="muted" style={{fontSize:13.5,marginBottom:18}}>Swap what tripped you up for language that moves the call forward.</p>
          <div className="grid g-2">
            {r.phrases.map((p,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,padding:"13px 15px"}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--rose)",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Icon name="x" size={12} sw={2.6}/> You said</div>
                  <div style={{fontSize:14,color:"var(--text-2)"}}>{p.from}</div>
                </div>
                <div style={{background:"rgba(52,211,153,.07)",border:"1px solid rgba(52,211,153,.22)",borderRadius:12,padding:"13px 15px"}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--mint)",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Icon name="check" size={12} sw={2.6}/> Try instead</div>
                  <div style={{fontSize:14,color:"#fff"}}>{p.to}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* recommendation + next scenario */}
        <div className="grid g-2" style={{gridTemplateColumns:"1fr 1fr"}}>
          <div className="card card-pad rise" style={{animationDelay:".25s",background:"linear-gradient(150deg,rgba(139,92,246,.18),var(--s2))"}}>
            <div className="chip purple" style={{marginBottom:14}}><Icon name="target" size={13}/> Recommended training</div>
            <h3 style={{fontSize:19,marginBottom:8}}>{r.rec.training}</h3>
            <p className="muted" style={{fontSize:14,marginBottom:18}}>Because {r.rec.why}.</p>
            <button className="btn btn-primary" onClick={()=>go("trainings")}><Icon name="play" size={16}/> Start · {r.rec.mins} min</button>
          </div>
          <div className="card card-pad rise" style={{animationDelay:".3s",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
            <div>
              <div className="chip" style={{marginBottom:14}}><Icon name="bolt" size={13}/> Suggested next lead</div>
              <h3 style={{fontSize:19,marginBottom:8}}>Try a tougher one</h3>
              <p className="muted" style={{fontSize:14}}>{r.nextScenario}</p>
            </div>
            <button className="btn btn-ghost" style={{marginTop:18}} onClick={()=>go("practice")}><Icon name="mic"/> Run this rep</button>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { LiveSession, Results, Waveform });
