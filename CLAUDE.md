# CLAUDE.md

## Project Overview

niconico-embed-player is an npm package that controls the Niconico embed player (`embed.nicovideo.jp`) from the page through its postMessage protocol: play, pause, seek, volume, mute, comment visibility, and status / time / error events. It also ships a preloader that keeps embeds warm so playback starts inside a tap on iPhone and iPad.

Agreed on 2026-10-16 in a home-window session. Public repo: https://github.com/piro0919/niconico-embed-player (created 2026-10-16, baseline applied). 0.1.0 on npm since 2026-10-16.

## Releasing

- Bump `package.json`, turn `## Unreleased` in CHANGELOG into `## x.y.z - date`, commit `chore(release): x.y.z`, push the `vx.y.z` tag. `publish.yml` publishes through npm trusted publishing (OIDC, no token, provenance attached) and skips a version already on npm
- 0.1.0 was published by hand from this Mac, because the trusted publisher settings open only once a package exists, and a publish from here becomes a staged publish that npm released a few minutes later. No `NPM_TOKEN` secret exists, on purpose: a token that bypasses 2FA was refused by the permission check, and npm stops those tokens publishing around 2027-01
- The trusted publisher (piro0919/niconico-embed-player, `publish.yml`, npm publish allowed) was set up on 2026-10-16 and validated by 0.1.1, the first release published through it (2026-10-16, provenance attached). 0.1.1 has no code changes; it was cut so the publisher became valid before its 2026-10-18 deadline

## Layout

- `src/embed.ts` — protocol constants, `niconicoEmbedUrl`, `postCommand`, the `Preloaded` type. Shared by the player and the preloader
- `src/player.ts` — `createNiconicoEngine(container, options, events)`, ported from Vocafy's `niconico.ts`
- `src/pool.ts` — `createNiconicoPool(options)`, the preloader, ported from Vocafy's `niconico-pool.ts`. `Preloaded.box` is the hidden wrapper the player shows when it takes an embed over
- `tests/` — Vitest on jsdom. The iframe's `postMessage` is spied on and the embed's replies are dispatched as `message` events
- `src/app/[locale]/` — the site (Next.js, next-intl, English at `/`, Japanese at `/ja`). The page is a live demo: a real embed driven by the package, with an event log. Messages are in `messages/{en,ja}.json`; i18n wiring in `src/i18n/` and `src/proxy.ts` is copied from parroo's `lp/`. The site is not in the npm package (`tsconfig.build.json` builds only the four library files)
- `e2e/` — Playwright on the built site. `demo.spec.ts` runs in Chromium and WebKit against a fake embed served at the real origin (`fake-embed.ts`, adapted from Vocafy's e2e). `real.spec.ts` (`@real`) plays sm9 on the real embed and runs only from the manual workflow `e2e-real.yml` or `pnpm test:e2e:real`
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:real`, `pnpm build:lib`, `pnpm check:package`, `pnpm dev` (port 3150). ESM only, so attw runs with `--profile esm-only`
- Biome extends `@piro0919/biome-config` (unnamed numbers warn, Tailwind arbitrary numeric values warn). Commit messages are checked by commitlint (config-conventional) in the commit-msg hook

## Site design

Provisional, chosen by Claude on 2026-10-16; piro has the final say.

- Same skeleton as amivoice-realtime's site: header (name, tagline, unofficial note, language switch), the demo, footer (`npm i`, GitHub, Buy Me a Coffee, npm, kkweb.io)
- Dark `#0b0b0f` with zinc text, amber accent. Headings in Dela Gothic One (used by no other kkweb site), body in Geist with Noto Sans JP
- Icon: the `^ ^` eyes of a smile (ニコニコ) with a play triangle for a mouth, on an amber rounded square (`src/app/icon.svg`). The apple icon and the OG cards reuse it
- OG card per locale, drawn with a subset of Dela Gothic One (`assets/README.md`)

## Verified on 2026-10-16 (headless Chromium, real embed)

- With `from=61`, the first `playerMetadataChange` reports `currentTime: 61000` while the status is still loading, before playback starts. So "the position advanced" is measured from the first reported position, not from 0; otherwise a blocked start from a position was reported as a pause
- `seek` takes milliseconds: `{ time: 100000 }` moved the video to 103.9 s, and it works outside the buffered range too
- The real embed also sends `playerStatusChange` and `seekStatusChange`, which the player ignores, alongside `statusChange`
- The embed remembers hidden comments in that browser: after one embed got `commentVisibility: false`, a new embed with a new `playerId` still started hidden. So `hideComments: false` sends `commentVisibility: true`; omitted, nothing is sent and the viewer's choice in the embed stays, like `volume` and `muted`
- `commentVisibilityChange` takes effect while playing: sent mid-playback it hid and showed the comments with the same iframe and `playerId`, and playback went on (`setCommentsHidden`)
- The embed listens only for `play`, `pause`, `seek`, `mute`, `volumeChange`, `commentVisibilityChange` and `incrementViewCount` (read from its script, `watch_ja_*.js`). There is no full-screen command, so `requestFullscreen()` calls it on the iframe; playback went on in full screen. iPhone Safari not checked
- A controlled range input that is not updated on change snaps back and fires a second `seek` to the old position. Only the real embed showed it; the fake embed did not reproduce it even with metadata streaming and a delayed seek, so `real.spec.ts` is the regression test

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
- Comments (provisional): left to the embed when `hideComments` is omitted, like volume and mute; `true` hides them and `false` shows them (changed on 2026-10-16 after finding the embed remembers hidden comments).
- README must say clearly that this relies on an undocumented protocol, when it was last verified, and cite https://zenn.dev/xpadev/articles/8f742c8f8ce3d0.
- Tooling: copy the setup of `~/Repository/amivoice-realtime` (tsup, Vitest, Biome, lefthook, renovate.json, MIT). Tests run the player against a fake iframe and synthetic `message` events.
- Public docs in English.

## After publishing

- Switch Vocafy's `niconico.ts` and `niconico-pool.ts` to the package, keeping Vocafy's own wrappers (Sentry reporting, i18n title, hidden comments).
- Add it to the Notion portfolio database and follow the release checklist used by the other npm packages.
