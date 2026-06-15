// ===== Coach: "Help me say it better" — live chat + voice role-play =====

const COACH_SYSTEM = "You are SetMo Coach, an upbeat, plain-spoken sales coach for dental appointment setters whose job is to book high-ticket implant/full-arch consults. The setter practices against an AI patient and you help them improve. When they ask how to say something, give them specific words they can say out loud — ideally a short example line or two — not theory. Keep replies tight: 2-4 sentences or a short scripted line. Be encouraging, frame misses as growth, never clinical. You're coaching Sam, whose weakest skill right now is pain-point exploration and who sometimes freezes on the 'I need to think about it' stall.";

function fallbackCoach(msg) {
  const m = msg.toLowerCase();
  if (m.includes("think about it"))
    return "Don't let it sit — lean in warmly: \u201cTotally fair. Usually when someone says that, there's one specific thing on their mind. If you don't mind me asking — is it the timing, the investment, or whether this is really the right fix for you?\u201d That turns a stall into a real conversation. Want to drill it out loud?";
  if (m.includes("$40") || m.includes("confiden") || m.includes("price") || m.includes("expensive"))
    return "Say the number like it's the easy part — slow down, don't flinch. Try: \u201cThe full-arch investment is around $40,000, and most patients tell me it's the best money they've spent — because it's the last time they think about their teeth. Can I show you what's included?\u201d Confidence is in the pause, not the volume.";
  if (m.includes("cheaper") || m.includes("quoted") || m.includes("elsewhere"))
    return "Acknowledge it, then reframe to value: \u201cI hear you — and price matters. Can I ask what that quote included? A lot of full-arch prices leave out the things that decide whether it lasts 5 years or 20.\u201d You're not defending the price, you're protecting their outcome.";
  if (m.includes("open") || m.includes("warm") || m.includes("start") || m.includes("greet"))
    return "Lead with them, not the practice: \u201cHi Maria, this is Sam over at Brightwork — I saw you were looking into implants and wanted to personally help. Before anything else, what's got you thinking about this now?\u201d Warm, curious, and it opens discovery in one line.";
  if (m.includes("spouse") || m.includes("partner") || m.includes("wife") || m.includes("husband"))
    return "Make their partner part of the solution: \u201cThat makes total sense — this is a big decision and you'll want them on board. What if I held two times so you could both hop on? That way they hear it firsthand instead of secondhand.\u201d";
  return "Good question. The move here is to stay curious and specific — name what they're feeling, then ask one open question that surfaces the real reason. Tell me the exact moment you got stuck and I'll give you the words. Or tap \u201cRole-play a moment\u201d and we'll run it live.";
}

async function askCoach(history, userMsg) {
  const convo = history.map(x => (x.role === "user" ? "Setter" : "Coach") + ": " + x.text).join("\n");
  const prompt = COACH_SYSTEM + "\n\nConversation so far:\n" + convo + "\nSetter: " + userMsg + "\nCoach:";
  try {
    if (window.claude && window.claude.complete) {
      const r = await window.claude.complete(prompt);
      if (r && r.trim()) return r.trim();
    }
  } catch (e) {}
  return fallbackCoach(userMsg);
}

function Typing() {
  return (
    <div style={{display:"flex",gap:5,alignItems:"center",padding:"4px 2px"}}>
      {[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:"50%",background:"var(--purple-2)",animation:`tdot 1.2s ${i*0.18}s infinite ease-in-out`}}></span>)}
      <style>{`@keyframes tdot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}`}</style>
    </div>
  );
}

