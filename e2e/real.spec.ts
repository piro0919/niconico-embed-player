import { expect, type Page, test } from "@playwright/test";

/**
 * Against the real embed.nicovideo.jp. Run on demand (the `real` project) to
 * catch Niconico changing the undocumented protocol.
 */

const logged = (page: Page, name: string) =>
  page.locator("ol li").filter({ hasText: name });

test("the real embed loads, plays, seeks and pauses @real", async ({
  page,
}) => {
  // The real player loads a video over the network
  test.setTimeout(180_000);
  await page.goto("/");
  // Autoplay with sound may be blocked; a click is a user gesture
  await expect(
    logged(page, "onPlaying").or(logged(page, "onBlocked")).first(),
  ).toBeVisible({ timeout: 60_000 });
  if ((await logged(page, "onPlaying").count()) === 0) {
    await page.getByRole("button", { name: "Play" }).click();
    await expect(logged(page, "onPlaying").first()).toBeVisible({
      timeout: 30_000,
    });
  }

  // Time arrives from playerMetadataChange in milliseconds
  await expect(page.getByText(/^0:0[1-9] \/ \d+:\d\d$/)).toBeVisible({
    timeout: 30_000,
  });

  // The demo once sent a second seek back to the old position here; only the
  // real embed showed it
  await page.getByRole("slider", { name: "Position" }).fill("60");
  await expect(page.getByText(/^1:0\d \/ /)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(logged(page, "onPaused").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(logged(page, "onError")).toHaveCount(0);
});
