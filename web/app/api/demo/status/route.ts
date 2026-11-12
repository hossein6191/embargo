// GET /api/demo/status: whether the demo desk can act now, the three public addresses it derives from
// DEMO_KEY (the issuer and the two outlets, with their prefixes), the newest demo release and whether
// both outlets joined it, and exactly why not when it cannot: "no key set", "the key set is not a 0x
// private key of 64 hex characters", "the contract is not deployed yet", Studio's RPC not answering,
// a demo account with no GEN, or the outlets' pages not pinned to a commit. The key is never echoed.

import { demoStatusNow } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Three balance reads (perhaps a faucet payment) and two or three views, retried while Studio is slow.
export const maxDuration = 60;

export async function GET() {
  return Response.json(await demoStatusNow(), { headers: { "cache-control": "no-store" } });
}
