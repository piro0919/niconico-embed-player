# assets

`DelaGothicOne-subset.ttf` is the face drawn into the Open Graph card
(`src/app/[locale]/opengraph-image.tsx`). It is the display face the site uses
for its headings, cut down to the characters the cards show in both languages.

Any character missing from it silently falls back to a different face, so when
the card's copy (`header.tagline` in `messages/*.json`) changes, rebuild the
subset:

```sh
curl -sL -o /tmp/dela.ttf \
  "https://github.com/google/fonts/raw/main/ofl/delagothicone/DelaGothicOne-Regular.ttf"

pyftsubset /tmp/dela.ttf \
  --text="niconico-embed-player Control the Niconico embed player from your page ニコニコ動画の埋め込みプレイヤーを、ページから操作する kkweb.io" \
  --unicodes="U+0020-007E" \
  --output-file=assets/DelaGothicOne-subset.ttf \
  --no-hinting --desubroutinize --layout-features=''
```
