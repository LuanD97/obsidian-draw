# Contract: Core Module API

Signatures of the pure, headless-testable modules (constitution I). These are the targets of the
test-first tasks; Obsidian and DOM glue call only these. Names are binding for v1; internal helpers
are free to change.

```ts
// src/model/types.ts
export interface Point { x: number; y: number; p: number }          // integers, see data-model.md
export interface Stroke { points: Point[] }
export interface Drawing { version: 1; id: string; width: number; height: number; strokes: Stroke[] }
export interface RawPoint { x: number; y: number; pressure: number } // floats from pointer events

// src/format/varint.ts
export function writeUvarint(out: number[], n: number): void;
export function writeSvarint(out: number[], n: number): void;
export class ByteReader { constructor(bytes: Uint8Array); uvarint(): number; svarint(): number; done(): boolean }

// src/format/codec.ts
export function encodePayload(strokes: Stroke[]): string;                       // base64, '' if empty
export function decodePayload(payload: string, width: number, height: number): Stroke[]; // throws DecodeError

// src/format/block-line.ts
export type DecodeErrorKind = 'malformed' | 'unsupported-version';
export class DecodeError extends Error { kind: DecodeErrorKind }
export function formatBlockLine(d: Drawing): string;
export function parseBlockLine(line: string): Drawing;                          // throws DecodeError
export function newBlockMarkdown(d: Drawing): string;                           // "```ink\n<line>\n```\n"

// src/format/id.ts
export function generateId(random?: (n: number) => Uint8Array): string;        // 8 chars [0-9a-z]

// src/model/simplify.ts
export function simplify(points: RawPoint[], epsilon: number): RawPoint[];     // RDP on x,y
// src/model/quantize.ts
export function commitStroke(raw: RawPoint[], width: number, height: number): Stroke; // simplify + round + clamp

// src/model/erase.ts
export function hitStrokes(strokes: Stroke[], at: { x: number; y: number }, radius: number): number[]; // indices

// src/model/history.ts
export type Command =
  | { kind: 'add'; stroke: Stroke }
  | { kind: 'erase'; removed: { index: number; stroke: Stroke }[] }
  | { kind: 'resize'; from: Size; to: Size };
export interface Size { width: number; height: number }
export class History {
  apply(d: Drawing, c: Command): Drawing;  // records c, clears redo
  undo(d: Drawing): Drawing;               // no-op if empty
  redo(d: Drawing): Drawing;
  canUndo(): boolean; canRedo(): boolean;
}

// src/model/canvas-size.ts
export function defaultSize(measuredColumnWidth: number | null): Size;
export function minSize(strokes: Stroke[]): Size;
export function clampSize(want: Size, min: Size, max: Size): Size;
export function fitScale(size: Size, available: Size): number;                 // ≤ 1

// src/document/locate.ts
export type BlockLocation =
  | { kind: 'found'; start: number; end: number; prefix: string }
  | { kind: 'not-found' }
  | { kind: 'duplicate'; count: number };
export function locateBlock(text: string, id: string): BlockLocation;

// src/document/update.ts
export type UpdateResult =
  | { kind: 'updated' | 'unchanged'; text: string }
  | { kind: 'not-found' | 'duplicate'; text: string };                        // text === input
export function applyBlockUpdate(text: string, id: string, newLine: string): UpdateResult;
export function appendBlock(text: string, blockMarkdown: string): string;

// src/document/insert.ts
export function insertionText(currentLine: string, blockMarkdown: string): string; // adds newlines as needed

// src/render/outline.ts
export function strokeOutlinePath(stroke: Stroke): string;                     // SVG path "d"

// src/render/svg-preview.ts
export function buildPreviewSvg(doc: Document, d: Drawing): SVGSVGElement;    // fill=currentColor, viewBox

// src/editor/input-filter.ts
export type PointerAction = 'draw' | 'ignore' | 'end';
export function classifyPointer(e: { type: string; pointerType: string; buttons: number }): PointerAction;

// src/editor/save-queue.ts
export interface SaveOutcome { kind: 'updated' | 'unchanged' | 'not-found' | 'duplicate' }
export class SaveQueue {
  constructor(save: (line: string) => Promise<SaveOutcome>, opts: { debounceMs: number; timers?: Timers });
  schedule(line: string): void;          // debounced
  flush(): Promise<SaveOutcome | null>;  // immediate; null if nothing pending
}
```

Obsidian adapter (thin, tested with a fake vault):

```ts
// src/obsidian/vault-save.ts
export interface ProcessingVault { process(file: TFileLike, fn: (data: string) => string): Promise<string> }
export function saveBlock(vault: ProcessingVault, file: TFileLike, id: string, line: string): Promise<SaveOutcome>;
export function appendNewBlock(vault: ProcessingVault, file: TFileLike, d: Drawing): Promise<void>;
```
