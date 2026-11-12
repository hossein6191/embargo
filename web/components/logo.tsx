// The mark (lib/mark.ts) inline, so it is crisp at every size: a clock face whose hand is a padlock.

import { markBody } from "@/lib/mark";

export function Mark({ size = 36, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className} dangerouslySetInnerHTML={{ __html: markBody() }} />;
}
