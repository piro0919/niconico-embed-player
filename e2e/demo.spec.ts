import { expect, type Page, test } from "@playwright/test";
import { received, useFakeEmbed } from "./fake-embed";

const logged = (page: Page, name: string) =>
  page.locator("ol li").filter({ hasText: name });

test("plays on load and pauses from the button", async ({ page }) => {
  await useFakeEmbed(page);
  await page.goto("/");
  await expect(logged(page, "onPlaying")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(logged(page, "onPaused")).toHaveCount(1);
  await expect(logged(page, "onBlocked")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("reports a bare pause on start as blocked, and Play starts it", async ({
  page,
}) => {
  await useFakeEmbed(page, true);
  await page.goto("/");
  await expect(logged(page, "onBlocked")).toHaveCount(1);
  await expect(logged(page, "onPaused")).toHaveCount(0);

  await page.getByRole("button", { name: "Play" }).click();
  await expect(logged(page, "onPlaying")).toHaveCount(1);
});

test("sends volume, mute and seek to the embed", async ({ page }) => {
  await useFakeEmbed(page);
  await page.goto("/");
  await expect(logged(page, "onPlaying")).toHaveCount(1);
  // The length is polled, so the position slider has no range until it shows
  await expect(page.getByText(/ \/ 3:20$/)).toBeVisible();

  await page.getByRole("slider", { name: "Volume" }).fill("40");
  await page.getByRole("checkbox", { name: "Mute" }).check();
  await page.getByRole("slider", { name: "Position" }).fill("30");
  await expect
    .poll(() => received(page))
    .toEqual(expect.arrayContaining(["volumeChange", "mute", "seek"]));
  await expect(page.getByText("0:30 / 3:20")).toBeVisible();
});

test("hides comments before playing when asked", async ({ page }) => {
  await useFakeEmbed(page);
  await page.goto("/");
  await expect(logged(page, "onPlaying")).toHaveCount(1);

  await page.getByRole("checkbox", { name: "Hide comments" }).check();
  await expect(logged(page, "onPlaying")).toHaveCount(2);
  const commands = await received(page);
  expect(commands).toContain("commentVisibilityChange");
  expect(commands.indexOf("commentVisibilityChange")).toBeLessThan(
    commands.indexOf("play"),
  );
});

test("loads another video into a new iframe", async ({ page }) => {
  await useFakeEmbed(page);
  await page.goto("/");
  await expect(logged(page, "onPlaying")).toHaveCount(1);

  await page.getByRole("textbox", { name: "Video ID" }).fill("sm10");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator('iframe[src*="/watch/sm10"]')).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(logged(page, "onPlaying")).toHaveCount(2);
});

test("ignores messages that do not come from the embed's origin", async ({
  page,
}) => {
  await useFakeEmbed(page);
  await page.goto("/");
  await expect(logged(page, "onPlaying")).toHaveCount(1);

  const src = await page.locator("iframe").getAttribute("src");
  const playerId = new URL(src ?? "").searchParams.get("playerId");
  await page.evaluate((id) => {
    window.postMessage(
      { data: { playerStatus: 4 }, eventName: "statusChange", playerId: id },
      "*",
    );
  }, playerId);
  await page.waitForTimeout(500);
  await expect(logged(page, "onEnded")).toHaveCount(0);
});

test("shows the Japanese page at /ja", async ({ page }) => {
  await useFakeEmbed(page);
  await page.goto("/ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("button", { name: "読み込む" })).toBeVisible();
});
