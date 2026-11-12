// The mark: a wire-room clock face whose one hand is a padlock, the hour locked until it lifts. One
// SVG source for the header logo, the browser icon (app/icon.svg is the same drawing), the app icon and
// the share card. Pure.

export const PAPER = "#FBF6E4";
export const DESK = "#2B3240";
export const INK = "#1E2430";
export const RED = "#C1121F";
export const BLUE = "#1D4E89";

/** The drawing inside a 64 x 64 box. */
export function markBody(): string {
  const ticks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r1 = i % 3 === 0 ? 20 : 22.5;
    const x1 = (32 + r1 * Math.sin(a)).toFixed(2);
    const y1 = (32 - r1 * Math.cos(a)).toFixed(2);
    const x2 = (32 + 26 * Math.sin(a)).toFixed(2);
    const y2 = (32 - 26 * Math.cos(a)).toFixed(2);
    ticks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i === 0 ? RED : INK}" stroke-width="${i % 3 === 0 ? 3 : 2}" stroke-linecap="round"/>`);
  }
  return [
    `<circle cx="32" cy="32" r="29.5" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`,
    ...ticks,
    `<g transform="rotate(38 32 32)">`,
    `<line x1="32" y1="32" x2="32" y2="24" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
    `<path d="M28.2 16.5v-3.2a3.8 3.8 0 0 1 7.6 0v3.2" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/>`,
    `<rect x="25.5" y="15.8" width="13" height="10.4" rx="2" fill="${BLUE}"/>`,
    `<circle cx="32" cy="20" r="1.7" fill="${PAPER}"/>`,
    `<rect x="31.25" y="20.5" width="1.5" height="3" fill="${PAPER}"/>`,
    `</g>`,
    `<circle cx="32" cy="32" r="3.4" fill="${RED}" stroke="${INK}" stroke-width="1.5"/>`,
  ].join("");
}

export function markSvg(size = 64): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${markBody()}</svg>`;
}

export const markDataUri = (size = 64): string => `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(markSvg(size)) : Buffer.from(markSvg(size)).toString("base64")}`;
