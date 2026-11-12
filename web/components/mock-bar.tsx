"use client";

// Mock mode only. There is no wallet and no chain: the visitor acts as one of two demo wallets of the
// in-memory contract, and this bar says so on every page, lets them switch, gives test GEN, and moves
// the clock on so an embargo can be seen lifting.

import { useLocal } from "@/components/use-local";
import { PERSONAS, advanceClock, mockAddress, mockBalanceText, mockClockOffset, setMockPersona } from "@/lib/chain-mock";
import { faucet } from "@/lib/chain";
import { gen, span } from "@/lib/format";

export function MockBar() {
  const address = useLocal(mockAddress, PERSONAS[0].address);
  const balance = useLocal(() => mockBalanceText(mockAddress()), "0");
  const offset = useLocal(mockClockOffset, 0);
  return (
    <div className="mb-4 border-2 border-dashed border-blue bg-blue-wash px-3 py-2 text-[13px]">
      <p>
        <strong className="slug text-blue">Demo build.</strong> An in-memory copy of the contract: no page is fetched and no model is asked here. The four demo pages are found as the demo expects; any other address
        cannot be fetched and stores nothing. A reload starts again.
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <label htmlFor="mock-persona" className="slug shrink-0 text-[11px]">
          Acting as
        </label>
        <select id="mock-persona" value={address} onChange={(e) => setMockPersona(e.target.value)} className="field h-9 min-h-0 max-w-full min-w-0 py-0 text-xs sm:w-auto">
          {PERSONAS.map((p) => (
            <option key={p.address} value={p.address}>
              {p.name}: {p.note}
            </option>
          ))}
        </select>
        <span className="mono whitespace-nowrap">{gen(balance)}</span>
        <button type="button" className="chip" onClick={() => void faucet(address)}>
          +10 GEN
        </button>
        <button type="button" className="chip" onClick={() => advanceClock(300)}>
          Clock +5 min
        </button>
        <button type="button" className="chip" onClick={() => advanceClock(1800)}>
          +30 min
        </button>
        {offset > 0 && <span className="mono text-ink-2">clock moved on {span(offset)}</span>}
      </div>
    </div>
  );
}
