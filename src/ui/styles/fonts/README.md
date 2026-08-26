# Fonts

Two families, self-hosted and subset (Part 3, Typography). Budget: **under
180KB total**, verified in slice v0.7.

- **Tiro Devanagari Hindi** — display only (sign names). Weight 400.
- **Mukta** (Ek Type) — everything else. Weights 400 / 500 / 600.

Both are under the SIL Open Font License. Do **not** commit the raw upstream
fonts (each is ~150–400KB and covers scripts we never use). Subset them to
Latin + Devanagari and commit only the `.woff2` output here.

## Producing the subsets

```sh
pip install fonttools brotli

# example — repeat per weight/family
pyftsubset TiroDevanagariHindi-Regular.ttf \
  --output-file=tiro-devanagari-hindi-400.woff2 \
  --flavor=woff2 \
  --layout-features='*' \
  --unicodes="U+0000-00FF,U+0900-097F,U+A8E0-A8FF,U+1CD0-1CFF,U+200C-200D,U+25CC"
```

`U+0900-097F` is the Devanagari block; `U+200C-200D` (ZWNJ/ZWJ) and `U+25CC`
(dotted circle) are required for correct conjunct rendering. Keep GSUB/GPOS
(`--layout-features='*'`) or conjuncts break.

Expected filenames (referenced by `../fonts.css`):

- `tiro-devanagari-hindi-400.woff2`
- `mukta-400.woff2`
- `mukta-500.woff2`
- `mukta-600.woff2`

After building, sum the byte sizes and confirm the total is under 180KB.
