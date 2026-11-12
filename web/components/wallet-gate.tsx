"use client";

// Around every signing key: with no wallet connected it offers to connect one, on another chain it
// offers the switch, and only on GenLayer Studio (or in the demo build) does it show the key itself.

import { Key } from "@/components/keycap";
import { useWallet } from "@/components/wallet";
import { isMock } from "@/lib/chain";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const w = useWallet();
  if (isMock || (w.address && w.onStudio)) return <>{children}</>;
  if (!w.address)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Key tone="blue" disabled={w.connecting} onClick={() => void w.connect()}>
          {w.connecting ? "Connecting…" : "Connect a wallet to sign"}
        </Key>
        <span className="text-[13.5px] text-ink-2">Rabby or MetaMask; the wallet menu gives 10 test GEN.</span>
      </div>
    );
  return (
    <Key tone="red" className="mt-3" onClick={() => void w.switchToStudio()}>
      Switch the wallet to Studio
    </Key>
  );
}
