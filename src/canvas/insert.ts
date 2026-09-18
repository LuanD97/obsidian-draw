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

// A paragraph is a blank-line-delimited run of lines; an "ink"/"ink-canvas"
// fenced block is its own chunk so a new annotation can be inserted after any
// that already trail a paragraph, instead of between the paragraph and them.
// Any other fence is not specially recognised (a spike-level simplification:
// its lines are just non-blank paragraph text, same as any other line).
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
		const info = fenceMatch ? fenceMatch[2]!.trim() : null;

		if (fenceMatch && (info === 'ink' || info === 'ink-canvas')) {
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
			chunks.push({ kind: 'block', startLine: i, endLine });
			i = closed ? j + 1 : lines.length;
			continue;
		}

		let j = i;
		while (j < lines.length && !isBlank(text, lines[j] as Line)) j += 1;
		chunks.push({ kind: 'paragraph', startLine: i, endLine: j - 1 });
		i = j;
	}
	return chunks;
}

function appendAtEnd(text: string, blockMarkdown: string): string {
	if (text.length === 0) return blockMarkdown;
	if (text.endsWith('\n\n') || text.endsWith('\r\n\r\n')) return text + blockMarkdown;
	if (text.endsWith('\n')) return text + '\n' + blockMarkdown;
	return text + '\n\n' + blockMarkdown;
}

// Inserts blockMarkdown as its own paragraph (blank line before and after)
// right after the paragraph containing/nearest-before `pos`, and after any
// "ink"/"ink-canvas" blocks that already immediately trail that paragraph —
// so a note's annotations accumulate in drawing order rather than being
// inserted ahead of ones already there (data-model.md "New annotation" save
// flow).
export function insertAnnotationAfterParagraph(text: string, pos: number, blockMarkdown: string): string {
	const lines = splitLines(text);
	const chunks = chunkify(text, lines);
	if (chunks.length === 0) return appendAtEnd(text, blockMarkdown);

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

	if (nextIndex >= chunks.length) {
		return appendAtEnd(text, blockMarkdown);
	}

	const insertOffset = (lines[(chunks[nextIndex] as Chunk).startLine] as Line).start;
	return text.slice(0, insertOffset) + blockMarkdown + '\n' + text.slice(insertOffset);
}
