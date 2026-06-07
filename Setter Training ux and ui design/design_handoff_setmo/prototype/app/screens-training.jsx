// ===== Trainings hub: recommended videos (drip) + workbooks + coach banner =====

function VideoModal({ video, onClose, go }) {
  const [playing, setPlaying] = useState(false);
  if (!video) return null;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:100,background:"rgba(6,6,12,.7)",backdropFilter:"blur(6px)",display:"grid",placeItems:"center",padding:24,animation:"fade .2s ease"}}>
      <style>{`@keyframes fade{from{opacity:0}to{opacity:1}}`}</style>
      <div onClick={e=>e.stopPropagation()} className="card" style={{width:"min(820px,94vw)",overflow:"hidden",animation:"popin .3s var(--spring) both"}}>
        {/* player */}
        <div style={{position:"relative",aspectRatio:"16/9",background:video.thumb,display:"grid",placeItems:"center"}}>
          <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(135deg,transparent,transparent 22px,rgba(0,0,0,.06) 22px,rgba(0,0,0,.06) 44px)"}}></div>
          <button onClick={()=>setPlaying(p=>!p)} style={{position:"relative",width:78,height:78,borderRadius:"50%",background:"rgba(255,255,255,.16)",backdropFilter:"blur(8px)",border:"1.5px solid rgba(255,255,255,.4)",display:"grid",placeItems:"center",color:"#fff"}}>
            <Icon name={playing?"pause":"play"} size={30}/>
          </button>
          <div style={{position:"absolute",bottom:14,left:16,right:16,display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1,height:5,borderRadius:99,background:"rgba(255,255,255,.25)",overflow:"hidden"}}><div style={{height:"100%",width:playing?"42%":(video.progress||0)+"%",background:"#fff",borderRadius:99,transition:"width .4s"}}></div></div>
            <span style={{color:"#fff",fontSize:12,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{video.mins}:00</span>
          </div>
          <div style={{position:"absolute",top:14,left:16}} className="chip purple">{video.skill}</div>
          <button onClick={onClose} style={{position:"absolute",top:14,right:16,width:34,height:34,borderRadius:"50%",background:"rgba(0,0,0,.35)",display:"grid",placeItems:"center",color:"#fff"}}><Icon name="x" size={16} sw={2.4}/></button>
        </div>
        {/* meta */}
        <div className="card-pad">
          <h2 style={{fontSize:22,marginBottom:10}}>{video.title}</h2>
          <div style={{display:"flex",gap:11,marginBottom:16,flexWrap:"wrap"}}>
            <span className="chip"><Icon name="clock" size={13}/> {video.mins} min</span>
            <span className="chip"><Icon name="video" size={13}/> Video lesson</span>
            <span className="chip mint"><Icon name="target" size={13}/> Targets {video.skill}</span>
          </div>
          <div style={{background:"rgba(139,92,246,.1)",border:"1px solid rgba(139,92,246,.25)",borderRadius:12,padding:"13px 16px",marginBottom:18,fontSize:14,color:"var(--text-2)"}}>
            <b style={{color:"var(--purple-2)"}}>Why this, now:</b> {video.why}.
          </div>
          <div style={{display:"flex",gap:12}}>
            <button className="btn btn-primary" onClick={()=>setPlaying(true)}><Icon name="play" size={16}/> {video.progress>0&&video.progress<100?"Resume":"Watch lesson"}</button>
            <button className="btn btn-ghost" onClick={()=>{onClose();go("coach");}}><Icon name="chat" size={16}/> Practice this with Coach</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ v, onOpen }) {
  const locked = v.status==="locked";
  return (
    <button disabled={locked} onClick={()=>!locked&&onOpen(v)} className="card" style={{textAlign:"left",overflow:"hidden",cursor:locked?"default":"pointer",opacity:locked?.6:1,transition:"transform .25s var(--spring),border-color .2s",padding:0}}
      onMouseEnter={e=>{if(!locked){e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.borderColor="var(--purple)";}}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.borderColor="var(--line)";}}>
      <div style={{position:"relative",aspectRatio:"16/9",background:v.thumb,display:"grid",placeItems:"center"}}>
        <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(135deg,transparent,transparent 18px,rgba(0,0,0,.06) 18px,rgba(0,0,0,.06) 36px)"}}></div>
        <div style={{position:"relative",width:48,height:48,borderRadius:"50%",background:"rgba(255,255,255,.18)",border:"1.5px solid rgba(255,255,255,.45)",display:"grid",placeItems:"center",color:"#fff"}}>
          <Icon name={locked?"lock":"play"} size={locked?18:20}/>
        </div>
        <div style={{position:"absolute",bottom:10,right:10,background:"rgba(0,0,0,.55)",color:"#fff",fontSize:11.5,fontWeight:600,padding:"3px 8px",borderRadius:99}}>{v.mins} min</div>
        {v.status==="new" && <div style={{position:"absolute",top:10,left:10}} className="chip mint" >{v.drop}</div>}
        {v.status==="done" && <div style={{position:"absolute",top:10,left:10,width:26,height:26,borderRadius:"50%",background:"var(--mint)",display:"grid",placeItems:"center",color:"#06281d"}}><Icon name="check" size={15} sw={3}/></div>}
        {locked && <div style={{position:"absolute",top:10,left:10}} className="chip">{v.unlock}</div>}
        {v.progress>0 && v.progress<100 && <div style={{position:"absolute",bottom:0,left:0,right:0,height:4,background:"rgba(0,0,0,.3)"}}><div style={{height:"100%",width:v.progress+"%",background:"var(--mint)"}}></div></div>}
      </div>
      <div style={{padding:"15px 16px 17px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{width:6,height:6,borderRadius:9,background:"var(--purple)"}}></span>
          <span style={{fontSize:11.5,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--muted)"}}>{v.skill}</span>
        </div>
        <div style={{fontWeight:700,fontSize:15.5,marginBottom:8,lineHeight:1.25}}>{v.title}</div>
        <div className="muted" style={{fontSize:13,lineHeight:1.4}}><b style={{color:"var(--text-2)",fontWeight:600}}>Why:</b> {v.why}.</div>
      </div>
    </button>
  );
}

function Trainings({ go }) {
  const D = window.SetMoData;
  const [video, setVideo] = useState(null);
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Trainings</h1><p>Fresh coaching, picked from how you actually scored.</p></div><div className="tb-right"><AllowanceMeter a={D.allowance}/></div></div>
      <div className="content">
        {/* coach banner */}
        <div className="card card-pad rise" style={{marginBottom:24,background:"linear-gradient(120deg,rgba(139,92,246,.22),rgba(52,211,153,.06))",borderColor:"rgba(139,92,246,.4)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:24,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:18,alignItems:"center"}}>
            <div style={{width:54,height:54,borderRadius:16,background:"var(--grad)",display:"grid",placeItems:"center",color:"#fff",flex:"none",boxShadow:"var(--glow)"}}><Icon name="chat" size={26}/></div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}><h2 style={{fontSize:21}}>Help me say it better</h2><span className="chip purple" style={{padding:"2px 9px",fontSize:11}}>AI Coach</span></div>
              <p className="muted" style={{fontSize:14.5,maxWidth:"40em"}}>Chat or talk it through with your coach — figure out the exact words, or run a quick role-play of just the moment you're stuck on.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={()=>go("coach")}><Icon name="chat" size={18}/> Open Coach</button>
        </div>

        {/* videos */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div className="eyebrow">Recommended this week</div>
          <div className="chip"><Icon name="clock" size={13}/> Refreshes every few days from your calls</div>
        </div>
        <p className="muted" style={{fontSize:13.5,marginBottom:18}}>New lessons drop based on your last sessions — your weakest skill gets priority.</p>
        <div className="grid g-3" style={{marginBottom:32}}>
          {D.videos.map(v=><VideoCard key={v.id} v={v} onOpen={setVideo}/>)}
        </div>

        {/* workbooks */}
        <div className="eyebrow" style={{marginBottom:6}}>Workbooks</div>
        <p className="muted" style={{fontSize:13.5,marginBottom:18}}>Go deeper between calls — scripts and drills you can keep on hand.</p>
        <div className="grid g-3">
          {D.workbooks.map(w=>{
            const pct = Math.round(w.done/w.pages*100);
            const complete = w.done>=w.pages;
            return (
              <div key={w.id} className="card card-pad" style={{display:"flex",flexDirection:"column"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div style={{width:46,height:54,borderRadius:8,background:"linear-gradient(135deg,#24243a,#1a1a2e)",border:"1px solid var(--line)",display:"grid",placeItems:"center",color:"var(--purple-2)",position:"relative"}}>
                    <Icon name="doc" size={22}/>
                    <span style={{position:"absolute",left:0,top:8,bottom:8,width:3,borderRadius:99,background:"var(--grad)"}}></span>
                  </div>
                  <span className="chip" style={{padding:"3px 10px"}}>{w.tag}</span>
                </div>
                <div style={{fontWeight:700,fontSize:16,marginBottom:7}}>{w.title}</div>
                <p className="muted" style={{fontSize:13.5,marginBottom:16,flex:1}}>{w.desc}</p>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{flex:1,height:6,borderRadius:99,background:"#181828",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:complete?"var(--grad-mint)":"var(--grad)",borderRadius:99}}></div></div>
                  <span style={{fontSize:12,color:complete?"var(--mint)":"var(--muted)",fontWeight:600,whiteSpace:"nowrap"}}>{complete?"Complete":w.done+"/"+w.pages+" pp"}</span>
                </div>
                <button className="btn btn-ghost" style={{width:"100%"}}><Icon name="doc" size={16}/> {w.done>0?(complete?"Review workbook":"Continue"):"Open workbook"}</button>
              </div>
            );
          })}
        </div>
      </div>
      <VideoModal video={video} onClose={()=>setVideo(null)} go={go}/>
    </>
  );
}

Object.assign(window, { Trainings, VideoCard, VideoModal });
