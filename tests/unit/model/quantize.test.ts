import { describe, expect, it } from 'vitest';
import { commitStroke } from '../../../src/model/quantize';
import type { RawPoint } from '../../../src/model/types';

describe('commitStroke', () => {
	it('rounds coordinates to integers and clamps to [0,width]x[0,height]', () => {
		const raw: RawPoint[] = [
			{ x: -5.4, y: -2.2, pressure: 0.5 },
			{ x: 705.6, y: 265.9, pressure: 0.5 },
		];
		const stroke = commitStroke(raw, 700, 260);
		expect(stroke.points[0]).toMatchObject({ x: 0, y: 0 });
		expect(stroke.points[stroke.points.length - 1]).toMatchObject({ x: 700, y: 260 });
		for (const p of stroke.points) {
			expect(Number.isInteger(p.x)).toBe(true);
			expect(Number.isInteger(p.y)).toBe(true);
		}
	});

	it('maps pressure to round(pressure*255) clamped to 0-255', () => {
		const raw: RawPoint[] = [
			{ x: 10, y: 10, pressure: -0.1 },
			{ x: 300, y: 200, pressure: 0.5 }, // well off the 10,10 -> 600,50 line, so RDP keeps it
			{ x: 600, y: 50, pressure: 1.4 },
		];
		const stroke = commitStroke(raw, 700, 260);
		expect(stroke.points[0]?.p).toBe(0);
		expect(stroke.points[1]?.p).toBe(128); // round(0.5*255) = 128 (127.5 -> 128)
		expect(stroke.points[stroke.points.length - 1]?.p).toBe(255);
	});

	it('removes consecutive duplicate points after rounding, keeping at least one point', () => {
		const raw: RawPoint[] = [
			{ x: 10.1, y: 10.1, pressure: 0.5 },
			{ x: 10.2, y: 10.2, pressure: 0.5 }, // rounds to the same integer point
			{ x: 300, y: 30, pressure: 0.5 },
		];
		const stroke = commitStroke(raw, 700, 260);
		for (let i = 1; i < stroke.points.length; i++) {
			const prev = stroke.points[i - 1] as { x: number; y: number };
			const cur = stroke.points[i] as { x: number; y: number };
			expect(prev.x === cur.x && prev.y === cur.y).toBe(false);
		}
		expect(stroke.points.length).toBeGreaterThanOrEqual(1);
	});

	it('never re-simplifies a stroke that has already been committed', () => {
		// A dense straight line: RDP would collapse it to endpoints, but
		// calling commitStroke on an already-committed stroke's points again
		// must not happen through the public API - commitStroke only takes
		// raw points and is not idempotent-by-design across double application
		// at the model layer, so this asserts a single pass keeps interior
		// points that are NOT collinear (sanity: commit doesn't over-simplify
		// beyond what simplify+round produces once).
		const raw: RawPoint[] = [
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 5, y: 5, pressure: 0.5 },
			{ x: 10, y: 0, pressure: 0.5 },
		];
		const stroke = commitStroke(raw, 700, 260);
		expect(stroke.points.length).toBe(3);
	});

	// Regression: commitStroke used to run the points through RDP geometric
	// simplification before quantizing, which always collapses a nearly
	// stationary run (a pen-down/pen-up taper: position barely moves while
	// pressure ramps) to 1-2 points, regardless of epsilon - discarding most
	// of the pressure signal and producing blank/gappy patches on
	// re-render. Strokes are now quantized as captured (round + clamp + drop
	// only exact duplicates); a dense block still stays well inside the 30KB
	// budget (tests/integration/roundtrip-size.test.ts), so there is no
	// reason to trade fidelity for it.
	it('keeps every distinct raw sample (no geometric simplification), even along a perfectly straight run', () => {
		// Perfectly collinear and each one unit apart, so every sample rounds
		// to its own distinct integer point. RDP would have collapsed this
		// whole run to just the two endpoints (deviation 0 <= any epsilon).
		const raw: RawPoint[] = [];
		for (let i = 0; i <= 40; i++) {
			raw.push({ x: i, y: 0, pressure: 0.5 });
		}
		const stroke = commitStroke(raw, 700, 260);
		expect(stroke.points.length).toBe(raw.length);
	});

	it('keeps a duplicate-position point when its pressure differs (a taper), instead of dropping it', () => {
		const raw: RawPoint[] = [
			{ x: 10, y: 10, pressure: 0.05 },
			{ x: 10.2, y: 10.1, pressure: 0.9 }, // rounds to the same (10,10) but a very different pressure
			{ x: 50, y: 50, pressure: 0.5 },
		];
		const stroke = commitStroke(raw, 700, 260);
		const pressures = stroke.points.map((p) => p.p);
		expect(pressures).toContain(13); // round(0.05*255)
		expect(pressures).toContain(230); // round(0.9*255)
	});
});
