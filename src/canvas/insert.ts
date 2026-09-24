interface Line {
	start: number;
	end: number;
}

interface Chunk {
	kind: 'paragraph' | 'block';
	startLine: number;
	endLine: number; // inclusive
}

const FENCE_RE = /^(`{3,}|~{3,})(.*)$/;

function splitLines(text: string): Line[] {
	const lines: Line[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			lines.push({ start, end: i });
			start = i + 1;
		}
	}
	lines.push({ start, end: text.length });
	return lines;
}

function isBlank(text: string, line: Line): boolean {
	return text.slice(line.start, line.end).trim() === '';
}

// A paragraph is a blank-line-delimited run of lines. Any fence — "ink"/
// "ink-canvas" or otherwise (a ```js code block, say) — is scanned through to
// its own matching close as a single atomic chunk, never split by a blank
// line inside it: only an "ink"/"ink-canvas" fence gets `kind: 'block'` (so a
// new annotation can be inserted after any that already trail a paragraph,
// instead of between the paragraph and them); any other fence gets
// `kind: 'paragraph'`, since findInsertionPoint only needs to know whether to
// skip *trailing ink blocks*, not to specially recognise every other fence
// language — but its content must still never be treated as several separate
// paragraphs. An earlier version only gave this atomic, skip-to-close
// treatment to ink/ink-canvas fences and fell through to the generic
// blank-line-delimited paragraph scan for every other fence — so a code
// block containing a blank line (extremely common) got misread as two
// separate paragraphs split at that blank line, and a new annotation drawn
// near it could be inserted *inside* the code fence, breaking it into two
// malformed pieces. Found on-device as ink "distortion" correlated with a
// note already containing an unrelated code block (research.md R16).
function chunkify(text: string, lines: Line[]): Chunk[] {
	const chunks: Chunk[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] as Line;
		if (isBlank(text, line)) {
			i += 1;
			continue;
		}

		const trimmed = text.slice(line.start, line.end).trim();
		const fenceMatch = FENCE_RE.exec(trimmed);

		if (fenceMatch) {
			const info = fenceMatch[2]!.trim();
			const fenceChar = (fenceMatch[1] as string)[0] as string;
			const fenceLen = (fenceMatch[1] as string).length;
			let j = i + 1;
			let closed = false;
			while (j < lines.length) {
				const inner = text.slice((lines[j] as Line).start, (lines[j] as Line).end).trim();
				if (inner.length >= fenceLen && [...inner].every((ch) => ch === fenceChar)) {
					closed = true;
					break;
				}
				j += 1;
			}
			const endLine = closed ? j : lines.length - 1;
			const kind = info === 'ink' || info === 'ink-canvas' ? 'block' : 'paragraph';
			chunks.push({ kind, startLine: i, endLine });
			i = closed ? j + 1 : lines.length;
			continue;
		}

		// Stops at a blank line *or* the start of a fence, whichever comes
		// first — a fence interrupts a paragraph in CommonMark without
		// needing a blank line before it (the same rule this module relies
		// on to omit blank-line padding around its own inserted blocks,
		// research.md R21). Without this, a fence directly adjacent to a
		// paragraph (no blank line) would be swallowed into this same
		// paragraph chunk instead of being recognised as its own chunk on
		// the outer loop's next iteration.
		let j = i;
		while (j < lines.length) {
			const jLine = lines[j] as Line;
			if (isBlank(text, jLine)) break;
			if (FENCE_RE.test(text.slice(jLine.start, jLine.end).trim())) break;
			j += 1;
		}
		chunks.push({ kind: 'paragraph', startLine: i, endLine: j - 1 });
		i = j;
	}
	return chunks;
}

// No blank-line padding (research.md R21): only ensures the block starts on
// its own line, never that it's preceded by a blank one.
function appendAtEnd(text: string, blockMarkdown: string): string {
	if (text.length === 0) return blockMarkdown;
	if (text.endsWith('\n')) return text + blockMarkdown;
	return text + '\n' + blockMarkdown;
}

// The character offset right after the paragraph containing/nearest-before
// `pos`, and after any "ink"/"ink-canvas" blocks that already immediately
// trail that paragraph — i.e. exactly where a new annotation's block would be
// inserted. Returns `text.length` when that's the end of the file (no
// following paragraph). Exposed separately from insertAnnotationAfterParagraph
// so glue code can resolve the same position a new annotation's block will
// occupy (e.g. to anchor it) before actually writing anything.
export function findInsertionPoint(text: string, pos: number): number {
	const lines = splitLines(text);
	const chunks = chunkify(text, lines);
	if (chunks.length === 0) return text.length;

	let lineIndex = 0;
	for (let i = 0; i < lines.length; i++) {
		if ((lines[i] as Line).start <= pos) lineIndex = i;
		else break;
	}

	let chunkIndex = chunks.findIndex((c) => lineIndex >= c.startLine && lineIndex <= c.endLine);
	if (chunkIndex === -1) {
		chunkIndex = 0;
		for (let k = 0; k < chunks.length; k++) {
			if ((chunks[k] as Chunk).startLine <= lineIndex) chunkIndex = k;
			else break;
		}
	}

	let nextIndex = chunkIndex + 1;
	while (nextIndex < chunks.length && (chunks[nextIndex] as Chunk).kind === 'block') {
		nextIndex += 1;
	}

	if (nextIndex >= chunks.length) return text.length;

	return (lines[(chunks[nextIndex] as Chunk).startLine] as Line).start;
}

// Inserts blockMarkdown as its own fenced block right after the paragraph
// containing/nearest-before `pos`, and after any "ink"/"ink-canvas" blocks
// that already immediately trail that paragraph — so a note's annotations
// accumulate in drawing order rather than being inserted ahead of ones
// already there (data-model.md "New annotation" save flow). No blank line is
// added before or after: a fenced code block interrupts a paragraph, and is
// itself interrupted by the next one, without needing one (CommonMark) —
// and since the block-hiding StateField only ever covers the fence's own
// lines (research.md R4/R18), every blank line this function used to add was
// permanently visible space between paragraphs (research.md R21). Whatever
// spacing already exists in the surrounding text is left untouched; this
// function never adds any of its own.
export function insertAnnotationAfterParagraph(text: string, pos: number, blockMarkdown: string): string {
	const insertOffset = findInsertionPoint(text, pos);
	if (insertOffset >= text.length) {
		return appendAtEnd(text, blockMarkdown);
	}
	return text.slice(0, insertOffset) + blockMarkdown + text.slice(insertOffset);
}
