import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBlockLine, parseBlockLine } from '../../../src/format/block-line';
import { generateHandwriting } from '../../fixtures/handwriting';
import type { Drawing, RawPoint, Stroke } from '../../../src/model/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, '../../fixtures/v1');
const FIXTURE_NAMES = ['empty', 'dot', 'sentence'] as const;
const WIDTH = 700;
const HEIGHT = 260;

// Golden fixtures are generated once (T020) and are append-only from then on;
// this local quantiser mirrors the not-yet-built src/model/quantize.ts just
// well enough to produce "already quantised" points for the sentence fixture.
function quantizeStroke(raw: RawPoint[], width: number, height: number): Stroke {
	const points = raw.map((pt) => ({
		x: Math.min(width, Math.max(0, Math.round(pt.x))),
		y: Math.min(height, Math.max(0, Math.round(pt.y))),
		p: Math.min(255, Math.max(0, Math.round(pt.pressure * 255))),
	}));
	const deduped = points.filter(
		(pt, i) => i === 0 || pt.x !== points[i - 1]?.x || pt.y !== points[i - 1]?.y,
	);
	return { points: deduped.length > 0 ? deduped : [points[0] as Stroke['points'][number]] };
}

function buildFixture(name: (typeof FIXTURE_NAMES)[number]): Drawing {
	switch (name) {
		case 'empty':
			return { version: 1, id: 'e0000001', width: WIDTH, height: HEIGHT, strokes: [] };
		case 'dot':
			return {
				version: 1,
				id: 'd0000001',
				width: WIDTH,
				height: HEIGHT,
				strokes: [{ points: [{ x: 350, y: 130, p: 128 }] }],
			};
		case 'sentence': {
			const raw = generateHandwriting(1, WIDTH, HEIGHT, { rows: 3, glyphsPerRow: 10 }); // 30 strokes
			const strokes = raw.map((s) => quantizeStroke(s, WIDTH, HEIGHT));
			return { version: 1, id: 's0000001', width: WIDTH, height: HEIGHT, strokes };
		}
	}
}

function extractLine(md: string): string {
	const match = /```ink\n(.*)\n```/.exec(md);
	if (!match) throw new Error('fixture markdown has no ink block');
	return match[1] as string;
}

if (process.env.UPDATE_GOLDEN === '1') {
	beforeAll(() => {
		mkdirSync(FIXTURES_DIR, { recursive: true });
		for (const name of FIXTURE_NAMES) {
			const mdPath = join(FIXTURES_DIR, `${name}.md`);
			const jsonPath = join(FIXTURES_DIR, `${name}.json`);
			const drawing = buildFixture(name);
			const line = formatBlockLine(drawing);
			if (!existsSync(mdPath)) {
				writeFileSync(mdPath, '```ink\n' + line + '\n```\n');
			}
			if (!existsSync(jsonPath)) {
				writeFileSync(jsonPath, JSON.stringify(drawing, null, '\t') + '\n');
			}
		}
	});
}

describe('golden v1 fixtures', () => {
	it.each(FIXTURE_NAMES)('%s round-trips against its golden json', (name) => {
		const mdPath = join(FIXTURES_DIR, `${name}.md`);
		const jsonPath = join(FIXTURES_DIR, `${name}.json`);
		expect(existsSync(mdPath), `missing ${mdPath}; run with UPDATE_GOLDEN=1 to generate it`).toBe(
			true,
		);
		expect(existsSync(jsonPath)).toBe(true);

		const line = extractLine(readFileSync(mdPath, 'utf8'));
		const expected = JSON.parse(readFileSync(jsonPath, 'utf8')) as Drawing;

		expect(parseBlockLine(line)).toEqual(expected);
		expect(formatBlockLine(expected)).toBe(line);
	});
});
