"use client";

// Any release on the wire, by id: the same desk as the demo release.

import { useParams } from "next/navigation";

import { ReleaseDesk } from "@/components/release-desk";
import { parseReleaseId } from "@/lib/rules";

export default function ReleasePage() {
  const params = useParams<{ id: string }>();
  const id = parseReleaseId(String(params?.id ?? ""));
  if (!id) return <p className="mono py-6 text-[14px]">THAT IS NOT A RELEASE ID. Releases are numbered E1, E2 and so on; the ledger lists them all.</p>;
  return (
    <div className="flex flex-col gap-4 pt-2">
      <p className="slug">Release {id}</p>
      <ReleaseDesk id={id} />
    </div>
  );
}
