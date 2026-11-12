"use client";

// The demo desk's status (GET /api/demo/status, or the in-memory desk in mock mode), re-read after
// every final transaction.

import { useAfterTx, useRead } from "@/components/use-read";
import { forgetDemoStatus, readDemoStatus } from "@/lib/chain";
import type { DemoStatus } from "@/lib/types";

export function useDemoStatus() {
  const s = useRead<DemoStatus>(async () => ({ data: await readDemoStatus(), source: "chain" }), []);
  useAfterTx(() => {
    forgetDemoStatus();
    return s.refresh();
  });
  return s;
}
