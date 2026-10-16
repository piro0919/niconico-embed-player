import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The e2e run builds elsewhere so it does not overwrite a running dev server
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
