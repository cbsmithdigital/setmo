// ===== Progress + Leaderboard =====

function LineChart({ series, w=620, h=220, labels }) {
  // series: [{data:[], color, name}]
  const pad = {l:34,r:14,t:18,b:26};
  const all = series.flatMap(s=>s.data);
  const max = 5, min = Math.min(...all, 2.5);
  const innerW = w-pad.l-pad.r, innerH = h-pad.t-pad.b;
  const n = series[0].data.length;
  const X = i => pad.l + (i/(n-1))*innerW;
  const Y = v => pad.t + innerH - ((v-min)/(max-min))*innerH;
  const gy = [3,3.5,4,4.5,5];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{display:"block"}}>
      {gy.map(g=>(
        <g key={g}>
          <line x1={pad.l} y1={Y(g)} x2={w-pad.r} y2={Y(g)} stroke="#1c1c30" strokeWidth="1"/>
          <text x={pad.l-8} y={Y(g)+4} textAnchor="end" fontSize="11" fill="#64708a" fontFamily="DM Sans">{g}</text>
        </g>
      ))}
      {labels && labels.map((l,i)=>(
        <text key={i} x={X(i)} y={h-8} textAnchor="middle" fontSize="10.5" fill="#64708a" fontFamily="DM Sans">{l}</text>
      ))}
      {series.map((s,si)=>{
        const line = s.data.map((v,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)).join(" ");
        const gid="lc"+si;
        return (
          <g key={si}>
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".22"/><stop offset="1" stopColor={s.color} stopOpacity="0"/></linearGradient></defs>
            {si===0 && <path d={line+` L ${X(n-1)} ${pad.t+innerH} L ${X(0)} ${pad.t+innerH} Z`} fill={`url(#${gid})`}/>}
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            {s.data.map((v,i)=><circle key={i} cx={X(i)} cy={Y(v)} r="3.4" fill="#0d0d18" stroke={s.color} strokeWidth="2.4"/>)}
          </g>
        );
      })}
    </svg>
  );
}

function Radar({ data, size=300 }) {
  // data: [{name, value(0-5)}]
  const cx=size/2, cy=size/2, R=size/2-46, n=data.length, max=5;
  const ang = i => -Math.PI/2 + i*2*Math.PI/n;
  const pt = (i,r) => [cx+Math.cos(ang(i))*r, cy+Math.sin(ang(i))*r];
  const poly = data.map((d,i)=>pt(i,(d.value/max)*R).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{maxWidth:size,margin:"0 auto",display:"block"}}>
      {[1,.75,.5,.25].map((f,k)=>(
        <polygon key={k} points={data.map((_,i)=>pt(i,R*f).join(",")).join(" ")} fill="none" stroke="#1c1c30" strokeWidth="1"/>
      ))}
      {data.map((_,i)=><line key={i} x1={cx} y1={cy} x2={pt(i,R)[0]} y2={pt(i,R)[1]} stroke="#1c1c30" strokeWidth="1"/>)}
      <defs><linearGradient id="radg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa"/><stop offset="1" stopColor="#7c3aed"/></linearGradient></defs>
      <polygon points={poly} fill="rgba(139,92,246,.22)" stroke="url(#radg)" strokeWidth="2.4"/>
      {data.map((d,i)=><circle key={i} cx={pt(i,(d.value/max)*R)[0]} cy={pt(i,(d.value/max)*R)[1]} r="3.4" fill="#a78bfa"/>)}
      {data.map((d,i)=>{
        const [x,y]=pt(i,R+20);
        return <text key={i} x={x} y={y} textAnchor="middle" fontSize="11" fill="#94a3b8" fontFamily="DM Sans" dominantBaseline="middle">{d.name}</text>;
      })}
    </svg>
  );
}

