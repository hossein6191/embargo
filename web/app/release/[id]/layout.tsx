// The route's own browser title, from the URL alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^E?([1-9]\d{0,8})$/i.exec(id);
  return {
    title: m ? `Release E${m[1]}` : "Release",
    description: "One release on the wire: its embargo and countdown, its outlets, the report desk and every report's bulletin.",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
