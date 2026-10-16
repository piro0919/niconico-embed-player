import {
  DEFAULT_TITLE,
  type EmbedMessage,
  niconicoEmbedUrl,
  ORIGIN,
  PLAYER_ID_PREFIX,
  type Preloaded,
  postCommand,
  STATUS,
} from "./embed";

export type NiconicoPoolOptions = {
  /**
   * Where the hidden embeds go. A function, so the element can appear later;
   * nothing is preloaded while it returns null. Give each taken embed's `box`
   * to the player as its container.
   */
  container: () => HTMLElement | null;
  /**
   * The video playing now. It is not preloaded: its row stays visible while it
   * plays, and a second embed of the same video would be wasted.
   */
  playing?: () => string | undefined;
  /** Where to start a video, in seconds. Passed to the embed as `from`. */
  startAt?: (videoId: string) => number | undefined;
  /** Accessible name of the iframes. Defaults to "Niconico video player". */
  title?: string;
};

export type NiconicoPool = {
  /**
   * A video came into view: start preloading it unless that is under way.
   * Call the returned function when it leaves view; the embed is dropped once
   * nothing wants it.
   */
  want(videoId: string): () => void;
  /**
   * Hand over a loaded embed and stop holding it. Null while it is still
   * loading or when there is none.
   */
  take(videoId: string): Preloaded | null;
  /**
   * How far preloading got: none, loading or ready, and for how long, in
   * milliseconds. Useful to tell why a tap was blocked.
   */
  status(videoId: string): {
    preload: "none" | "loading" | "ready";
    ms?: number;
  };
  /**
   * Call when the playing video changes. Videos still in view whose embed was
   * taken earlier are preloaded again.
   */
  refresh(): void;
  /** Drop every held embed and stop listening. */
  destroy(): void;
};

type Entry = Preloaded & {
  /** When loading started (performance.now()) */
  since: number;
  ready: boolean;
  /** Played muted and paused again, so the video is ready */
  warmed: boolean;
};

let serial = 0;

/**
 * Keeps the embeds of the videos in view loaded and hidden, so that playback
 * starts inside the tap that asks for it.
 *
 * iPad and iPhone Safari block playback that no tap started. A player made
 * after the tap waits for the embed to load, and by then the tap no longer
 * counts, so the first play was always blocked (Vocafy, 2026-10-10). A loaded
 * embed plays when `play` is sent inside the tap.
 *
 * The first embed is about 0.7 MB and later ones about 0.2 MB, as they share
 * the scripts (measured 2026-10-10). No video is loaded until play. There is
 * no cap: an embed is dropped when its video leaves view, so the pool holds as
 * many as are in view. A cap of 6 left the seventh row needing two taps.
 */
export function createNiconicoPool(options: NiconicoPoolOptions): NiconicoPool {
  const {
    container,
    playing = () => undefined,
    startAt = () => undefined,
    title = DEFAULT_TITLE,
  } = options;
  const entries = new Map<string, Entry>();
  // How many views want each video, kept apart from the embeds. A taken embed
  // leaves its video in view, so it can be preloaded again once another video
  // plays (refresh). Without this, a video tapped once needed two taps from
  // then on (Vocafy, 2026-10-13).
  const wanted = new Map<string, number>();

  const post = (
    entry: Entry,
    eventName: string,
    data?: Record<string, unknown>,
  ) => postCommand(entry.iframe, entry.playerId, eventName, data);

  // A loaded embed is played muted and paused as soon as it plays, so the
  // video is ready too (2026-10-13). The embed starts the watch request and
  // the video only when asked to play, which took 1–2 s or more after a tap,
  // and iPhone sometimes stopped counting the tap by then. Muted playback
  // needs no tap. Pausing makes the embed send player-error (The operation
  // was aborted), but no player is listening yet.
  const onMessage = (e: MessageEvent<EmbedMessage>) => {
    if (e.origin !== ORIGIN) return;
    const entry = [...entries.values()].find(
      (x) => x.playerId === e.data?.playerId,
    );
    if (!entry) return;
    if (e.data.eventName === "loadComplete" && !entry.ready) {
      entry.ready = true;
      post(entry, "mute", { mute: true });
      post(entry, "play");
    }
    if (
      e.data.eventName === "statusChange" &&
      e.data.data?.playerStatus === STATUS.playing &&
      !entry.warmed
    ) {
      entry.warmed = true;
      post(entry, "pause");
    }
  };
  window.addEventListener("message", onMessage);

  const remove = (entry: Entry) => {
    entries.delete(entry.videoId);
    entry.box.remove();
  };

  const ensure = (videoId: string) => {
    if (videoId === playing() || entries.has(videoId)) return;
    const parent = container();
    if (!parent) return;
    const playerId = `${PLAYER_ID_PREFIX}-pre-${++serial}`;
    const box = document.createElement("div");
    box.style.width = "100%";
    box.style.height = "100%";
    box.hidden = true;
    const iframe = document.createElement("iframe");
    iframe.allow = "autoplay; fullscreen";
    iframe.title = title;
    iframe.src = niconicoEmbedUrl(videoId, playerId, startAt(videoId));
    box.append(iframe);
    parent.append(box);
    entries.set(videoId, {
      videoId,
      playerId,
      iframe,
      box,
      since: performance.now(),
      ready: false,
      warmed: false,
    });
  };

  return {
    want(videoId) {
      wanted.set(videoId, (wanted.get(videoId) ?? 0) + 1);
      ensure(videoId);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (wanted.get(videoId) ?? 1) - 1;
        if (left > 0) {
          wanted.set(videoId, left);
          return;
        }
        wanted.delete(videoId);
        // A taken embed is playing and no longer held, so it stays
        const entry = entries.get(videoId);
        if (entry) remove(entry);
      };
    },
    take(videoId) {
      const entry = entries.get(videoId);
      if (!entry?.ready) return null;
      entries.delete(videoId);
      const {
        since: _since,
        ready: _ready,
        warmed: _warmed,
        ...preloaded
      } = entry;
      return preloaded;
    },
    status(videoId) {
      const entry = entries.get(videoId);
      if (!entry) return { preload: "none" };
      return {
        preload: entry.ready ? "ready" : "loading",
        ms: Math.round(performance.now() - entry.since),
      };
    },
    refresh() {
      for (const videoId of wanted.keys()) ensure(videoId);
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      for (const entry of [...entries.values()]) remove(entry);
      wanted.clear();
    },
  };
}
