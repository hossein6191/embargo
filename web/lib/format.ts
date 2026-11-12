// Small formatters shared by the pages, the waiting copy and the tests. Pure.

const GEN = 10n ** 18n;

const toBig = (v: string | bigint | number): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  return /^-?\d+$/.test(String(v).trim()) ? BigInt(String(v).trim()) : 0n;
};

/** "0.1 GEN", "0.002 GEN", "20 GEN": up to four decimals, trailing zeros dropped. */
export function gen(atto: string | bigint | number, decimals = 4): string {
  const a = toBig(atto);
  const neg = a < 0n;
  const v = neg ? -a : a;
  const whole = v / GEN;
  const frac = (v % GEN).toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""} GEN`;
}

/** "0.1" GEN as text into atto; null when it is not a plain decimal with at most 18 places. */
export function parseGen(text: string): bigint | null {
  const t = String(text ?? "").trim();
  const m = /^(\d{1,9})(?:\.(\d{1,18}))?$/.exec(t) || /^\.(\d{1,18})$/.exec(t);
  if (!m) return null;
  if (t.startsWith(".")) return BigInt((m[1] ?? "").padEnd(18, "0"));
  return BigInt(m[1]) * GEN + BigInt((m[2] ?? "").padEnd(18, "0") || "0");
}

const two = (n: number) => String(n).padStart(2, "0");

/** "14:30" in UTC for a unix time. */
export const utcClock = (unix: number): string => {
  const d = new Date(unix * 1000);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};

/** "14:30" in the reader's own time zone. */
export const localClock = (unix: number): string => {
  const d = new Date(unix * 1000);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** "12 NOV 2026" in UTC. */
export const utcDate = (unix: number): string => {
  const d = new Date(unix * 1000);
  const m = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
};

/** "12 NOV 14:30 UTC". */
export const utcStamp = (unix: number): string => (unix > 0 ? `${utcDate(unix).replace(/ \d{4}$/, "")} ${utcClock(unix)} UTC` : "--");

/** A countdown: "00:28:41"; past a day "2 D 03:00:00". */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const body = `${two(h)}:${two(m)}:${two(s % 60)}`;
  return d > 0 ? `${d} D ${body}` : body;
}

/** "28 min", "1 h 5 min", "2 days", "40 s". */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? "" : "s"}`;
}

export const shortAddr = (a: string): string => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");
