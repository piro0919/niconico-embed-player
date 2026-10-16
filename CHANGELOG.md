# Changelog

## 0.1.0 - 2026-10-16

### Added

- `createNiconicoEngine`: play, pause, seek, volume, mute, comment hiding
  (switchable while playing), skipping by seconds and full screen for the
  Niconico embed, with playing, paused, ended, blocked and error events.
- `createNiconicoPool`: preloads and warms up the embeds of the videos on
  screen, so playback starts inside a tap on iPhone and iPad.
- `niconicoEmbedUrl`: the embed URL for a video, playerId and start position.
