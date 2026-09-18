// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { attachPointerCapture } from '../../../src/canvas/pointer-capture';

function makeRootWithChild(): { root: HTMLElement; child: HTMLElement } {
	const root = document.createElement('div');
	const child = document.createElement('div');
	root.appendChild(child);
	document.body.appendChild(root);
	return { root, child };
}

function dispatchPointer(
	target: HTMLElement,
	type: string,
	init: Partial<PointerEventInit> = {},
): PointerEvent {
	const event = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		pointerType: 'pen',
		buttons: 1,
		clientX: 10,
		clientY: 20,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

function noopHandlers(): {
	onPenStart: ReturnType<typeof vi.fn<(e: PointerEvent, local: { x: number; y: number }) => void>>;
	onPenMove: ReturnType<typeof vi.fn<(e: PointerEvent, local: { x: number; y: number }) => void>>;
	onPenEnd: ReturnType<typeof vi.fn<(e: PointerEvent) => void>>;
} {
	return {
		onPenStart: vi.fn<(e: PointerEvent, local: { x: number; y: number }) => void>(),
		onPenMove: vi.fn<(e: PointerEvent, local: { x: number; y: number }) => void>(),
		onPenEnd: vi.fn<(e: PointerEvent) => void>(),
	};
}

describe('attachPointerCapture', () => {
	it('intercepts a pen pointerdown dispatched on a child of the capture root', () => {
		const { root, child } = makeRootWithChild();
		const handlers = noopHandlers();
		attachPointerCapture(root, handlers);

		const event = dispatchPointer(child, 'pointerdown', { pointerType: 'pen', buttons: 1 });

		expect(event.defaultPrevented).toBe(true);
		expect(handlers.onPenStart).toHaveBeenCalledTimes(1);
		const [calledEvent, local] = handlers.onPenStart.mock.calls[0] as [PointerEvent, { x: number; y: number }];
		expect(calledEvent).toBe(event);
		expect(typeof local.x).toBe('number');
		expect(typeof local.y).toBe('number');
	});

	it('leaves a touch pointerdown alone', () => {
		const { root, child } = makeRootWithChild();
		const handlers = noopHandlers();
		attachPointerCapture(root, handlers);

		const event = dispatchPointer(child, 'pointerdown', { pointerType: 'touch', buttons: 1 });

		expect(event.defaultPrevented).toBe(false);
		expect(handlers.onPenStart).not.toHaveBeenCalled();
	});

	it('leaves a mouse pointerdown alone', () => {
		const { root, child } = makeRootWithChild();
		const handlers = noopHandlers();
		attachPointerCapture(root, handlers);

		const event = dispatchPointer(child, 'pointerdown', { pointerType: 'mouse', buttons: 1 });

		expect(event.defaultPrevented).toBe(false);
		expect(handlers.onPenStart).not.toHaveBeenCalled();
	});

	it('ignores a pen hover pointermove (no buttons pressed), reusing classifyPointer', () => {
		const { root, child } = makeRootWithChild();
		const handlers = noopHandlers();
		attachPointerCapture(root, handlers);

		const event = dispatchPointer(child, 'pointermove', { pointerType: 'pen', buttons: 0 });

		expect(event.defaultPrevented).toBe(false);
		expect(handlers.onPenMove).not.toHaveBeenCalled();
	});

	it('calls onPenEnd for a pen pointerup and prevents default', () => {
		const { root, child } = makeRootWithChild();
		const handlers = noopHandlers();
		attachPointerCapture(root, handlers);

		const event = dispatchPointer(child, 'pointerup', { pointerType: 'pen' });

		expect(event.defaultPrevented).toBe(true);
		expect(handlers.onPenEnd).toHaveBeenCalledTimes(1);
	});

	it('stops intercepting after the returned detach function is called', () => {
		const { root, child } = makeRootWithChild();
		const handlers = noopHandlers();
		const detach = attachPointerCapture(root, handlers);
		detach();

		const event = dispatchPointer(child, 'pointerdown', { pointerType: 'pen', buttons: 1 });

		expect(event.defaultPrevented).toBe(false);
		expect(handlers.onPenStart).not.toHaveBeenCalled();
	});
});
