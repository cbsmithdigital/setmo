"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InviteModal } from "@/components/billing/InviteModal";

export function InviteButton({
  seatsFree,
  label = "Invite setters",
  className = "btn btn-primary",
}: {
  seatsFree: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        <Icon name="team" size={17} /> {label}
      </button>
      {open && <InviteModal seatsFree={seatsFree} onClose={() => setOpen(false)} />}
    </>
  );
}
