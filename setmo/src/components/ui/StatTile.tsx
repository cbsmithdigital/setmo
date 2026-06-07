export function StatTile({
  lab,
  val,
  sub,
  subClass,
  grad,
}: {
  lab: string;
  val: string;
  sub?: string;
  subClass?: string;
  grad?: string;
}) {
  return (
    <div className="stat-tile">
      <div className="lab">{lab}</div>
      <div
        className="val"
        style={
          grad
            ? { background: grad, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }
            : undefined
        }
      >
        {val}
      </div>
      {sub && <div className={"sub " + (subClass ?? "")}>{sub}</div>}
    </div>
  );
}
