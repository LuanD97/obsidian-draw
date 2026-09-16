// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { backingScale, CanvasLayers } from '../../src/editor/canvas-layers';

describe('backingScale', () => {
	it('is min(dpr, 2) when that stays within the pixel budget', () => {
		expect(backingScale({ width: 100, height: 100 }, 3)).toBe(2);
		expect(backingScale({ width: 100, height: 100 }, 1)).toBe(1);
	});

	it('is reduced further so that width*height*scale^2 <= 16,777,216', () => {
		const scale = backingScale({ width: 4096, height: 4096 }, 2);
		expect(scale).toBeCloseTo(1);
		expect(4096 * 4096 * scale * scale).toBeLessThanOrEqual(16_777_216);
	});
});

describe('CanvasLayers', () => {
	it('creates two stacked canvases sized by backingScale', () => {
		const container = document.createElement('div');
		const size = { width: 700, height: 260 };
		const dpr = 2;
		const layers = new CanvasLayers(document, container, size, dpr);

		const scale = backingScale(size, dpr);
		expect(container.contains(layers.static)).toBe(true);
		expect(container.contains(layers.live)).toBe(true);
		expect(layers.static.width).toBe(Math.round(size.width * scale));
		expect(layers.static.height).toBe(Math.round(size.height * scale));
		expect(layers.live.width).toBe(Math.round(size.width * scale));
		expect(layers.live.height).toBe(Math.round(size.height * scale));
	});

	it('resize() recomputes backingScale for the new size and resizes both canvases', () => {
		const container = document.createElement('div');
		const dpr = 2;
		const layers = new CanvasLayers(document, container, { width: 700, height: 260 }, dpr);

		const newSize = { width: 4096, height: 4096 };
		layers.resize(newSize);

		const scale = backingScale(newSize, dpr);
		expect(layers.static.width).toBe(Math.round(newSize.width * scale));
		expect(layers.static.height).toBe(Math.round(newSize.height * scale));
		expect(layers.live.width).toBe(Math.round(newSize.width * scale));
		expect(layers.live.height).toBe(Math.round(newSize.height * scale));
		// still attached, unlike free()
		expect(container.contains(layers.static)).toBe(true);
		expect(container.contains(layers.live)).toBe(true);
	});

	it('free() sets both canvases width/height to 0 and detaches them', () => {
		const container = document.createElement('div');
		const layers = new CanvasLayers(document, container, { width: 700, height: 260 }, 2);

		layers.free();

		expect(layers.static.width).toBe(0);
		expect(layers.static.height).toBe(0);
		expect(layers.live.width).toBe(0);
		expect(layers.live.height).toBe(0);
		expect(container.contains(layers.static)).toBe(false);
		expect(container.contains(layers.live)).toBe(false);
	});
});
