import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const alt = "niconico-embed-player";

export const size = { height: 630, width: 1200 };

export const contentType = "image/png";

const FACE_SIZE = 300;

type ImageProps = {
  params: Promise<{ locale: string }>;
};

export default async function Image({ params }: ImageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "header" });
  /* The heading face, cut down to the characters these cards show. Change the
     copy and rebuild it per assets/README.md. */
  const font = await readFile(
    join(process.cwd(), "assets/DelaGothicOne-subset.ttf"),
  );
  const icon = await readFile(join(process.cwd(), "src/app/icon.svg"));
  const face = `data:image/svg+xml;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0b0b0f",
        color: "#ffffff",
        display: "flex",
        fontFamily: "Dela Gothic One",
        height: "100%",
        justifyContent: "space-between",
        padding: "0 90px",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 700,
        }}
      >
        <div style={{ display: "flex", fontSize: 48 }}>
          niconico-embed-player
        </div>
        <div
          style={{
            color: "#a1a1aa",
            display: "flex",
            flexDirection: "column",
            fontSize: 30,
            lineHeight: 1.5,
            marginTop: 28,
          }}
        >
          {/* One line per clause, so Japanese does not break inside a word */}
          {t("tagline")
            .split(/(?<=、)/)
            .map((line) => (
              <div key={line} style={{ display: "flex" }}>
                {line}
              </div>
            ))}
        </div>
        <div
          style={{
            color: "#71717a",
            display: "flex",
            fontSize: 26,
            marginTop: 48,
          }}
        >
          kkweb.io
        </div>
      </div>
      {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
      <img alt="" height={FACE_SIZE} src={face} width={FACE_SIZE} />
    </div>,
    {
      ...size,
      fonts: [{ data: font, name: "Dela Gothic One", style: "normal" }],
    },
  );
}
