import { ImageResponse } from "next/og";

import { DESK, markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The app icon: the padlocked clock face on the slate desk.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: DESK }}>
        <img src={markDataUri(146)} width={146} height={146} alt="" />
      </div>
    ),
    size,
  );
}
