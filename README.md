# niconico-embed-player

Control the [Niconico](https://www.nicovideo.jp/) embed player
(`embed.nicovideo.jp`) from your page: play, pause, seek, skip, volume, mute,
comment visibility, full screen, and status, time and error events.

Demo: https://niconico-embed-player.kkweb.io

**This is not an official library from DWANGO Co., Ltd.** Niconico publishes no
API for the embed player. This package speaks the undocumented postMessage
protocol the embed uses, as described in
[an unofficial write-up](https://zenn.dev/xpadev/articles/8f742c8f8ce3d0) and
checked against the real player from 2026-10-08 to 2026-10-16. If Niconico
changes the protocol, the package can stop working without warning.

- No runtime dependencies, no framework
- Seconds for time and 0–100 for volume, the same units as the YouTube IFrame
  Player API
- Detects playback blocked by the browser, including iPhone Safari, which
  reports only a pause

## Install

```bash
npm install niconico-embed-player
```

## Usage

```ts
import { createNiconicoEngine } from "niconico-embed-player";

const player = createNiconicoEngine(
  document.getElementById("player")!,
  { videoId: "sm9", volume: 50 },
  {
    onPlaying: () => console.log("playing"),
    onPaused: () => console.log("paused"),
    onEnded: () => console.log("ended"),
    onBlocked: () => console.log("tap to play"),
    onError: (code) => console.log("cannot play", code),
  },
);

player.seek(30);
player.load("so123"); // switch to another video
```

The player creates an iframe inside the container and starts playing as soon as
the embed has loaded. Size the iframe with your own CSS.

### Options

| Option         | Type      | Description                                                                 |
| -------------- | --------- | --------------------------------------------------------------------------- |
| `videoId`      | `string`  | The first video, such as `sm9`                                              |
| `startAt`      | `number`  | Where to start, in seconds                                                  |
| `volume`       | `number`  | 0–100. Left to the embed when omitted                                       |
| `muted`        | `boolean` | Left to the embed when omitted                                              |
| `hideComments` | `boolean` | `true` hides the comments, `false` shows them. Left to the embed when omitted |
| `title`        | `string`  | Accessible name of the iframe. Defaults to `Niconico video player`          |
| `preloaded`    | `Preloaded` | An embed loaded ahead of time, taken over and played at once             |

### Methods

| Method                      | Description                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- |
| `load(videoId, from?)`      | Switch to another video and play it, from `from` seconds                      |
| `play()` / `pause()`        |                                                                               |
| `seek(seconds)`             |                                                                               |
| `seekBy(seconds)`           | Move from the current position, such as `10` or `-10`. Kept within the video  |
| `setVolume(volume)`         | 0–100                                                                         |
| `setMuted(muted)`           |                                                                               |
| `setCommentsHidden(hidden)` | Hide or show the comments while playing, without a reload                     |
| `requestFullscreen()`       | Full screen on the iframe. Call it from a tap or a click                      |
| `time()`                    | `{ current, duration }` in seconds, 0 until known                             |
| `destroy()`                 | Stop listening and remove the iframe                                          |

### Events

All are optional.

| Event        | When                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| `onPlaying`  | Playback started                                                               |
| `onPaused`   | Playback paused                                                                |
| `onEnded`    | The video ended                                                                |
| `onBlocked`  | The browser refused to start playback without a user gesture. Call `play()` from a tap |
| `onError`    | The embed reported an error, with its code (`sensitive_video`, `watch_api_error`, …) |

## Preloading for iPhone and iPad

iPhone and iPad Safari block playback that no tap started. A player created
after the tap waits for the embed to load, and by then the tap no longer
counts, so the first play is blocked. `createNiconicoPool` loads the embeds of
the videos on screen ahead of time, hidden, and warms each one up (plays it
muted, then pauses it) so that `play` inside a tap starts at once.

```ts
import { createNiconicoEngine, createNiconicoPool } from "niconico-embed-player";

const frame = document.getElementById("player")!;
const pool = createNiconicoPool({ container: () => frame });

// When a video's row comes into view; call the result when it leaves view
const release = pool.want("sm9");

// Inside the tap handler
const preloaded = pool.take("sm9");
let player;
if (preloaded) {
  player = createNiconicoEngine(preloaded.box, { videoId: "sm9", preloaded });
} else {
  // A box of its own: the player replaces whatever is in its container
  const box = document.createElement("div");
  frame.append(box);
  player = createNiconicoEngine(box, { videoId: "sm9" });
}
pool.refresh(); // whenever the playing video changes
```

The pool places one hidden box per video in the container. Hand a taken
embed's `box` to the player as its container: the player shows it as it is,
since moving an iframe reloads it, and removes it on `destroy()`. Never give
the pool's container itself to a player, as the player replaces its children. The first embed costs about 0.7 MB and later
ones about 0.2 MB; no video is loaded until play.

| Option      | Type                                  | Description                                              |
| ----------- | ------------------------------------- | -------------------------------------------------------- |
| `container` | `() => HTMLElement \| null`           | Where the hidden boxes go. Nothing loads while it is null |
| `playing`   | `() => string \| undefined`           | The video playing now, which is not preloaded            |
| `startAt`   | `(videoId) => number \| undefined`    | Where to start each video, in seconds                    |
| `title`     | `string`                              | Accessible name of the iframes                           |

| Method           | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `want(videoId)`  | Start preloading. Returns a function to call when the video leaves view     |
| `take(videoId)`  | The loaded embed, handed over, or `null` while loading or when there is none |
| `status(videoId)` | `{ preload: "none" \| "loading" \| "ready", ms? }`, to tell why a tap was blocked |
| `refresh()`      | Call when the playing video changes, to preload taken videos still in view  |
| `destroy()`      | Drop every embed and stop listening                                         |

## Things the embed does that you should know

- Only `jsapi`, `playerId` and `from` in the embed URL take effect.
  `noController`, `noHeader`, `defaultNoComment` and the like are ignored.
- The embed has no command for full screen. It listens only for `play`, `pause`,
  `seek`, `mute`, `volumeChange`, `commentVisibilityChange` and
  `incrementViewCount`, so `requestFullscreen()` asks the browser to make the
  iframe full screen instead. It rejects when the browser cannot do that for an
  iframe. Not yet checked on iPhone Safari.
- The embed remembers hidden comments in that browser, so the next embed starts
  with them hidden too. Pass `hideComments: false` to show them regardless;
  leave it out to keep what the viewer chose in the embed.
- `load()` recreates the iframe instead of changing its `src`. Changing `src`
  pushes a browser history entry, so Back would step the embed back to the
  previous video instead of leaving the page.
- Start from a position with `startAt` or `load(id, from)`, not with `seek()`
  right after starting. On iPhone Safari a seek just after playback starts cuts
  playback off.
- iPhone Safari may report a blocked start as a plain pause. A pause that was
  not asked for, before the position ever advanced and not while seeking, is
  reported as `onBlocked`.

## License

MIT
