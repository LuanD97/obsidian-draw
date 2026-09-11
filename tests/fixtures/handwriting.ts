import type { RawPoint } from '../../src/model/types';

// mulberry32: small, fast, seedable PRNG (public domain).
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function next(): number {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface HandwritingOptions {
	rows: number;
	glyphsPerRow: number;
}

/**
 * Deterministic synthetic "handwriting": cursive-like wobbling strokes laid
 * out in a grid of rows/glyphs filling the canvas edge to edge, used for
 * size-budget and round-trip tests (no real Pencil input available headless).
 */
export function generateHandwriting(
	seed: number,
	width: number,
	height: number,
	options: HandwritingOptions,
): RawPoint[][] {
	const { rows, glyphsPerRow } = options;
	const rand = mulberry32(seed);
	const strokes: RawPoint[][] = [];

	const rowHeight = height / rows;
	const glyphWidth = width / glyphsPerRow;

	for (let row = 0; row < rows; row++) {
		const baseY = rowHeight * (row + 0.5);
		for (let col = 0; col < glyphsPerRow; col++) {
			const baseX = glyphWidth * col;
			const pointCount = 40 + Math.floor(rand() * 41); // 40..80
			const points: RawPoint[] = [];
			let pressure = 0.3 + rand() * 0.3;
			for (let i = 0; i < pointCount; i++) {
				const t = i / (pointCount - 1 || 1);
				const x = baseX + t * glyphWidth * 0.9 + Math.sin(t * Math.PI * 4 + rand()) * (glyphWidth * 0.08);
				const y = baseY + Math.sin(t * Math.PI * 6 + row) * (rowHeight * 0.25) + (rand() - 0.5) * 2;
				pressure += (rand() - 0.5) * 0.1;
				pressure = Math.min(0.9, Math.max(0.3, pressure));
				points.push({ x, y, pressure });
			}
			strokes.push(points);
		}
	}

	return strokes;
}