function CoachChat({ go }) {
  const D = window.SetMoData;
  const [msgs, setMsgs] = useState([{ role:"coach", text:D.coachWelcome }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(()=>{ const el=scroller.current; if(el) el.scrollTop=el.scrollHeight; },[msgs,busy]);

  async function send(text) {
    const t = (text!=null?text:input).trim();
    if (!t || busy) return;
    setInput("");
    const next = [...msgs, { role:"user", text:t }];
    setMsgs(next); setBusy(true);
    const reply = await askCoach(next, t);
    setMsgs(m=>[...m, { role:"coach", text:reply }]); setBusy(false);
  }

  return (
    <div className="card" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 168px)",overflow:"hidden"}}>
      {/* messages */}
      <div ref={scroller} style={{flex:1,overflowY:"auto",padding:"24px 24px 8px",display:"flex",flexDirection:"column",gap:16}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:12,maxWidth:"78%",alignSelf:m.role==="user"?"flex-end":"flex-start",flexDirection:m.role==="user"?"row-reverse":"row"}}>
            {m.role==="coach" && <div style={{width:34,height:34,borderRadius:11,background:"var(--grad)",display:"grid",placeItems:"center",color:"#fff",flex:"none"}}><Icon name="spark" size={17}/></div>}
            <div style={{padding:"12px 16px",borderRadius:16,fontSize:14.5,lineHeight:1.5,
              background:m.role==="user"?"var(--grad)":"var(--s3)",
              color:m.role==="user"?"#fff":"var(--text)",
              borderBottomRightRadius:m.role==="user"?5:16,borderBottomLeftRadius:m.role==="user"?16:5}}>{m.text}</div>
          </div>
        ))}
        {busy && (
          <div style={{display:"flex",gap:12,alignSelf:"flex-start"}}>
            <div style={{width:34,height:34,borderRadius:11,background:"var(--grad)",display:"grid",placeItems:"center",color:"#fff",flex:"none"}}><Icon name="spark" size={17}/></div>
            <div style={{padding:"12px 16px",borderRadius:16,borderBottomLeftRadius:5,background:"var(--s3)"}}><Typing/></div>
          </div>
        )}
      </div>
      {/* starters */}
      {msgs.length<=1 && (
        <div style={{display:"flex",gap:9,flexWrap:"wrap",padding:"0 24px 14px"}}>
          {D.coachStarters.map((s,i)=>(
            <button key={i} onClick={()=>send(s)} className="chip" style={{cursor:"pointer",padding:"8px 13px",borderColor:"rgba(139,92,246,.3)"}}>{s}</button>
          ))}
        </div>
      )}
      {/* input */}
      <div style={{borderTop:"1px solid var(--line)",padding:"14px 16px",display:"flex",gap:10,alignItems:"flex-end"}}>
        <input className="input" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} placeholder="Ask how to say something, or describe where you got stuck…" style={{flex:1}}/>
        <button className="btn btn-ghost" title="Talk instead" onClick={()=>go("coachvoice")} style={{padding:"12px 14px"}}><Icon name="sound" size={18}/></button>
        <button className="btn btn-primary" onClick={()=>send()} disabled={busy||!input.trim()} style={{padding:"12px 16px",opacity:(busy||!input.trim())?.5:1}}><Icon name="send" size={18}/></button>
      </div>
    </div>
  );
}

