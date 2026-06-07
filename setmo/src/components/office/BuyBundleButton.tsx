"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { BundleModal } from "@/components/billing/BundleModal";

export function BuyBundleButton({
  bundles,
  label = "Buy bundle",
  className = "btn btn-ghost",
  block = false,
}: {
  bundles: { hours: number; priceUsd: number; popular?: boolean }[];
  label?: string;
  className?: string;
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} style={block ? { width: "100%" } : undefined} onClick={() => setOpen(true)}>
        <Icon name="card" size={16} /> {label}
      </button>
      {open && <BundleModal bundles={bundles} onClose={() => setOpen(false)} />}
    </>
  );
}
