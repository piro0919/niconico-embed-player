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

export type NiconicoEngineOptions = {
  /** The first video to load, such as `sm9` */
  videoId: string;
  /**
   * Where to start, in seconds. Passed as `from` in the embed URL.
   * Seeking once playback has started cuts playback off on iPhone Safari, and
   * the retry falls outside the tap, so it gets blocked. A seek sent before
   * `play` is ignored (2026-10-13).
   */
  startAt?: number;
  /** 0–100. Left to the embed when omitted. */
  volume?: number;
  /** Left to the embed when omitted. */
  muted?: boolean;
  /**
   * Hide (`true`) or show (`false`) the comments. Left to the embed when
   * omitted, which shows them unless they were hidden before in that browser:
   * the embed remembers it.
   */
  hideComments?: boolean;
  /** Accessible name of the iframe. Defaults to "Niconico video player". */
  title?: string;
  /**
   * An embed loaded ahead of time. When given, the player takes it over and
   * starts playing at once, so playback stays inside the tap that asked for it.
   */
  preloaded?: Preloaded;
};

export type NiconicoEngineEvents = {
  onPlaying(): void;
  onPaused(): void;
  onEnded(): void;
  /**
   * The browser refused to start playback without a user gesture (iPad and
   * iPhone Safari, among others). The player stays stopped; calling `play()`
   * from a tap starts it.
   */
  onBlocked(): void;
  /**
   * The embed reported an error, such as a deleted video or one that cannot be
   * played outside Niconico. `code` is what the embed sent (`sensitive_video`,
   * `watch_api_error`, …), or `unknown`.
   */
  onError(code: string): void;
};

export type NiconicoEngine = {
  /** Switch to another video and play it, from `from` seconds or the start. */
  load(videoId: string, from?: number): void;
  play(): void;
  pause(): void;
  /** Seconds */
  seek(seconds: number): void;
  /** Move by `seconds` from the current position, such as 10 or -10. Kept within the video. */
  seekBy(seconds: number): void;
  /** 0–100 */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Hide or show the comments while playing, without reloading the embed. */
  setCommentsHidden(hidden: boolean): void;
  /**
   * Show the embed full screen. The embed has no command for it, so this asks
   * the browser to make the iframe full screen; call it from a tap or a click.
   */
  requestFullscreen(): Promise<void>;
  /** Current position and length, in seconds. 0 until known. */
  time(): { current: number; duration: number };
  /** Stop listening and remove the iframe. */
  destroy(): void;
};

let serial = 0;

/** The embed counts time in milliseconds; this package uses seconds. */
const MS_PER_SECOND = 1000;
/** This package takes volume as 0–100; the embed takes 0–1. */
const VOLUME_MAX = 100;

/**
 * Drives the Niconico embed player (embed.nicovideo.jp) through postMessage.
 * There is no official documentation. This follows an unofficial write-up
 * (https://zenn.dev/xpadev/articles/8f742c8f8ce3d0, as of 2022) and behaviour
 * checked against the real player on 2026-10-08.
 *
 * - Sent: `{ eventName, data, sourceConnectorType: 1, playerId }`. `play`,
 *   `pause`, `seek` (`data.time` in ms), `volumeChange` (`data.volume` 0–1),
 *   `mute` (`data.mute`), `commentVisibilityChange` (`data.commentVisibility`,
 *   also while playing)
 * - Received: `loadComplete` (loaded), `statusChange` (`data.playerStatus` is
 *   1 loading, 2 playing, 3 paused, 4 ended), `playerMetadataChange`
 *   (`data.currentTime` and `data.duration` in ms, about 4 times a second),
 *   `error`, `player-error:video:play` (starting playback was blocked)
 *
 * Switching videos recreates the iframe (see `load`). Each time it gets a new
 * `playerId`, so messages from the previous video are not picked up.
 *
 * The player starts playing as soon as the embed has loaded.
 */
