import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The demo release",
  description: "Lantern Bay Ferries' night crossing under embargo, held by two fictional outlets: deposit credit and report a page with one click.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
