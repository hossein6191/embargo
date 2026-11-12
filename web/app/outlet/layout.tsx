import type { Metadata } from "next";

export const metadata: Metadata = { title: "For outlets", description: "Join a release under embargo with a bond and your site prefix, and take the bond back once it lifts." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
