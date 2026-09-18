import { describe, expect, it } from 'vitest';
import { isCanvasModeEnabled, setCanvasModeEnabled } from '../../../src/canvas/frontmatter';

describe('isCanvasModeEnabled', () => {
	it('is true when canvas-mode is exactly true', () => {
		expect(isCanvasModeEnabled({ 'canvas-mode': true })).toBe(true);
	});

	it('is false when canvas-mode is false', () => {
		expect(isCanvasModeEnabled({ 'canvas-mode': false })).toBe(false);
	});

	it('is false when canvas-mode is absent', () => {
		expect(isCanvasModeEnabled({})).toBe(false);
		expect(isCanvasModeEnabled(null)).toBe(false);
		expect(isCanvasModeEnabled(undefined)).toBe(false);
	});

	it('is false for any non-boolean value', () => {
		expect(isCanvasModeEnabled({ 'canvas-mode': 'true' })).toBe(false);
		expect(isCanvasModeEnabled({ 'canvas-mode': 1 })).toBe(false);
		expect(isCanvasModeEnabled({ 'canvas-mode': null })).toBe(false);
	});
});

describe('setCanvasModeEnabled', () => {
	it('sets canvas-mode to true', () => {
		const fm: Record<string, unknown> = {};
		setCanvasModeEnabled(fm, true);
		expect(fm['canvas-mode']).toBe(true);
	});

	it('sets canvas-mode to false', () => {
		const fm: Record<string, unknown> = { 'canvas-mode': true };
		setCanvasModeEnabled(fm, false);
		expect(fm['canvas-mode']).toBe(false);
	});

	it('round-trips true then false', () => {
		const fm: Record<string, unknown> = {};
		setCanvasModeEnabled(fm, true);
		expect(isCanvasModeEnabled(fm)).toBe(true);
		setCanvasModeEnabled(fm, false);
		expect(isCanvasModeEnabled(fm)).toBe(false);
	});

	it('does not touch other existing frontmatter keys', () => {
		const fm: Record<string, unknown> = { title: 'My note', tags: ['a', 'b'] };
		setCanvasModeEnabled(fm, true);
		expect(fm.title).toBe('My note');
		expect(fm.tags).toEqual(['a', 'b']);
		expect(fm['canvas-mode']).toBe(true);
	});
});
