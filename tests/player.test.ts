import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNiconicoEngine, type NiconicoEngine } from "../src";

const ORIGIN = "https://embed.nicovideo.jp";

type Sent = { eventName: string; data?: Record<string, unknown> };

let container: HTMLElement;
let engine: NiconicoEngine | undefined;

/** The iframe the player placed, with its postMessage recorded. */
function frame() {
  const iframe = container.querySelector("iframe");
  if (!iframe?.contentWindow) throw new Error("no iframe");
  const playerId = new URL(iframe.src).searchParams.get("playerId") ?? "";
  return { iframe, playerId };
}

/** Records what the player sends to the current iframe. */
function record(iframe: HTMLIFrameElement) {
  const sent: Sent[] = [];
  vi.spyOn(iframe.contentWindow as Window, "postMessage").mockImplementation(
    (message: unknown, targetOrigin?: unknown) => {
      expect(targetOrigin).toBe(ORIGIN);
      const m = message as Sent & { sourceConnectorType: number };
      expect(m.sourceConnectorType).toBe(1);
      sent.push({ eventName: m.eventName, data: m.data });
    },
  );
  return sent;
}

/** Pretend the embed sent a message to the page. */
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

function events() {
  return {
    onPlaying: vi.fn(),
    onPaused: vi.fn(),
    onEnded: vi.fn(),
    onBlocked: vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  engine?.destroy();
  engine = undefined;
  container.remove();
  vi.restoreAllMocks();
});

