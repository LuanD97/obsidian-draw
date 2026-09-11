import { describe, expect, it } from 'vitest';
import { classifyPointer } from '../../../src/editor/input-filter';

describe('classifyPointer', () => {
	it('draws on pen pointerdown with buttons 1', () => {
		expect(classifyPointer({ type: 'pointerdown', pointerType: 'pen', buttons: 1 })).toBe('draw');
	});

	it('draws on pen pointermove with buttons 1', () => {
		expect(classifyPointer({ type: 'pointermove', pointerType: 'pen', buttons: 1 })).toBe('draw');
	});

	it('ignores pen pointermove with buttons 0 (hover)', () => {
		expect(classifyPointer({ type: 'pointermove', pointerType: 'pen', buttons: 0 })).toBe(
			'ignore',
		);
	});

	it('ends on pen pointerup', () => {
		expect(classifyPointer({ type: 'pointerup', pointerType: 'pen', buttons: 0 })).toBe('end');
	});

	it('ends on pen pointercancel', () => {
		expect(classifyPointer({ type: 'pointercancel', pointerType: 'pen', buttons: 0 })).toBe('end');
	});

	it('ignores every touch event', () => {
		expect(classifyPointer({ type: 'pointerdown', pointerType: 'touch', buttons: 1 })).toBe(
			'ignore',
		);
		expect(classifyPointer({ type: 'pointermove', pointerType: 'touch', buttons: 1 })).toBe(
			'ignore',
		);
		expect(classifyPointer({ type: 'pointerup', pointerType: 'touch', buttons: 0 })).toBe(
			'ignore',
		);
	});

	it('ignores every mouse event', () => {
		expect(classifyPointer({ type: 'pointerdown', pointerType: 'mouse', buttons: 1 })).toBe(
			'ignore',
		);
		expect(classifyPointer({ type: 'pointermove', pointerType: 'mouse', buttons: 1 })).toBe(
			'ignore',
		);
		expect(classifyPointer({ type: 'pointerup', pointerType: 'mouse', buttons: 0 })).toBe(
			'ignore',
		);
	});
});
