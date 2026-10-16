import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the site's demo in real browsers. The default projects swap the embed
 * for a fake (e2e/fake-embed.ts), so they run in CI without touching Niconico.
 * The `real` project talks to embed.nicovideo.jp and only runs on demand, to
 * notice when Niconico changes the protocol.
 *
 * The site is built into a separate folder so a running dev server's .next is
 * left alone.
 */
const port = 3151;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      grepInvert: /@real/,
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      grepInvert: /@real/,
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      grep: /@real/,
      name: "real",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${port}`,
    env: { NEXT_DIST_DIR: ".next-e2e" },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    url: baseURL,
  },
});
