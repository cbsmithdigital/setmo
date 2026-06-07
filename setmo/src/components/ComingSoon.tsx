import { Icon, type IconName } from "@/components/ui/Icon";

// Placeholder for screens designed in the prototype but scheduled for a later
// phase (Progress, Trainings, Coach, Leaderboard, Office dashboards).
export function ComingSoon({
  title,
  icon = "spark",
  phase,
  blurb,
}: {
  title: string;
  icon?: IconName;
  phase: string;
  blurb: string;
}) {
  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{title}</h1>
          <p>{phase}</p>
        </div>
      </div>
      <div className="content">
        <div
          className="card card-pad card-glow rise"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, padding: "56px 32px" }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "var(--grad)",
              display: "grid",
              placeItems: "center",
              boxShadow: "var(--glow)",
            }}
          >
            <Icon name={icon} size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 24, maxWidth: "20em" }}>{title} is on the way</h2>
          <p className="muted" style={{ fontSize: 15, maxWidth: "34em" }}>
            {blurb}
          </p>
          <span className="chip purple">{phase}</span>
        </div>
      </div>
    </>
  );
}
