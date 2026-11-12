import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ledger", description: "Every release on the contract, newest first, with the totals: bonds held, broken, kept, unclear and released." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