function CoachVoice({ go }) {
  const D = window.SetMoData;
  const moments = [
    { key:"price", label:"The price objection", desc:"They've been quoted cheaper elsewhere." },
    { key:"stall", label:"The 'I'll think about it' stall", desc:"Warm lead who won't commit to a time." },
    { key:"open", label:"The opening 20 seconds", desc:"Set the tone and open discovery fast." },
  ];
  const tips = [
    "Slow down — let the silence do some work after you name the number.",
    "Nice. Now ask what their quote included instead of defending price.",
    "Good warmth. Try one open question to surface the real 'why'.",
    "You've got them nodding — now ask for the appointment directly.",
  ];
  const [phase, setPhase] = useState("setup"); // setup | live
  const [moment, setMoment] = useState("stall");
  const [secs, setSecs] = useState(0);
  const [tip, setTip] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(()=>{ if(phase!=="live")return; const t=setInterval(()=>setSecs(s=>s+1),1000); return ()=>clearInterval(t); },[phase]);
  useEffect(()=>{ if(phase!=="live")return; const t=setInterval(()=>setTip(x=>(x+1)%tips.length),3400); return ()=>clearInterval(t); },[phase]);

  const mm=String(Math.floor(secs/60)).padStart(2,"0"), ss=String(secs%60).padStart(2,"0");

  if (phase==="setup") {
    return (
      <div className="content" style={{maxWidth:760,margin:"0 auto"}}>
        <button className="btn btn-ghost" onClick={()=>go("coach")} style={{marginBottom:20}}>← Back to chat</button>
        <div className="rise" style={{textAlign:"center",marginBottom:26}}>
          <div className="chip purple" style={{marginBottom:14}}><Icon name="sound" size={14}/> Voice role-play · coaching mode</div>
          <h1 style={{fontSize:30,marginBottom:10}}>Drill just the moment you're stuck on.</h1>
          <p className="muted" style={{fontSize:16,maxWidth:"34em",margin:"0 auto"}}>Unlike a scored session, your coach pauses to feed you live tips and lets you rewind and try the line again. Low stakes, just reps.</p>
        </div>
        <div className="eyebrow" style={{marginBottom:12}}>Pick a moment</div>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:24}}>
          {moments.map(mo=>(
            <button key={mo.key} onClick={()=>setMoment(mo.key)} className="card card-pad" style={{textAlign:"left",display:"flex",alignItems:"center",gap:16,borderColor:moment===mo.key?"var(--purple)":"var(--line)",boxShadow:moment===mo.key?"0 0 0 1px var(--purple)":"var(--shadow-card)",transition:"all .2s"}}>
              <div style={{width:42,height:42,borderRadius:12,background:moment===mo.key?"var(--grad)":"var(--s3)",display:"grid",placeItems:"center",color:moment===mo.key?"#fff":"var(--purple-2)",flex:"none"}}><Icon name="sound" size={20}/></div>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:16}}>{mo.label}</div><div className="muted" style={{fontSize:13.5}}>{mo.desc}</div></div>
              {moment===mo.key && <span style={{color:"var(--purple-2)"}}><Icon name="check" size={20} sw={2.6}/></span>}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-lg btn-block" onClick={()=>{setPhase("live");setSecs(0);}}><Icon name="sound" size={18}/> Start voice role-play</button>
      </div>
    );
  }

  // live coaching
  return (
    <div style={{minHeight:"calc(100vh)",display:"flex",flexDirection:"column",position:"relative",zIndex:1}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 32px"}}>
        <div className="chip purple" style={{padding:"7px 14px"}}><span className="live-dot" style={{background:"var(--purple-2)"}}></span> COACHING ROLE-PLAY</div>
        <div className="chip"><Icon name="clock" size={14}/> {moments.find(m=>m.key===moment).label}</div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:24,position:"relative"}}>
        <div style={{position:"absolute",width:480,height:480,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.18),transparent 65%)",pointerEvents:"none"}}></div>
        <div style={{width:88,height:88,borderRadius:"50%",background:"var(--grad)",display:"grid",placeItems:"center",color:"#fff",boxShadow:"var(--glow)",position:"relative",marginBottom:6}}><Icon name="spark" size={36}/></div>
        <div className="muted" style={{fontSize:14,position:"relative"}}>Your coach is role-playing the lead</div>
        <div style={{fontFamily:"Lato",fontWeight:900,fontSize:52,letterSpacing:"-0.04em",position:"relative",fontVariantNumeric:"tabular-nums"}}>{mm}:{ss}</div>
        <div style={{maxWidth:520,width:"100%",position:"relative",margin:"6px 0"}}><Waveform active={!muted} bars={40}/></div>
        {/* live coaching tip */}
        <div key={tip} style={{position:"relative",display:"flex",gap:12,alignItems:"center",background:"linear-gradient(120deg,rgba(139,92,246,.18),var(--s2))",border:"1px solid rgba(139,92,246,.4)",padding:"13px 18px",borderRadius:16,maxWidth:"36em",animation:"popin .35s var(--spring) both"}}>
          <span style={{width:30,height:30,borderRadius:9,background:"var(--grad)",display:"grid",placeItems:"center",color:"#fff",flex:"none"}}><Icon name="bolt" size={15}/></span>
          <div><div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--purple-2)",marginBottom:2}}>Coach tip</div><div style={{fontSize:14.5,color:"var(--text)"}}>{tips[tip]}</div></div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,padding:"0 24px 40px",position:"relative"}}>
        <button className="btn btn-ghost btn-lg" onClick={()=>setMuted(m=>!m)} style={{minWidth:120,background:muted?"rgba(239,68,68,.14)":"var(--s3)",borderColor:muted?"rgba(239,68,68,.4)":"var(--line)",color:muted?"#fca5a5":"var(--text)"}}><Icon name="mic" size={18}/> {muted?"Muted":"Mute"}</button>
        <button className="btn btn-ghost btn-lg" onClick={()=>setSecs(0)} title="Rewind & try again"><Icon name="target" size={18}/> Try again</button>
        <button className="btn btn-primary btn-lg" onClick={()=>{setPhase("setup");go("coach");}}>End role-play <Icon name="arrow"/></button>
      </div>
    </div>
  );
}

function Coach({ go }) {
  const D = window.SetMoData;
  return (
    <>
      <div className="topbar">
        <div className="tb-greet"><h1>Coach</h1><p>Figure out exactly what to say — by chat or out loud.</p></div>
        <div className="tb-right">
          <div style={{display:"flex",gap:6,background:"var(--s2)",border:"1px solid var(--line)",borderRadius:99,padding:5}}>
            <button className="btn btn-primary" style={{padding:"8px 16px",fontSize:14}}><Icon name="chat" size={16}/> Chat</button>
            <button className="btn" style={{padding:"8px 16px",fontSize:14,color:"var(--muted)"}} onClick={()=>go("coachvoice")}><Icon name="sound" size={16}/> Voice role-play</button>
          </div>
        </div>
      </div>
      <div className="content" style={{paddingTop:0}}>
        <CoachChat go={go}/>
      </div>
    </>
  );
}

Object.assign(window, { Coach, CoachChat, CoachVoice });
