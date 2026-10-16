import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNiconicoPool, type NiconicoPool } from "../src";

/**
 * The preloader on jsdom. Each iframe's postMessage is recorded, and the
 * embed's replies are dispatched as `message` events. Ported from Vocafy's
 * niconico-pool tests.
 */

const ORIGIN = "https://embed.nicovideo.jp";

type Sent = { eventName: string; data?: Record<string, unknown> };

let container: HTMLElement;
let playing: string | undefined;
let pool: NiconicoPool;
const sent = new Map<HTMLIFrameElement, Sent[]>();

const boxes = () => [...container.children] as HTMLElement[];
const iframeOf = (box: HTMLElement) => {
  const iframe = box.querySelector("iframe");
  if (!iframe) throw new Error("no iframe");
  return iframe;
};
const playerIdOf = (box: HTMLElement) =>
  new URL(iframeOf(box).src).searchParams.get("playerId") ?? "";
/** Commands sent to the box's iframe, by name. */
const sentNames = (box: HTMLElement) =>
  (sent.get(iframeOf(box)) ?? []).map((m) => m.eventName);

/** Starts recording each new iframe's postMessage as soon as it is placed. */
function recordNewIframes() {
  new MutationObserver(() => {
    for (const iframe of container.querySelectorAll("iframe")) {
      if (sent.has(iframe) || !iframe.contentWindow) continue;
      const list: Sent[] = [];
      sent.set(iframe, list);
      vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(
        (message: unknown, targetOrigin?: unknown) => {
          expect(targetOrigin).toBe(ORIGIN);
          const m = message as Sent;
          list.push({ eventName: m.eventName, data: m.data });
        },
      );
    }
  }).observe(container, { childList: true, subtree: true });
}

function receive(
  playerId: string,
  eventName: string,
  data?: Record<string, unknown>,
  origin = ORIGIN,
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      data: { eventName, playerId, data },
    }),
  );
}
const loaded = (playerId: string, origin = ORIGIN) =>
  receive(playerId, "loadComplete", undefined, origin);
const startedPlaying = (playerId: string) =>
  receive(playerId, "statusChange", { playerStatus: 2 });

/** MutationObserver reports after a microtask */
const settle = () => Promise.resolve();

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  playing = undefined;
  sent.clear();
  recordNewIframes();
  pool = createNiconicoPool({
    container: () => container,
    playing: () => playing,
  });
});

afterEach(() => {
  pool.destroy();
  container.remove();
  vi.restoreAllMocks();
});

describe("want", () => {
  it("loads the embed into a hidden box", () => {
    pool.want("sm1");
    expect(boxes()).toHaveLength(1);
    const [box] = boxes();
    expect(box?.hidden).toBe(true);
    if (!box) return;
    const iframe = iframeOf(box);
    expect(iframe.src).toContain(
      "/watch/sm1?jsapi=1&playerId=niconico-embed-player-pre-",
    );
    expect(iframe.allow).toBe("autoplay; fullscreen");
    expect(iframe.title).toBe("Niconico video player");
  });

  it("passes the start position as from, in whole seconds", () => {
    pool.destroy();
    pool = createNiconicoPool({
      container: () => container,
      startAt: (id) => (id === "sm1" ? 122.7 : undefined),
      title: "動画",
    });
    pool.want("sm1");
    pool.want("sm2");
    const [a, b] = boxes();
    if (!a || !b) throw new Error("no boxes");
    expect(iframeOf(a).src).toContain("&from=122");
    expect(iframeOf(b).src).not.toContain("from=");
    expect(iframeOf(a).title).toBe("動画");
  });

  it("keeps one embed for a video wanted twice", () => {
    pool.want("sm1");
    pool.want("sm1");
    expect(boxes()).toHaveLength(1);
  });

  it("does not preload the playing video", () => {
    playing = "sm1";
    pool.want("sm1");
    expect(boxes()).toHaveLength(0);
  });

  it("does nothing while there is no container", () => {
    const empty = createNiconicoPool({ container: () => null });
    expect(() => empty.want("sm1")()).not.toThrow();
    empty.destroy();
  });

  it("drops the embed once nothing wants it, and loads it again when wanted", () => {
    const a = pool.want("sm1");
    const b = pool.want("sm1");
    const [box] = boxes();
    a();
    expect(box?.isConnected).toBe(true);
    b();
    expect(box?.isConnected).toBe(false);
    pool.want("sm1");
    expect(boxes()).toHaveLength(1);
    expect(boxes()[0]).not.toBe(box);
  });

  it("does not count below zero when a release is called twice", () => {
    const a = pool.want("sm1");
    a();
    a();
    pool.want("sm1");
    const c = pool.want("sm1");
    c();
    expect(boxes()).toHaveLength(1);
  });
});

