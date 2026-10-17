# Changelog

## Unreleased

### Added

- `status(videoId)` also reports `warmed`: whether the preloaded embed has
  played muted and paused again, so a blocked tap on a loaded but cold embed
  can be told apart.

## 0.1.1 - 2026-10-16

### Changed

- Published from GitHub Actions through npm trusted publishing, so the
  package now carries a provenance attestation. No code changes.

## 0.1.0 - 2026-10-16

### Added

- `createNiconicoEngine`: play, pause, seek, volume, mute, comment hiding
  (switchable while playing), skipping by seconds and full screen for the
  Niconico embed, with playing, paused, ended, blocked and error events.
- `createNiconicoPool`: preloads and warms up the embeds of the videos on
  screen, so playback starts inside a tap on iPhone and iPad.
- `niconicoEmbedUrl`: the embed URL for a video, playerId and start position.
