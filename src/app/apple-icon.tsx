import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { height: 180, width: 180 };

export const contentType = "image/png";

export default async function AppleIcon() {
  // The same drawing as icon.svg, with square corners, since iOS rounds them
  const svg = (
    await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8")
  ).replace(/ rx="\d+"/, "");
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    // biome-ignore lint/performance/noImgElement: ImageResponse renders plain img
    <img alt="" height={size.height} src={src} width={size.width} />,
    { ...size },
  );
}
