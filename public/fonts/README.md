# DotGothic16

`DotGothic16-Regular.woff2` is the complete Japanese/Latin DotGothic16 Regular
Version 1.100 font, distributed under the accompanying SIL Open Font License 1.1.

- Authors/upstream: https://github.com/fontworks-fonts/DotGothic16
- Source TTF: https://github.com/google/fonts/blob/d5ef175583bb5f7a3b01bc6c4603dd4a1f445f34/ofl/dotgothic16/DotGothic16-Regular.ttf
- WOFF2 SHA-256: `1593061e7fe3c55d8172cbb3e91e45b8d247ebcd9cbad3288407128aee32411c`

The TTF was converted with Python FontTools (`TTFont`, `flavor = 'woff2'`,
`save`) and Brotli, without subsetting or changing glyphs. Conversion tools are
authoring-only; neither the build nor the game downloads fonts or needs them.
Both current locale catalogs were checked against the font's character map.

The game loads this same-origin asset before mounting either visible Canvas UI.
Use the native 16 CSS px grid for body text; whole multiples preserve its dot
shapes. World sprites retain their independent 480×270 logical resolution.