export function createNiconicoEngine(
  container: HTMLElement,
  options: NiconicoEngineOptions,
  events: Partial<NiconicoEngineEvents> = {},
): NiconicoEngine {
  const { title = DEFAULT_TITLE, preloaded } = options;
  let hideComments = options.hideComments;
  let iframe: HTMLIFrameElement | null = null;

  let playerId = "";
  let current = 0;
  let duration = 0;
  // Whether blocking was reported, whether the page asked for the pause, and
  // whether the position ever advanced. Used to tell whether a pause means
  // playback was blocked.
  let blocked = false;
  let asked = false;
  let progressed = false;
  // The first position the embed reports, which is the start position (`from`)
  // and arrives before playback starts (2026-10-16). Moving past it is progress.
  let origin: number | undefined;
  // Where the video was asked to start. Until the embed reports a position, a
  // skip counts from here.
  let startFrom = 0;
  let volume = options.volume;
  // A preloaded embed was muted to warm it up, so it is unmuted unless the
  // caller asked for muted.
  let muted = options.muted ?? (preloaded ? false : undefined);

  const send = (eventName: string, data?: Record<string, unknown>) =>
    postCommand(iframe, playerId, eventName, data);

  // Apply the comment setting and the volume, then start playing
  const start = () => {
    // Sent to show them too: the embed remembers hidden comments in that
    // browser, and a later embed stayed hidden until told (2026-10-16)
    if (hideComments !== undefined)
      send("commentVisibilityChange", { commentVisibility: !hideComments });
    if (volume !== undefined)
      send("volumeChange", { volume: volume / VOLUME_MAX });
    if (muted !== undefined) send("mute", { mute: muted });
    send("play");
  };

  const onMessage = (e: MessageEvent<EmbedMessage>) => {
    if (e.origin !== ORIGIN || e.data?.playerId !== playerId) return;
    const { eventName, data } = e.data;
    if (eventName === "loadComplete") start();
    if (eventName === "statusChange") {
      if (data?.playerStatus === STATUS.playing) events.onPlaying?.();
      // A pause nobody asked for, before the position ever advanced, means
      // playback was blocked. On iPhone Safari a blocked start can arrive as a
      // pause alone, without player-error:video:play (2026-10-13). A pause also
      // arrives while seeking (seekStatus non-zero), so that is left out.
      if (data?.playerStatus === STATUS.paused) {
        if (!blocked && !asked && !progressed && !data.seekStatus) {
          blocked = true;
          events.onBlocked?.();
        } else events.onPaused?.();
      }
      if (data?.playerStatus === STATUS.ended) events.onEnded?.();
    }
    if (eventName === "playerMetadataChange") {
      current = (data?.currentTime ?? 0) / MS_PER_SECOND;
      if (origin === undefined) origin = current;
      else if (current > origin) progressed = true;
      duration = (data?.duration ?? 0) / MS_PER_SECOND;
    }
    // The browser blocked playback that had no user gesture. The status stays
    // at loading and nothing else arrives. Sending play again from a button
    // starts it (2026-10-09, checked by blocking autoplay in Chromium settings).
    if (eventName === "player-error:video:play" && !blocked) {
      blocked = true;
      events.onBlocked?.();
    }
    // Whether the video can never be played is not known from the code alone,
    // so every error is passed on.
    if (eventName === "error") events.onError?.(data?.code ?? "unknown");
  };
  window.addEventListener("message", onMessage);

  const load = (id: string, from?: number) => {
    playerId = `${PLAYER_ID_PREFIX}-${++serial}`;
    current = 0;
    startFrom = from ?? 0;
    duration = 0;
    blocked = false;
    asked = false;
    progressed = false;
    origin = undefined;
    // Recreate the whole iframe for every video. `src` is set before the iframe
    // is placed, so the page history does not grow.
    // - Changing `src` pushes a history entry. The first Back then took the
    //   embed back to the previous video, and the page did not go back.
    // - Replacing the location inside the frame left `src` at the first video.
    //   On Android, after playing a second video and moving to another screen,
    //   the embed reloaded, showed the first video, and stopped because the
    //   playerId no longer matched (2026-10-09).
    const next = document.createElement("iframe");
    next.allow = "autoplay; fullscreen";
    next.title = title;
    next.src = niconicoEmbedUrl(id, playerId, from);
    // A preloaded iframe may sit outside the container, so remove it by itself
    iframe?.remove();
    container.replaceChildren(next);
    iframe = next;
  };
  if (preloaded) {
    iframe = preloaded.iframe;
    playerId = preloaded.playerId;
    start();
  } else load(options.videoId, options.startAt);

  const seek = (seconds: number) => {
    current = seconds;
    progressed = true;
    send("seek", { time: seconds * MS_PER_SECOND });
  };

  return {
    load,
    play: () => {
      asked = false;
      blocked = false;
      send("play");
    },
    pause: () => {
      asked = true;
      send("pause");
    },
    seek,
    seekBy: (seconds) => {
      const base = origin === undefined ? startFrom : current;
      const target = Math.max(base + seconds, 0);
      seek(duration ? Math.min(target, duration) : target);
    },
    setVolume: (v) => {
      volume = v;
      send("volumeChange", { volume: v / VOLUME_MAX });
    },
    setMuted: (m) => {
      muted = m;
      send("mute", { mute: m });
    },
    // Takes effect mid-playback, with no reload (2026-10-16)
    setCommentsHidden: (hidden) => {
      hideComments = hidden;
      send("commentVisibilityChange", { commentVisibility: !hidden });
    },
    requestFullscreen: async () => {
      // The embed only listens for play, pause, seek, mute, volumeChange,
      // commentVisibilityChange and incrementViewCount (read from its script
      // on 2026-10-16). Full screen on the iframe kept playing (Chromium).
      if (!iframe) return;
      // Not every browser has it on an iframe (iPhone Safari, per caniuse; not
      // checked on a device). Older Safari has only the prefixed one.
      const frame = iframe as HTMLIFrameElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (frame.requestFullscreen) return frame.requestFullscreen();
      if (frame.webkitRequestFullscreen) return frame.webkitRequestFullscreen();
      throw new Error("Full screen is not available in this browser");
    },
    time: () => ({ current, duration }),
    destroy: () => {
      window.removeEventListener("message", onMessage);
      iframe?.remove();
      iframe = null;
    },
  };
}