describe("createNiconicoEngine", () => {
  it("embeds the video with jsapi, a playerId, from and a title", () => {
    engine = createNiconicoEngine(container, { videoId: "sm9", startAt: 12.7 });
    const { iframe, playerId } = frame();
    const url = new URL(iframe.src);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/watch/sm9");
    expect(url.searchParams.get("jsapi")).toBe("1");
    expect(url.searchParams.get("from")).toBe("12");
    expect(playerId).toMatch(/^niconico-embed-player-\d+$/);
    expect(iframe.allow).toBe("autoplay; fullscreen");
    expect(iframe.title).toBe("Niconico video player");
  });

  it("uses the given title", () => {
    engine = createNiconicoEngine(container, { videoId: "sm9", title: "動画" });
    expect(frame().iframe.title).toBe("動画");
  });

  it("only plays on load when nothing else is set, leaving comments shown", () => {
    engine = createNiconicoEngine(container, { videoId: "sm9" });
    const { iframe, playerId } = frame();
    const sent = record(iframe);
    receive(playerId, "loadComplete");
    expect(sent).toEqual([{ eventName: "play", data: undefined }]);
  });

  it("hides comments and applies volume and mute before playing", () => {
    engine = createNiconicoEngine(container, {
      videoId: "sm9",
      volume: 40,
      muted: true,
      hideComments: true,
    });
    const { iframe, playerId } = frame();
    const sent = record(iframe);
    receive(playerId, "loadComplete");
    expect(sent).toEqual([
      {
        eventName: "commentVisibilityChange",
        data: { commentVisibility: false },
      },
      { eventName: "volumeChange", data: { volume: 0.4 } },
      { eventName: "mute", data: { mute: true } },
      { eventName: "play", data: undefined },
    ]);
  });

  it("converts seconds and 0–100 to the embed's units", () => {
    engine = createNiconicoEngine(container, { videoId: "sm9" });
    const sent = record(frame().iframe);
    engine.seek(3.5);
    engine.setVolume(25);
    engine.setMuted(false);
    engine.pause();
    engine.play();
    expect(sent).toEqual([
      { eventName: "seek", data: { time: 3500 } },
      { eventName: "volumeChange", data: { volume: 0.25 } },
      { eventName: "mute", data: { mute: false } },
      { eventName: "pause", data: undefined },
      { eventName: "play", data: undefined },
    ]);
  });

  it("reports time in seconds", () => {
    engine = createNiconicoEngine(container, { videoId: "sm9" });
    expect(engine.time()).toEqual({ current: 0, duration: 0 });
    receive(frame().playerId, "playerMetadataChange", {
      currentTime: 1500,
      duration: 200000,
    });
    expect(engine.time()).toEqual({ current: 1.5, duration: 200 });
  });

  it("passes the start position as from and never seeks before playing", () => {
    engine = createNiconicoEngine(container, {
      videoId: "sm9",
      startAt: 61.5,
    });
    const { iframe, playerId } = frame();
    expect(new URL(iframe.src).searchParams.get("from")).toBe("61");
    const sent = record(iframe);
    receive(playerId, "loadComplete");
    expect(sent.map((m) => m.eventName)).not.toContain("seek");
    // The next video starts from the beginning
    engine.load("sm10");
    expect(frame().iframe.src).not.toContain("from=");
  });

  it("keeps a changed volume for the next video", () => {
    engine = createNiconicoEngine(container, { videoId: "sm9", volume: 40 });
    engine.setVolume(70);
    engine.load("sm10");
    const { iframe, playerId } = frame();
    const sent = record(iframe);
    receive(playerId, "loadComplete");
    expect(sent.find((m) => m.eventName === "volumeChange")?.data).toEqual({
      volume: 0.7,
    });
  });

  it("reports nothing while loading", () => {
    const on = events();
    engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
    receive(frame().playerId, "statusChange", { playerStatus: 1 });
    for (const fn of Object.values(on)) expect(fn).not.toHaveBeenCalled();
  });

  it("reports playing, paused and ended", () => {
    const on = events();
    engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
    const { playerId } = frame();
    receive(playerId, "statusChange", { playerStatus: 2 });
    expect(on.onPlaying).toHaveBeenCalledOnce();
    engine.pause();
    receive(playerId, "statusChange", { playerStatus: 3 });
    expect(on.onPaused).toHaveBeenCalledOnce();
    expect(on.onBlocked).not.toHaveBeenCalled();
    receive(playerId, "statusChange", { playerStatus: 4 });
    expect(on.onEnded).toHaveBeenCalledOnce();
  });

  describe("blocked playback", () => {
    it("reports player-error:video:play once", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      const { playerId } = frame();
      receive(playerId, "player-error:video:play");
      receive(playerId, "player-error:video:play");
      expect(on.onBlocked).toHaveBeenCalledOnce();
    });

    it("treats an unasked pause before time advanced as blocked (iPhone Safari)", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      receive(frame().playerId, "statusChange", { playerStatus: 3 });
      expect(on.onBlocked).toHaveBeenCalledOnce();
      expect(on.onPaused).not.toHaveBeenCalled();
    });

    it("treats a pause after time advanced as a pause", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      const { playerId } = frame();
      receive(playerId, "playerMetadataChange", { currentTime: 250 });
      receive(playerId, "statusChange", { playerStatus: 3 });
      expect(on.onPaused).toHaveBeenCalledOnce();
      expect(on.onBlocked).not.toHaveBeenCalled();
    });

    it("treats a pause while seeking as a pause", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      receive(frame().playerId, "statusChange", {
        playerStatus: 3,
        seekStatus: 1,
      });
      expect(on.onPaused).toHaveBeenCalledOnce();
      expect(on.onBlocked).not.toHaveBeenCalled();
    });

    it("treats the pause that follows player-error:video:play as a pause (WebKit)", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      const { playerId } = frame();
      receive(playerId, "statusChange", { playerStatus: 2 });
      receive(playerId, "player-error:video:play");
      receive(playerId, "statusChange", { playerStatus: 3 });
      expect(on.onBlocked).toHaveBeenCalledOnce();
      expect(on.onPaused).toHaveBeenCalledOnce();
    });

    it("starts telling blocked apart again for the next video", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      receive(frame().playerId, "statusChange", { playerStatus: 3 });
      engine.load("sm10");
      receive(frame().playerId, "statusChange", { playerStatus: 3 });
      expect(on.onBlocked).toHaveBeenCalledTimes(2);
    });

    it("can report blocked again after play() is retried", () => {
      const on = events();
      engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
      const { playerId } = frame();
      receive(playerId, "player-error:video:play");
      engine.play();
      receive(playerId, "statusChange", { playerStatus: 3 });
      expect(on.onBlocked).toHaveBeenCalledTimes(2);
    });
  });

  it("passes the error code on, or unknown", () => {
    const on = events();
    engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
    const { playerId } = frame();
    receive(playerId, "error", { code: "sensitive_video" });
    receive(playerId, "error");
    expect(on.onError.mock.calls).toEqual([["sensitive_video"], ["unknown"]]);
  });

  it("ignores messages from another origin or another player", () => {
    const on = events();
    engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
    const { playerId } = frame();
    receive(
      playerId,
      "statusChange",
      { playerStatus: 2 },
      "https://evil.example",
    );
    receive("someone-else", "statusChange", { playerStatus: 2 });
    expect(on.onPlaying).not.toHaveBeenCalled();
  });

  it("recreates the iframe with a new playerId on load", () => {
    const on = events();
    engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
    const first = frame();
    receive(first.playerId, "playerMetadataChange", { currentTime: 5000 });
    engine.load("so123", 30);
    const second = frame();
    expect(second.iframe).not.toBe(first.iframe);
    expect(first.iframe.isConnected).toBe(false);
    expect(container.children).toHaveLength(1);
    expect(second.playerId).not.toBe(first.playerId);
    expect(new URL(second.iframe.src).pathname).toBe("/watch/so123");
    expect(new URL(second.iframe.src).searchParams.get("from")).toBe("30");
    expect(engine.time()).toEqual({ current: 0, duration: 0 });
    // The old video's messages are no longer picked up
    receive(first.playerId, "statusChange", { playerStatus: 2 });
    expect(on.onPlaying).not.toHaveBeenCalled();
    receive(second.playerId, "statusChange", { playerStatus: 2 });
    expect(on.onPlaying).toHaveBeenCalledOnce();
  });

  it("takes over a preloaded embed, unmutes it and plays at once", () => {
    const iframe = document.createElement("iframe");
    container.append(iframe);
    const sent = record(iframe);
    engine = createNiconicoEngine(container, {
      videoId: "sm9",
      preloaded: { videoId: "sm9", playerId: "pre-1", iframe },
    });
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(sent).toEqual([
      { eventName: "mute", data: { mute: false } },
      { eventName: "play", data: undefined },
    ]);
  });

  it("removes a preloaded embed held outside the container on load", () => {
    const holder = document.createElement("div");
    document.body.append(holder);
    const iframe = document.createElement("iframe");
    holder.append(iframe);
    record(iframe);
    engine = createNiconicoEngine(container, {
      videoId: "sm9",
      preloaded: { videoId: "sm9", playerId: "pre-1", iframe },
    });
    engine.load("so123");
    expect(iframe.isConnected).toBe(false);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    holder.remove();
  });

  it("stops listening and removes the iframe on destroy", () => {
    const on = events();
    engine = createNiconicoEngine(container, { videoId: "sm9" }, on);
    const { iframe, playerId } = frame();
    engine.destroy();
    receive(playerId, "statusChange", { playerStatus: 2 });
    expect(on.onPlaying).not.toHaveBeenCalled();
    expect(iframe.isConnected).toBe(false);
  });
});