function Progress({ go }) {
  const D = window.SetMoData;
  const labels = ["S1","S2","S3","S4","S5","S6","S7","Now"];
  const uni = D.skills.filter(s=>s.tier==="uni").map(s=>({name:s.name.split(" ")[0],value:s.score}));
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Your progress</h1><p>Eight sessions in. Here's how your skills are trending.</p></div>
        <div className="tb-right"><div className="chip purple">Implants / full-arch</div><div className="chip">All services</div></div>
      </div>
      <div className="content">
        <div className="grid g-4 rise" style={{marginBottom:18}}>
          <StatTile lab="Overall average" val="4.6" grad="var(--grad-mint)" sub="▲ 0.7 over 8 sessions" subClass="up"/>
          <StatTile lab="Most improved" val="+1.1" grad="var(--grad-num)" sub="Objection handling"/>
          <StatTile lab="Total reps" val="24" sub="6 this week" subClass="up"/>
          <StatTile lab="Practice time" val="3.1h" sub="of pooled allowance"/>
        </div>

        <div className="grid g-2" style={{gridTemplateColumns:"1.4fr 1fr",marginBottom:18}}>
          <div className="card card-pad rise" style={{animationDelay:".05s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h3 style={{fontSize:18}}>Score over time</h3>
              <div style={{display:"flex",gap:16,fontSize:12.5}} className="muted">
                <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:14,height:3,borderRadius:9,background:"#34d399"}}></span>Overall</span>
                <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:14,height:3,borderRadius:9,background:"#a78bfa"}}></span>Objection handling</span>
              </div>
            </div>
            <LineChart labels={labels} series={[{data:D.trend,color:"#34d399"},{data:D.trendObjection,color:"#a78bfa"}]}/>
          </div>
          <div className="card card-pad rise" style={{animationDelay:".1s"}}>
            <h3 style={{fontSize:18,marginBottom:4}}>Universal skill profile</h3>
            <p className="muted" style={{fontSize:13,marginBottom:6}}>Transferable across every call type.</p>
            <Radar data={uni} size={280}/>
          </div>
        </div>

        <div className="card card-pad rise" style={{animationDelay:".15s"}}>
          <h3 style={{fontSize:18,marginBottom:16}}>Every skill, right now</h3>
          <div className="grid g-2" style={{gap:"4px 40px"}}>
            {D.skills.map((s,i)=>(
              <div key={s.key} style={{display:"flex",alignItems:"center",gap:14,padding:"11px 0",borderTop:i>1?"1px solid var(--line-soft)":"none"}}>
                <span className={s.tier==="uni"?"uni":"spc"} style={{width:7,height:7,borderRadius:9,flex:"none",background:s.tier==="uni"?"var(--purple)":"var(--mint)"}}></span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14.5,fontWeight:600}}>{s.name}</div>
                  <div className="muted" style={{fontSize:12}}>{s.tier==="uni"?"Universal":"Implant-specific"}</div>
                </div>
                <Sparkline data={[s.prev-0.3,s.prev,s.prev+0.1,s.score-0.2,s.score]} w={70} h={28} color={s.score>=s.prev?"#34d399":"#fb7185"} fill={false}/>
                <Delta v={+(s.score-s.prev).toFixed(1)}/>
                <div style={{fontFamily:"Lato",fontWeight:900,fontSize:20,width:42,textAlign:"right"}} className={s.score>=4.4?"mint-text":"grad-text"}>{s.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Leaderboard({ go }) {
  const D = window.SetMoData;
  const [scope, setScope] = useState("office");
  const offices = [
    { rank:1, name:"Lakeside Implants", sub:"Tucson, AZ", initials:"LI", score:4.7, move:+1, top:true },
    { rank:2, name:"Brightwork Dental", sub:"Your practice", initials:"BD", score:4.5, move:+2, me:true },
    { rank:3, name:"Apex Oral Care", sub:"Denver, CO", initials:"AO", score:4.4, move:0 },
    { rank:4, name:"Coastal Smiles", sub:"Tampa, FL", initials:"CS", score:4.2, move:-1 },
    { rank:5, name:"Meridian DSO", sub:"12 locations", initials:"MD", score:4.1, move:+1 },
  ];
  const rows = scope==="office" ? D.leaderboard : offices;
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Leaderboard</h1><p>Ranked on improvement and average — not who made the most calls.</p></div>
        <div className="tb-right"><div className="chip purple">Implants / full-arch</div></div>
      </div>
      <div className="content">
        {/* scope toggle + podium */}
        <div style={{display:"flex",gap:8,marginBottom:22}}>
          <button className={"btn "+(scope==="office"?"btn-primary":"btn-ghost")} onClick={()=>setScope("office")}><Icon name="team" size={16}/> My office</button>
          <button className={"btn "+(scope==="global"?"btn-primary":"btn-ghost")} onClick={()=>setScope("global")}><Icon name="shield" size={16}/> Global · practices</button>
          <div style={{marginLeft:"auto",alignSelf:"center"}} className="chip"><Icon name="shield" size={13}/> Fairness-weighted</div>
        </div>

        {/* podium top 3 */}
        <div className="grid g-3 rise" style={{marginBottom:20,alignItems:"end"}}>
          {[rows[1],rows[0],rows[2]].map((p,idx)=>{
            const place=[2,1,3][idx];
            const tall=place===1;
            return (
              <div key={p.rank} className="card card-pad" style={{textAlign:"center",paddingTop:tall?28:20,paddingBottom:tall?28:20,
                background:tall?"linear-gradient(160deg,rgba(251,191,36,.14),var(--s2))":"var(--s2)",
                borderColor:tall?"rgba(251,191,36,.4)":(p.me?"rgba(139,92,246,.4)":"var(--line)"),
                transform:tall?"translateY(-8px)":"none"}}>
                <div style={{fontFamily:"Lato",fontWeight:900,fontSize:13,color:place===1?"var(--amber)":"var(--muted)",marginBottom:10}}>{place===1?"🏆 1st":place+"nd"}</div>
                <div className="lb-av" style={{width:tall?56:46,height:tall?56:46,fontSize:tall?17:14,margin:"0 auto 12px",background:place===1?"linear-gradient(135deg,#fbbf24,#f59e0b)":"var(--grad)"}}>{p.initials}</div>
                <div style={{fontWeight:700,fontSize:tall?16:14.5}}>{p.me?"You":p.name.split(" (")[0]}</div>
                <div className="muted" style={{fontSize:12,marginBottom:12}}>{p.sub||p.name}</div>
                <div className="mint-text" style={{fontFamily:"Lato",fontWeight:900,fontSize:tall?38:30}}>{p.score}</div>
              </div>
            );
          })}
        </div>

        {/* full list */}
        <div className="card card-pad rise" style={{animationDelay:".08s"}}>
          <div className="lb">
            {rows.map(p=>(
              <div key={p.rank} className={"lb-row"+(p.me?" me":"")+(p.top?" top":"")}>
                <div className="lb-rank">{p.rank}</div>
                <div className="lb-av">{p.initials}</div>
                <div className="lb-nm">{p.me&&scope==="office"?"You":p.name.split(" (")[0]}<small>{p.sub}</small></div>
                {p.spark && <div className="lb-spark">{p.spark.map((v,i)=><i key={i} className={i>=p.spark.length-2?"hi":""} style={{height:(v/6*100)+"%"}}></i>)}</div>}
                <div className="lb-sc mint-text">{p.score}</div>
                <div className="lb-move"><Delta v={p.move}/></div>
              </div>
            ))}
          </div>
        </div>
        <p className="muted" style={{fontSize:13,marginTop:16,textAlign:"center",display:"flex",gap:8,justifyContent:"center",alignItems:"center"}}>
          <Icon name="shield" size={14}/> {scope==="global"?"Global rankings show practice-level standings only — individual names stay inside each office.":"Rankings update after each scored session. Climb by improving, not by grinding volume."}
        </p>
      </div>
    </>
  );
}

Object.assign(window, { Progress, Leaderboard, LineChart, Radar });
