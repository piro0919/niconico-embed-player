/** Where the embed lives. Messages are sent to and accepted from this origin only. */
export const ORIGIN = "https://embed.nicovideo.jp";

/** The `playerStatus` numbers the embed reports in `statusChange`. 1 is loading. */
export const STATUS = { loading: 1, playing: 2, paused: 3, ended: 4 } as const;

/** Accessible name of the iframe when the caller gives none. */
export const DEFAULT_TITLE = "Niconico video player";

/** Prefix of the `playerId` this package gives each embed. */
export const PLAYER_ID_PREFIX = "niconico-embed-player";

/** A message the embed sends to the page. */
export type EmbedMessage = {
  eventName?: string;
  playerId?: string;
  data?: {
    playerStatus?: number;
    /** Non-zero while seeking */
    seekStatus?: number;
    /** Milliseconds */
    currentTime?: number;
    /** Milliseconds */
    duration?: number;
    /** Set on `error`, such as `sensitive_video` or `watch_api_error` */
    code?: string;
  };
};

/**
 * The embed URL. `from` is where to start, in seconds.
 *
 * Only `jsapi`, `playerId` and `from` take effect. `noController`, `noHeader`,
 * `defaultNoComment` and the like are ignored: checked on 2026-10-09 by reading
 * the embed page and its JavaScript. Niconico's server writes those values into
 * the page, and the URL does not change them (they seem to be open to partners
 * only).
 */
export function niconicoEmbedUrl(
  videoId: string,
  playerId: string,
  from?: number,
): string {
  const start = from ? `&from=${Math.floor(from)}` : "";
  return `${ORIGIN}/watch/${encodeURIComponent(videoId)}?jsapi=1&playerId=${encodeURIComponent(playerId)}${start}`;
}

/** Sends a command to an embed. */
export function postCommand(
  iframe: HTMLIFrameElement | null,
  playerId: string,
  eventName: string,
  data?: Record<string, unknown>,
): void {
  iframe?.contentWindow?.postMessage(
    { eventName, data, sourceConnectorType: 1, playerId },
    ORIGIN,
  );
}

/** An embed that was loaded ahead of time and can be handed to a player. */
export type Preloaded = {
  videoId: string;
  playerId: string;
  iframe: HTMLIFrameElement;
};
