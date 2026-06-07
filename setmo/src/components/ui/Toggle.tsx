"use client";

export function Toggle({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      disabled={disabled}
      style={{
        width: 46,
        height: 27,
        borderRadius: 99,
        padding: 3,
        background: on ? "var(--grad-mint)" : "var(--s4)",
        transition: "background .25s",
        flex: "none",
        position: "relative",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        style={{
          display: "block",
          width: 21,
          height: 21,
          borderRadius: "50%",
          background: "#fff",
          transform: on ? "translateX(19px)" : "translateX(0)",
          transition: "transform .25s var(--spring)",
          boxShadow: "0 2px 6px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}
