"use client";

// A row of one-click suggestions under a field, as small square keys: press one and the field is
// filled with it. A key may carry a note of what the network should make of it.

import type { Chip } from "@/lib/suggestions";

export function Suggest<T>({ label, chips, onPick, isOn }: { label: string; chips: Chip<T>[]; onPick: (value: T) => void; isOn?: (value: T) => boolean }) {
  if (!chips.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {chips.map((c, i) => (
        <button key={i + ":" + c.label} type="button" className="chip" aria-pressed={isOn ? isOn(c.value) : undefined} onClick={() => onPick(c.value)}>
          <span>{c.label}</span>
          {c.tag && <span className="tag">{c.tag}</span>}
        </button>
      ))}
    </div>
  );
}
