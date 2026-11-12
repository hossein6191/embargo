// POST /api/demo/join {release}: both demo outlets join a release with their pinned prefixes, so a
// visitor who issued a release can play the issuer and see it reported. Only the release id is read
// from the request. Refused when the embargo lifts in under three minutes, when the bond is over 1 GEN,
// or when both have joined already. Rate-limited per release; answers the hashes, or why not.

import { sendJoin } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let release = "";
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { release?: unknown };
    release = typeof body.release === "string" ? body.release : "";
  } catch {
    release = "";
  }
  const answer = await sendJoin(release);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
