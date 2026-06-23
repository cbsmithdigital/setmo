"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InviteModal } from "@/components/billing/InviteModal";

export function InviteButton({
  label = "Invite users",
  className = "btn btn-primary",
  scope = "office",
  offices = [],
  allowGroupAdmin = false,
}: {
  label?: string;
  className?: string;
  scope?: "office" | "group";
  offices?: { id: string; name: string }[];
  allowGroupAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        <Icon name="team" size={17} /> {label}
      </button>
      {open && <InviteModal scope={scope} offices={offices} allowGroupAdmin={allowGroupAdmin} onClose={() => setOpen(false)} />}
    </>
  );
}
