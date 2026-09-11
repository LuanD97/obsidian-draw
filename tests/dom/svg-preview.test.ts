// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildPreviewSvg } from '../../src/render/svg-preview';
import type { Drawing } from '../../src/model/types';

describe('buildPreviewSvg', () => {
	it('has class ink-preview-svg and the correct viewBox/width/max-width', () => {
		const drawing: Drawing = {
			version: 1,
			id: 'aaaaaaaa',
			width: 700,
			height: 260,
			strokes: [{ points: [{ x: 1, y: 1, p: 100 }] }],
		};
		const svg = buildPreviewSvg(document, drawing);

		expect(svg.classList.contains('ink-preview-svg')).toBe(true);
		expect(svg.getAttribute('viewBox')).toBe('0 0 700 260');
		expect(svg.style.width).toBe('100%');
		expect(svg.style.maxWidth).toBe('700px');
	});

	it('renders one <path> per stroke, each filled with currentColor', () => {
		const drawing: Drawing = {
			version: 1,
			id: 'aaaaaaaa',
			width: 700,
			height: 260,
			strokes: [
				{ points: [{ x: 1, y: 1, p: 100 }] },
				{
					points: [
						{ x: 10, y: 10, p: 100 },
						{ x: 20, y: 20, p: 200 },
					],
				},
			],
		};
		const svg = buildPreviewSvg(document, drawing);
		const paths = svg.querySelectorAll('path');

		expect(paths.length).toBe(2);
		for (const path of paths) {
			expect(path.getAttribute('fill')).toBe('currentColor');
		}
	});

	it('produces no paths for an empty drawing', () => {
		const drawing: Drawing = { version: 1, id: 'aaaaaaaa', width: 700, height: 260, strokes: [] };
		const svg = buildPreviewSvg(document, drawing);
		expect(svg.querySelectorAll('path').length).toBe(0);
	});
});
