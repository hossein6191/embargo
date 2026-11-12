// POST /api/demo/open: when no demo release is still under embargo, the demo issuer issues a fresh one
// ("Lantern Bay Ferries adds a night crossing to Gull Island", its embargo about thirty minutes ahead,
// 0.1 GEN bond) and both demo outlets join it with their pinned prefixes; when one still holds, the
// outlets that have not joined it do. Takes no body: nothing a visitor types is signed. Rate-limited,
// one signature at a time; answers the transaction hashes, or why not. The key is never logged.

import { sendOpen } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One issue followed for up to forty seconds, then two joins.
export const maxDuration = 60;

export async function POST() {
  const answer = await sendOpen();
  return Response.json(answer.body, { status: answer.status, headers: { "cache-control": "no-store" } });
}
