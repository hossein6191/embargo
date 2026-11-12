"use client";

// The three states every read shows: a blank strip being typed (loading), the data, or the line that
// says the network could not be reached, with a retry. A failed read is never "nothing here".

import { NETWORK_ERROR, NO_CONTRACT, RATE_LIMITED, isMock } from "@/lib/chain";
import { Key } from "@/components/keycap";

export function Placeholder({ lines = 3, label = "Receiving from the wire" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-3">
      <p className="slug caret">{label}</p>
      <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="block h-3 bg-paper-3" style={{ width: `${92 - i * 17}%` }} />
        ))}
      </div>
    </div>
  );
}

export function NotDeployed() {
  return (
    <div className="bulletin bulletin-advisory p-4">
      <p className="slug text-blue">Advisory · no contract yet</p>
      <p className="mt-2 font-sans text-[15px]">
        The Embargo contract is not deployed for this site yet, so there is nothing to read or sign. Once its address is set (NEXT_PUBLIC_CONTRACT, or DEMO_CONTRACT in lib/config.ts) every page reads it live.
      </p>
    </div>
  );
}

export function ReadError({ error, retry }: { error: string; retry: () => void }) {
  if (error === NO_CONTRACT && !isMock) return <NotDeployed />;
  const limited = error === RATE_LIMITED;
  return (
    <div role="alert" className="bulletin bulletin-flash p-4">
      <p className="slug text-red">{limited ? "Line busy" : "Line down"}</p>
      <p className="mt-2 font-sans text-[15px]">
        {limited
          ? "Studio is rate-limiting this browser (30 reads a minute). The page tries again by itself in about twenty seconds; nothing is lost."
          : `The page ${error === NETWORK_ERROR ? "could not reach the network" : error}. That says nothing about what is on the contract; try again.`}
      </p>
      <Key size="sm" className="mt-3" onClick={retry}>
        Try again
      </Key>
    </div>
  );
}
