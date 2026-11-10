import type { ReactNode } from "react";

/** A mono label over a single ruled line to write on. */
export function Field({ label, note, className, children }: { label: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span className="label-text">
        {label}
        {note && <span className="optional"> ({note})</span>}
      </span>
      {children}
    </label>
  );
}
