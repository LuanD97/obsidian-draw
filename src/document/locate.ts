export type BlockLocation =
	| { kind: 'found'; start: number; end: number; prefix: string }
	| { kind: 'not-found' }
	| { kind: 'duplicate'; count: number };

// One fenced block matching a given fence language, found by scanFencedBlocks.
// `content` is the single candidate content line's text (prefix stripped, not
// trimmed) so callers can parse or validate its header themselves; blockStart/
// blockEnd span the full block (opening fence line through closing fence line,
// or to end of file if unclosed).
export interface FencedBlockRef {
	blockStart: number;
	blockEnd: number;
	payloadStart: number;
	payloadEnd: number;
	prefix: string;
	content: string;
}

interface Line {
	start: number;
	end: number; // excludes a trailing \r
}

interface FenceOpen {
	prefix: string;
	char: string;
	length: number;
	info: string;
}

const PREFIX_RE = /^((?:>[ \t]?)*[ \t]{0,3})/;
const FENCE_RE = /^(`{3,}|~{3,})(.*)$/;
// Version tag is a run of lowercase letters (e.g. "v" for ink v1, "cv" for
// Canvas Mode's cv1) followed by digits, so this matches both fence languages'
// headers without needing to know which one is being scanned.
const ID_RE = /^[a-z]+\d+;id=([0-9a-z]{8});/;

function splitLines(text: string): Line[] {
	const lines: Line[] = [];
	let lineStart = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			let end = i;
			if (end > lineStart && text[end - 1] === '\r') end -= 1;
			lines.push({ start: lineStart, end });
			lineStart = i + 1;
		}
	}
	lines.push({ start: lineStart, end: text.length });
	return lines;
}

function extractPrefix(content: string): { prefix: string; rest: string } {
	const match = PREFIX_RE.exec(content);
	const prefix = (match?.[1] as string) ?? '';
	return { prefix, rest: content.slice(prefix.length) };
}

function matchFenceOpen(content: string): FenceOpen | null {
	const { prefix, rest } = extractPrefix(content);
	const fenceMatch = FENCE_RE.exec(rest);
	if (!fenceMatch) return null;
	const fenceChars = fenceMatch[1] as string;
	const infoRaw = (fenceMatch[2] as string).trim();
	const char = fenceChars[0] as string;
	if (char === '`' && infoRaw.includes('`')) return null;
	return { prefix, char, length: fenceChars.length, info: infoRaw };
}

function isClosingFence(content: string, open: FenceOpen): boolean {
	if (!content.startsWith(open.prefix)) return false;
	const rest = content.slice(open.prefix.length).trim();
	if (rest.length < open.length) return false;
	for (const ch of rest) {
		if (ch !== open.char) return false;
	}
	return true;
}

export function scanFencedBlocks(text: string, fenceInfo: string): FencedBlockRef[] {
	const lines = splitLines(text);
	const refs: FencedBlockRef[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i] as Line;
		const content = text.slice(line.start, line.end);
		const open = matchFenceOpen(content);

		if (!open) {
			i += 1;
			continue;
		}

		const candidates: { start: number; end: number; prefix: string; rest: string }[] = [];
		let j = i + 1;
		while (j < lines.length) {
			const innerLine = lines[j] as Line;
			const innerContent = text.slice(innerLine.start, innerLine.end);
			if (isClosingFence(innerContent, open)) break;

			const { prefix: ownPrefix, rest } = extractPrefix(innerContent);
			if (rest.trim() !== '') {
				candidates.push({
					start: innerLine.start + ownPrefix.length,
					end: innerLine.end,
					prefix: ownPrefix,
					rest,
				});
			}
			j += 1;
		}

		if (open.info === fenceInfo && candidates.length === 1) {
			const candidate = candidates[0] as (typeof candidates)[number];
			// j points at the closing fence line when one was found, or past the
			// end of the lines array when the fence was never closed (unclosed at
			// EOF) — in that case the block runs to the end of the last line.
			const blockEndLine = j < lines.length ? (lines[j] as Line) : (lines[lines.length - 1] as Line);
			refs.push({
				blockStart: line.start,
				blockEnd: blockEndLine.end,
				payloadStart: candidate.start,
				payloadEnd: candidate.end,
				prefix: candidate.prefix,
				content: candidate.rest,
			});
		}

		i = j < lines.length ? j + 1 : lines.length;
	}

	return refs;
}

export function locateBlock(text: string, id: string, fenceInfo = 'ink'): BlockLocation {
	const refs = scanFencedBlocks(text, fenceInfo);
	const matches = refs.filter((ref) => {
		const idMatch = ID_RE.exec(ref.content);
		return idMatch !== null && idMatch[1] === id;
	});

	if (matches.length === 0) return { kind: 'not-found' };
	if (matches.length > 1) return { kind: 'duplicate', count: matches.length };
	const m = matches[0] as FencedBlockRef;
	return { kind: 'found', start: m.payloadStart, end: m.payloadEnd, prefix: m.prefix };
}
