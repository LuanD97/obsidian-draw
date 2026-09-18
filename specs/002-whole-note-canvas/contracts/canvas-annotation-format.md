# Contract: `ink-canvas` Annotation Format, cv1

**This is a spike format.** Unlike [`ink` v1](../../001-inline-handwriting-blocks/contracts/block-format.md),
which is frozen once released (constitution II), `cv1` is explicitly experimental for the duration
of this exploration. If Canvas Mode proceeds past the spike, this contract is expected to be
revisited (and very possibly changed) before any release commitment is made. It borrows as much of
the `ink` v1 machinery as possible so that revisiting is cheap either way.

## Markdown form

````md
```ink-canvas
cv1;id=k3f9x2ab;<base64 payload>
```
````

An annotation with no strokes yet is `cv1;id=k3f9x2ab;` (empty payload). The block is placed as its
own paragraph (preceded and followed by a blank line) immediately after the text paragraph it is
anchored to (data-model.md's Anchor section). It is never shown to the user as raw text in Live
Preview (research.md R4) — this grammar only matters for storage and for anyone reading the raw
Markdown outside Obsidian.

- Fence: an opening fence of ≥ 3 backticks or tildes with the info string exactly `ink-canvas`; a
  closing fence of the same character with at least the same length (CommonMark) — structurally
  identical to the `ink` contract, just a different info string.
- The block contains exactly one content line (the payload line). Blank lines around it are
  tolerated on read and never produced.
- The fence and payload line may share a common prefix of spaces and/or blockquote markers, preserved
  byte-for-byte on update, same as the `ink` contract.
- Line endings (`\n` or `\r\n`) are preserved on update.

## Payload line grammar

```abnf
payload-line = version ";" "id=" id ";" payload
version      = "cv" 1*DIGIT              ; "cv1" for this contract
id           = 8( %x30-39 / %x61-7A )    ; [0-9a-z]{8}
payload      = *( ALPHA / DIGIT / "+" / "/" ) *2"="   ; RFC 4648 base64, may be empty
```

Note there is **no `WxH` size field** — Canvas Mode has no bounded canvas. This is the one
structural difference from the `ink` v1 grammar.

## Payload (after base64 decode and raw-DEFLATE inflate)

Byte-identical to [`ink` v1's payload layout](../../001-inline-handwriting-blocks/contracts/block-format.md#payload-after-base64-decode-and-raw-deflate-inflate):
varint-packed strokes, zigzag-signed absolute first point per stroke, zigzag-signed deltas
thereafter, pressure 0–255. `format/codec.ts` and `format/varint.ts` are reused unchanged
(research.md R6).

- `(x0, y0)` of each stroke's first point is a **signed offset from the annotation's anchor point**
  (data-model.md), not a coordinate within a fixed box — it may be negative (e.g., a stroke starting
  slightly left of or above the anchor).
- Decoders validate coordinates against a fixed, generous sanity bound (not a real drawing size) to
  reject corrupt data; see research.md R6 for the rationale.
- Encoders MUST be deterministic, same as the `ink` contract (DEFLATE level 9, no timestamps).

## Error handling

Same shape as the `ink` v1 contract, extended with the version prefix change:

| Condition | Result | Rendering | Rewritten automatically? |
|-----------|--------|-----------|---------------------------|
| Header doesn't match grammar | `malformed` | Annotation is skipped (treated as absent); block left untouched in the file | Never |
| `cv2`+ (unknown version) | `unsupported-version` | Same as malformed | Never |
| Payload fails to decode | `malformed` | Same as malformed | Never |
| More than one content line | `malformed` | Same as malformed | Never |

Unlike Block Mode (which shows an in-place error placeholder where the block was tapped to open),
a malformed Canvas Mode annotation has no click target to show a placeholder in — it simply does not
render, per FR-010's "harmless, inert" requirement. Its raw block remains in the file, untouched, so
no data is lost and a future plugin version (or a fix during this spike) can still recover it.

## Golden fixtures

Deferred: this is a spike format, so no append-only golden fixture set is committed the way `ink` v1
has one. If Canvas Mode proceeds past the spike, golden fixtures should be added before any format
freeze commitment, following the `ink` v1 precedent.
