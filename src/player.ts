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
  /** Hide the comments. They are shown by default, as the embed itself does. */
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
  /** 0–100 */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
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
 *   `mute` (`data.mute`), `commentVisibilityChange` (`data.commentVisibility`)
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
  const { hideComments = false, title = DEFAULT_TITLE, preloaded } = options;
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
  let volume = options.volume;
  // A preloaded embed was muted to warm it up, so it is unmuted unless the
  // caller asked for muted.
  let muted = options.muted ?? (preloaded ? false : undefined);

  const send = (eventName: string, data?: Record<string, unknown>) =>
    postCommand(iframe, playerId, eventName, data);

  // Apply the comment setting and the volume, then start playing
  const start = () => {
    if (hideComments) {
      send("commentVisibilityChange", { commentVisibility: false });
    }
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
      if (current > 0) progressed = true;
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
    duration = 0;
    blocked = false;
    asked = false;
    progressed = false;
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
    seek: (seconds) => {
      current = seconds;
      progressed = true;
      send("seek", { time: seconds * MS_PER_SECOND });
    },
    setVolume: (v) => {
      volume = v;
      send("volumeChange", { volume: v / VOLUME_MAX });
    },
    setMuted: (m) => {
      muted = m;
      send("mute", { mute: m });
    },
    time: () => ({ current, duration }),
    destroy: () => {
      window.removeEventListener("message", onMessage);
      iframe?.remove();
    },
  };
}