describe("status", () => {
  it("is none, then loading, then ready, and none once taken", () => {
    expect(pool.status("sm1")).toEqual({ preload: "none" });
    pool.want("sm1");
    expect(pool.status("sm1").preload).toBe("loading");
    expect(pool.status("sm1").ms).toBeGreaterThanOrEqual(0);
    const [box] = boxes();
    if (!box) throw new Error("no box");
    loaded(playerIdOf(box));
    expect(pool.status("sm1").preload).toBe("ready");
    pool.take("sm1");
    expect(pool.status("sm1")).toEqual({ preload: "none" });
  });
});

describe("take", () => {
  it("gives nothing before the embed has loaded", () => {
    pool.want("sm1");
    expect(pool.take("sm1")).toBeNull();
    expect(pool.take("sm9")).toBeNull();
  });

  it("hands over a loaded embed once and stops holding it", () => {
    pool.want("sm1");
    const [box] = boxes();
    if (!box) throw new Error("no box");
    const id = playerIdOf(box);
    loaded(id);
    const taken = pool.take("sm1");
    expect(taken).toEqual({
      videoId: "sm1",
      playerId: id,
      iframe: iframeOf(box),
      box,
    });
    expect(pool.take("sm1")).toBeNull();
  });

  it("ignores messages from another origin or another embed", () => {
    pool.want("sm1");
    const [box] = boxes();
    if (!box) throw new Error("no box");
    loaded(playerIdOf(box), "https://example.com");
    loaded("niconico-embed-player-pre-other");
    expect(pool.take("sm1")).toBeNull();
  });

  it("keeps a taken embed when its video leaves view", () => {
    const release = pool.want("sm1");
    const [box] = boxes();
    if (!box) throw new Error("no box");
    loaded(playerIdOf(box));
    pool.take("sm1");
    release();
    expect(box.isConnected).toBe(true);
  });
});

describe("warming", () => {
  it("plays muted once loaded and pauses once, when playback starts", async () => {
    pool.want("sm1");
    await settle();
    const [box] = boxes();
    if (!box) throw new Error("no box");
    const id = playerIdOf(box);
    loaded(id);
    expect(sent.get(iframeOf(box))?.slice(0, 2)).toEqual([
      { eventName: "mute", data: { mute: true } },
      { eventName: "play", data: undefined },
    ]);
    startedPlaying(id);
    startedPlaying(id);
    expect(sentNames(box)).toEqual(["mute", "play", "pause"]);
  });

  it("does not pause a taken embed, which the player is now playing", async () => {
    pool.want("sm1");
    await settle();
    const [box] = boxes();
    if (!box) throw new Error("no box");
    const id = playerIdOf(box);
    loaded(id);
    pool.take("sm1");
    startedPlaying(id);
    expect(sentNames(box)).toEqual(["mute", "play"]);
  });
});

describe("refresh", () => {
  it("preloads a taken video again once another video plays", () => {
    pool.want("sm1");
    const [first] = boxes();
    if (!first) throw new Error("no box");
    loaded(playerIdOf(first));
    playing = "sm1";
    pool.take("sm1");
    // Not while it plays
    pool.refresh();
    expect(boxes()).toHaveLength(1);
    playing = "sm2";
    pool.refresh();
    expect(boxes()).toHaveLength(2);
    const second = boxes()[1];
    if (!second) throw new Error("no box");
    loaded(playerIdOf(second));
    expect(pool.take("sm1")?.playerId).toBe(playerIdOf(second));
  });

  it("drops the embed of a video that started playing without it", () => {
    pool.want("sm1");
    const [box] = boxes();
    // Tapped while loading: played by another player
    playing = "sm1";
    pool.refresh();
    expect(box?.isConnected).toBe(false);
    expect(pool.status("sm1")).toEqual({ preload: "none" });
  });

  it("leaves out videos out of view and videos already held", () => {
    const release = pool.want("sm1");
    pool.want("sm2");
    release();
    pool.refresh();
    expect(boxes()).toHaveLength(1);
  });
});

describe("destroy", () => {
  it("drops every embed and ignores later messages", () => {
    pool.want("sm1");
    pool.want("sm2");
    const [box] = boxes();
    if (!box) throw new Error("no box");
    const id = playerIdOf(box);
    pool.destroy();
    expect(boxes()).toHaveLength(0);
    loaded(id);
    expect(pool.take("sm1")).toBeNull();
  });
});
