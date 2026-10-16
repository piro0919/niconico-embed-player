# CLAUDE.md

## Project Overview

niconico-embed-player is an npm package that controls the Niconico embed player (`embed.nicovideo.jp`) from the page through its postMessage protocol: play, pause, seek, volume, mute, comment visibility, and status / time / error events. It also ships a preloader that keeps embeds warm so playback starts inside a tap on iPhone and iPad.

Agreed on 2026-10-16 in a home-window session. Public repo: https://github.com/piro0919/niconico-embed-player (created 2026-10-16, baseline applied). Not yet on npm.

## Layout

- `src/embed.ts` — protocol constants, `niconicoEmbedUrl`, `postCommand`, the `Preloaded` type. Shared by the player and the preloader
- `src/player.ts` — `createNiconicoEngine(container, options, events)`, ported from Vocafy's `niconico.ts`
- `tests/` — Vitest on jsdom. The iframe's `postMessage` is spied on and the embed's replies are dispatched as `message` events
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:lib`, `pnpm check:package`. ESM only, so attw runs with `--profile esm-only`

## Why

- Niconico publishes no official API for the embed player. The only package on npm, `nicovideo-iframe-api`, has had a single 1.0.0 release (2024-09) and nothing since.
- Vocafy already has a working, field-tested implementation, with behaviour checked against the real player on 2026-10-08 to 10-13. This package extracts it so other sites can use it and so Vocafy stops owning the protocol knowledge alone.

## Source to extract

From `~/Repository/vocafy/src/components/player/`:

- `niconico.ts` → the player (`createNiconicoEngine`)
- `niconico-pool.ts` → the preloader (`createNiconicoPool`) and `niconicoEmbedUrl`

Keep the comments that record verified behaviour (translated to English). They are the main value of the package.

### Vocafy-specific parts to drop or turn into options

- `Engine` / `EngineEvents` / `Sound` types from `engine.ts` → the package defines its own types
- `reportUnplayable` → removed; the `error` event carries the code and the caller decides
- `niconicoFrameTitle()` (i18n via Vocafy's `defineText`) → a `title` option for the iframe
- `className = 'size-full'` on the preload box (Tailwind) → inline style or a caller-provided container
- Hard-coded comment hiding (a Vocafy design decision) → an option
- `vocafy-` prefix in `playerId` → a package prefix

## Protocol facts to keep (verified in Vocafy)

- Send `{ eventName, data, sourceConnectorType: 1, playerId }` to origin `https://embed.nicovideo.jp`. Commands: `play`, `pause`, `seek` (`data.time` in ms), `volumeChange` (`data.volume` 0–1), `mute`, `commentVisibilityChange`.
- Receive `loadComplete`, `statusChange` (`playerStatus` 1 loading, 2 playing, 3 paused, 4 ended; `seekStatus` non-zero while seeking), `playerMetadataChange` (`currentTime`, `duration` in ms, about 4 times a second), `error` (`data.code`), `player-error:video:play` (autoplay blocked).
- Only `jsapi`, `playerId` and `from` (seconds) in the embed URL take effect. `noController`, `noHeader`, `defaultNoComment` etc. are ignored.
- Switching videos: recreate the iframe with a new `playerId`. Changing `src` pushes a history entry; replacing the location inside the frame leaves the old `src` behind.
- iPhone Safari may report only a pause, without `player-error:video:play`, when playback is blocked. Treat "paused without being asked, before time ever advanced, not while seeking" as blocked.
- Seeking right after starting kills playback on iPhone Safari; pass the start position as `from` instead.
- Preloading: mute → play → pause once `playing` arrives, so the video is ready and a later `play` inside a tap starts at once. First embed is about 0.7 MB, later ones about 0.2 MB.

## Decisions

Provisional means Claude chose it when the decision was delegated; change it if it feels wrong when building.

- Name: `niconico-embed-player` (chosen by piro, 2026-10-16). Unscoped.
- Framework-agnostic TypeScript, ESM, zero runtime dependencies. No React wrapper in the first release.
- Units (provisional): seconds for time and 0–100 for volume, matching the YouTube IFrame Player API, since sites using this will often drive YouTube too.
- Comments (provisional): shown by default, as the embed itself does; an option hides them.
- README must say clearly that this relies on an undocumented protocol, when it was last verified, and cite https://zenn.dev/xpadev/articles/8f742c8f8ce3d0.
- Tooling: copy the setup of `~/Repository/amivoice-realtime` (tsup, Vitest, Biome, lefthook, renovate.json, MIT). Tests run the player against a fake iframe and synthetic `message` events.
- Public docs in English.

## After publishing

- Switch Vocafy's `niconico.ts` and `niconico-pool.ts` to the package, keeping Vocafy's own wrappers (Sentry reporting, i18n title, hidden comments).
- Add it to the Notion portfolio database and follow the release checklist used by the other npm packages.
