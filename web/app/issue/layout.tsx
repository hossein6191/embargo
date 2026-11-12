import type { Metadata } from "next";

export const metadata: Metadata = { title: "Issue a release", description: "Issue a release under embargo, then invite the two demo outlets to join it." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
