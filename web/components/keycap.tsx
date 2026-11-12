// Square keycaps: every button on the site is a key that goes down when pressed. Red for the call that
// moves a bond or files a report, blue for the time-lock, cream for everything else.

import Link from "next/link";
import * as React from "react";

type Tone = "plain" | "red" | "blue";
type Size = "md" | "sm";

const cls = (tone: Tone, size: Size, block?: boolean, extra?: string) =>
  ["key", tone === "red" && "key-red", tone === "blue" && "key-blue", size === "sm" && "key-sm", block && "key-block", extra].filter(Boolean).join(" ");

export function Key({
  tone = "plain",
  size = "md",
  block,
  className,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: Size; block?: boolean }) {
  return <button type={type} className={cls(tone, size, block, className)} {...rest} />;
}

export function KeyLink({ href, tone = "plain", size = "md", block, className, children }: { href: string; tone?: Tone; size?: Size; block?: boolean; className?: string; children: React.ReactNode }) {
  if (/^https?:/.test(href))
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls(tone, size, block, className)}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls(tone, size, block, className)}>
      {children}
    </Link>
  );
}
