export type BlockLocation =
	| { kind: 'found'; start: number; end: number; prefix: string }
	| { kind: 'not-found' }
	| { kind: 'duplicate'; count: number };

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
const ID_RE = /^v\d+;id=([0-9a-z]{8});/;

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

export function locateBlock(text: string, id: string): BlockLocation {
	const lines = splitLines(text);
	const matches: { start: number; end: number; prefix: string }[] = [];

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

		if (open.info === 'ink' && candidates.length === 1) {
			const candidate = candidates[0] as (typeof candidates)[number];
			const idMatch = ID_RE.exec(candidate.rest);
			if (idMatch && idMatch[1] === id) {
				matches.push({ start: candidate.start, end: candidate.end, prefix: candidate.prefix });
			}
		}

		i = j < lines.length ? j + 1 : lines.length;
	}

	if (matches.length === 0) return { kind: 'not-found' };
	if (matches.length > 1) return { kind: 'duplicate', count: matches.length };
	return { kind: 'found', ...(matches[0] as (typeof matches)[number]) };
}
