import { ImageResponse } from "next/og";

import { wireFonts } from "@/lib/og-fonts";
import { BLUE, DESK, INK, PAPER, RED, markDataUri } from "@/lib/mark";

export const alt = "Embargo: a press embargo with teeth. Outlets post a bond; a page that reports the story before the lift, read by GenLayer validators, sends the bond to the issuer.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HOLD = "HOLD FOR RELEASE UNTIL 09:00 UTC";
const TITLE = "Embargo";
const LINE = "A press embargo with teeth.";
const SUB = "Break it early, and the validators read your page on the live web.";
const TAPE = "T-00:28:41  ·  BOND 0.1 GEN  ·  GENLAYER STUDIO";

// The share card: a strip of wire paper with its feed holes, on the slate desk.
export default async function OpenGraphImage() {
  const fonts = await wireFonts(HOLD + TITLE + LINE + SUB + TAPE);
  const serif = fonts.length ? "Newsreader" : "serif";
  const mono = fonts.length ? "Red Hat Mono" : "monospace";
  const holes = Array.from({ length: 21 }, (_, i) => 18 + i * 30);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: DESK, padding: "0 90px" }}>
        <div style={{ display: "flex", flex: 1, backgroundColor: PAPER, position: "relative" }}>
          {holes.map((y) => (
            <div key={"l" + y} style={{ position: "absolute", left: 20, top: y, width: 14, height: 14, borderRadius: 7, backgroundColor: DESK }} />
          ))}
          {holes.map((y) => (
            <div key={"r" + y} style={{ position: "absolute", right: 20, top: y, width: 14, height: 14, borderRadius: 7, backgroundColor: DESK }} />
          ))}
          <div style={{ display: "flex", flexDirection: "column", padding: "56px 90px", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <img src={markDataUri(84)} width={84} height={84} alt="" />
              <div style={{ fontFamily: serif, fontSize: 64, fontWeight: 700, color: INK, letterSpacing: 4 }}>{TITLE.toUpperCase()}</div>
            </div>
            <div style={{ marginTop: 40, fontFamily: mono, fontSize: 34, fontWeight: 700, color: RED, letterSpacing: 1 }}>{HOLD}</div>
            <div style={{ marginTop: 18, fontFamily: serif, fontSize: 58, fontWeight: 700, color: INK, lineHeight: 1.05 }}>{LINE}</div>
            <div style={{ marginTop: 18, fontFamily: serif, fontSize: 30, color: "#474E5D" }}>{SUB}</div>
            <div style={{ marginTop: 34, display: "flex", borderTop: `3px solid ${INK}`, paddingTop: 16, fontFamily: mono, fontSize: 24, fontWeight: 700, color: BLUE }}>{TAPE}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
