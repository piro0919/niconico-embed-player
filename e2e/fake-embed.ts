import type { Page } from "@playwright/test";

/**
 * A stand-in for the embed page, served at embed.nicovideo.jp so messages carry
 * the real origin. It answers only what the player uses, and records every
 * command it receives in `window.received`.
 *
 * With `blockFirstPlay`, the first `play` is answered with a bare pause, the way
 * iPhone Safari reports a blocked start.
 */
function fakeEmbed({ blockFirstPlay }: { blockFirstPlay: boolean }): string {
  return `<!doctype html><title>embed</title><script>
(() => {
  const params = new URLSearchParams(location.search);
  const playerId = params.get("playerId");
  const DURATION = 200000;
  let current = Number(params.get("from") || 0) * 1000;
  let block = ${blockFirstPlay};
  window.received = [];
  const post = (eventName, data) => parent.postMessage({ eventName, playerId, data }, "*");
  const status = (playerStatus) => post("statusChange", { playerStatus, seekStatus: 0 });
  const meta = () => post("playerMetadataChange", { currentTime: current, duration: DURATION });
  addEventListener("message", (e) => {
    const { eventName, data } = e.data || {};
    if (!eventName) return;
    window.received.push({ eventName, data });
    if (eventName === "play") {
      if (block) { block = false; status(3); return; }
      current += 1000;
      status(2);
      meta();
    }
    if (eventName === "pause") status(3);
    if (eventName === "seek") { current = data.time; meta(); }
  });
  post("loadComplete", {});
  meta();
})();
</script>`;
}

export async function useFakeEmbed(page: Page, blockFirstPlay = false) {
  await page.route("https://embed.nicovideo.jp/**", (route) =>
    route.fulfill({
      body: fakeEmbed({ blockFirstPlay }),
      contentType: "text/html",
    }),
  );
}

/** Commands the current embed received, by name. */
export async function received(page: Page): Promise<string[]> {
  const frame = page
    .frames()
    .findLast((f) => f.url().startsWith("https://embed.nicovideo.jp/"));
  if (!frame) return [];
  return frame.evaluate(() =>
    (window as unknown as { received: { eventName: string }[] }).received.map(
      (m) => m.eventName,
    ),
  );
}
