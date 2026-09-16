// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { openOverlay } from '../../src/editor/overlay';
import { EditingSession } from '../../src/editor/session';
import type { Drawing } from '../../src/model/types';
import type { SaveOutcome } from '../../src/editor/save-queue';

function freshDrawing(): Drawing {
	return { version: 1, id: 'aaaaaaaa', width: 700, height: 260, strokes: [] };
}

function makeDeps(overrides: Partial<Parameters<typeof openOverlay>[0]> = {}) {
	const session = overrides.session ?? new EditingSession(freshDrawing());
	return {
		doc: document,
		parent: document.body,
		session,
		flush: vi.fn(async (): Promise<SaveOutcome | null> => ({ kind: 'updated' })),
		getStrokeColor: vi.fn(() => '#111111'),
		onThemeChange: vi.fn(),
		schedule: vi.fn(),
		onClosed: vi.fn(),
		dpr: 2,
		getAvailable: vi.fn(() => ({ width: 800, height: 600 })),
		...overrides,
	};
}

describe('openOverlay', () => {
	it('appends div.ink-overlay directly to document.body', () => {
		const deps = makeDeps();
		const overlay = openOverlay(deps);
		expect(document.body.contains(overlay.element)).toBe(true);
		expect(overlay.element.classList.contains('ink-overlay')).toBe(true);
		expect(overlay.element.parentElement).toBe(document.body);
	});

	// The overlay is a fixed, full-viewport scrim only so it can stay
	// attached to document.body and center its content - that's what keeps
	// it outside the note's editable DOM (the actual safety property). The
	// toolbar and surface live inside a div.ink-panel that's sized to its
	// content, not the overlay, so the panel itself is not full-screen and
	// the rest of the note stays visible around it.
	it('wraps the toolbar and surface in a div.ink-panel, not directly in the full-viewport overlay', () => {
		const overlay = openOverlay(makeDeps());
		const panel = overlay.element.querySelector('.ink-panel');
		expect(panel).not.toBeNull();
		expect(panel?.querySelector('.ink-toolbar')).not.toBeNull();
		expect(panel?.querySelector('.ink-surface')).not.toBeNull();
		// direct children of the overlay: only the panel, nothing full-bleed
		expect(overlay.element.children).toHaveLength(1);
		expect(overlay.element.children[0]).toBe(panel);
	});

	it('has a toolbar with Pen (is-active) and Done', () => {
		const overlay = openOverlay(makeDeps());
		const toolbar = overlay.element.querySelector('.ink-toolbar');
		expect(toolbar).not.toBeNull();
		const pen = toolbar?.querySelector('[data-tool="pen"]');
		const done = toolbar?.querySelector('[data-action="done"]');
		expect(pen).not.toBeNull();
		expect(done).not.toBeNull();
		expect(pen?.classList.contains('is-active')).toBe(true);
	});

	// The buttons are icon-only (no visible text, to leave more room for the
	// canvas), so an accessible name is the only thing that identifies them
	// to assistive tech and to a mouse user hovering for a tooltip.
	it('every toolbar button carries an aria-label naming its action', () => {
		const overlay = openOverlay(makeDeps());
		const expected: [string, string][] = [
			['[data-tool="pen"]', 'Pen'],
			['[data-tool="eraser"]', 'Eraser'],
			['[data-action="undo"]', 'Undo'],
			['[data-action="redo"]', 'Redo'],
			['[data-action="done"]', 'Done'],
		];
		for (const [selector, label] of expected) {
			const button = overlay.element.querySelector(selector);
			expect(button?.getAttribute('aria-label')).toBe(label);
			expect(button?.querySelector('svg')).not.toBeNull();
		}
	});

	it('sets touch CSS on div.ink-surface', () => {
		const overlay = openOverlay(makeDeps());
		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;
		expect(surface).not.toBeNull();
		expect(surface.style.getPropertyValue('touch-action')).toBe('none');
		// happy-dom's CSSStyleDeclaration drops unknown vendor-prefixed
		// properties from its parsed API, but keeps them in the raw attribute.
		const styleAttr = surface.getAttribute('style') ?? '';
		expect(styleAttr).toContain('-webkit-user-select: none');
		expect(styleAttr).toContain('-webkit-touch-callout: none');
	});

	it('prevents default on a cancelable touchstart on the surface', () => {
		const overlay = openOverlay(makeDeps());
		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;
		const event = new Event('touchstart', { cancelable: true });
		surface.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});

	it('Done calls the injected flush, then removes the overlay and frees the canvases', async () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		const deps = makeDeps({ session });
		const overlay = openOverlay(deps);
		const canvases = overlay.element.querySelectorAll('canvas');
		expect(canvases.length).toBeGreaterThan(0);

		const done = overlay.element.querySelector('[data-action="done"]') as HTMLElement;
		done.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(deps.flush).toHaveBeenCalledTimes(1);
		expect(document.body.contains(overlay.element)).toBe(false);
		for (const canvas of canvases) {
			expect((canvas as HTMLCanvasElement).width).toBe(0);
			expect((canvas as HTMLCanvasElement).height).toBe(0);
		}
	});

	it('Done on an unchanged (clean) session closes without calling flush (FR-027)', async () => {
		const deps = makeDeps(); // fresh, clean session
		const overlay = openOverlay(deps);
		const done = overlay.element.querySelector('[data-action="done"]') as HTMLElement;
		done.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(deps.flush).not.toHaveBeenCalled();
		expect(document.body.contains(overlay.element)).toBe(false);
	});

	it('still draws when a pen pointermove event lacks getCoalescedEvents', () => {
		const deps = makeDeps();
		const overlay = openOverlay(deps);
		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;

		const down = new PointerEvent('pointerdown', {
			pointerType: 'pen',
			buttons: 1,
			clientX: 5,
			clientY: 5,
		});
		surface.dispatchEvent(down);

		const move = new PointerEvent('pointermove', {
			pointerType: 'pen',
			buttons: 1,
			clientX: 15,
			clientY: 15,
		});
		// simulate an older browser: no getCoalescedEvents on this event
		Object.defineProperty(move, 'getCoalescedEvents', { value: undefined });
		expect(() => surface.dispatchEvent(move)).not.toThrow();

		const up = new PointerEvent('pointerup', { pointerType: 'pen', buttons: 0 });
		surface.dispatchEvent(up);

		expect(deps.session.drawing.strokes.length).toBe(1);
		expect((deps.session.drawing.strokes[0]?.points.length ?? 0)).toBeGreaterThanOrEqual(2);
	});

	it('redraws the static layer with the newly read color when the theme-change callback fires', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		let color = '#111111';
		const getStrokeColor = vi.fn(() => color);
		const deps = makeDeps({ session, getStrokeColor });
		const overlay = openOverlay(deps);

		const onThemeChangeMock = deps.onThemeChange as unknown as ReturnType<typeof vi.fn>;
		expect(onThemeChangeMock).toHaveBeenCalledTimes(1);
		const themeHandler = onThemeChangeMock.mock.calls[0]?.[0] as () => void;

		const staticCanvas = overlay.element.querySelector('canvas.ink-static') as HTMLCanvasElement;
		color = '#eeeeee';
		themeHandler();

		const ctx = staticCanvas.getContext('2d') as unknown as { fillStyle: string };
		expect(ctx.fillStyle).toBe('#eeeeee');
	});

	it('has a toolbar with Eraser, Undo and Redo', () => {
		const overlay = openOverlay(makeDeps());
		const toolbar = overlay.element.querySelector('.ink-toolbar');
		expect(toolbar?.querySelector('[data-tool="eraser"]')).not.toBeNull();
		expect(toolbar?.querySelector('[data-action="undo"]')).not.toBeNull();
		expect(toolbar?.querySelector('[data-action="redo"]')).not.toBeNull();
	});

	it('Undo/Redo carry disabled when unavailable, and enable once history exists', () => {
		const session = new EditingSession(freshDrawing());
		const overlay = openOverlay(makeDeps({ session }));
		const undo = overlay.element.querySelector('[data-action="undo"]') as HTMLButtonElement;
		const redo = overlay.element.querySelector('[data-action="redo"]') as HTMLButtonElement;
		expect(undo.disabled).toBe(true);
		expect(redo.disabled).toBe(true);

		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		expect(undo.disabled).toBe(false);
		expect(redo.disabled).toBe(true);

		undo.click();
		expect(undo.disabled).toBe(true);
		expect(redo.disabled).toBe(false);
	});

	it('tapping Eraser moves is-active to it', () => {
		const overlay = openOverlay(makeDeps());
		const pen = overlay.element.querySelector('[data-tool="pen"]') as HTMLElement;
		const eraser = overlay.element.querySelector('[data-tool="eraser"]') as HTMLElement;
		expect(pen.classList.contains('is-active')).toBe(true);
		expect(eraser.classList.contains('is-active')).toBe(false);

		eraser.click();
		expect(eraser.classList.contains('is-active')).toBe(true);
		expect(pen.classList.contains('is-active')).toBe(false);
	});

	it('erasing with the pen removes a hit stroke and redraws', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 0, pressure: 0.5 },
		]);
		const deps = makeDeps({ session });
		const overlay = openOverlay(deps);
		const eraser = overlay.element.querySelector('[data-tool="eraser"]') as HTMLElement;
		eraser.click();

		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;
		const down = new PointerEvent('pointerdown', {
			pointerType: 'pen',
			buttons: 1,
			clientX: 5,
			clientY: 0,
		});
		surface.dispatchEvent(down);
		const up = new PointerEvent('pointerup', { pointerType: 'pen', buttons: 0 });
		surface.dispatchEvent(up);

		expect(session.drawing.strokes.length).toBe(0);
	});

	it('an Escape keydown closes via flush', async () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		const deps = makeDeps({ session });
		const overlay = openOverlay(deps);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await Promise.resolve();
		await Promise.resolve();

		expect(deps.flush).toHaveBeenCalledTimes(1);
		expect(document.body.contains(overlay.element)).toBe(false);
	});

	it('a visibilitychange to hidden flushes but leaves the overlay open', async () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		const deps = makeDeps({ session });
		const overlay = openOverlay(deps);

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden',
		});
		document.dispatchEvent(new Event('visibilitychange'));
		await Promise.resolve();
		await Promise.resolve();

		expect(deps.flush).toHaveBeenCalledTimes(1);
		expect(document.body.contains(overlay.element)).toBe(true);

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'visible',
		});
	});

	it("close({ reason: 'unload' }) flushes before removing the overlay", async () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		const deps = makeDeps({ session });
		const overlay = openOverlay(deps);

		await overlay.close({ reason: 'unload' });

		expect(deps.flush).toHaveBeenCalledTimes(1);
		expect(document.body.contains(overlay.element)).toBe(false);
	});

	it('a session change calls the injected schedule(line)', () => {
		const session = new EditingSession(freshDrawing());
		const deps = makeDeps({ session });
		const overlay = openOverlay(deps);
		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;

		const down = new PointerEvent('pointerdown', {
			pointerType: 'pen',
			buttons: 1,
			clientX: 5,
			clientY: 5,
		});
		surface.dispatchEvent(down);
		const up = new PointerEvent('pointerup', { pointerType: 'pen', buttons: 0 });
		surface.dispatchEvent(up);

		expect(deps.schedule).toHaveBeenCalledWith(session.currentLine());
	});

	// Regression: main.ts used to track "is the overlay open" by wrapping
	// handle.close from the outside, but the toolbar's own Done/Escape
	// handlers call the closure they captured internally, not that wrapped
	// property — so the external reset never ran and every later tap to
	// reopen silently no-opped until the app was restarted. openOverlay must
	// call the one injected onClosed hook itself, on every path that closes.
	it('calls the injected onClosed exactly once when Done closes the overlay', async () => {
		const onClosed = vi.fn();
		const deps = makeDeps({ onClosed });
		const overlay = openOverlay(deps);
		const done = overlay.element.querySelector('[data-action="done"]') as HTMLElement;
		done.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it('calls the injected onClosed when the returned close() is invoked directly (the onunload path)', async () => {
		const onClosed = vi.fn();
		const deps = makeDeps({ onClosed });
		const overlay = openOverlay(deps);

		await overlay.close({ reason: 'unload' });

		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it('does not call onClosed on a visibilitychange flush, since the overlay stays open', async () => {
		const onClosed = vi.fn();
		const deps = makeDeps({ onClosed });
		openOverlay(deps);

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden',
		});
		document.dispatchEvent(new Event('visibilitychange'));
		await Promise.resolve();
		await Promise.resolve();

		expect(onClosed).not.toHaveBeenCalled();

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'visible',
		});
	});

	it('has a div.ink-resize-handle outside the canvases (a sibling within the surface)', () => {
		const overlay = openOverlay(makeDeps());
		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;
		const handle = surface.querySelector('.ink-resize-handle');
		expect(handle).not.toBeNull();
		expect(handle?.tagName).not.toBe('CANVAS');
	});

	it('a pen pointerdown on the resize handle never starts a stroke', () => {
		const session = new EditingSession(freshDrawing());
		const overlay = openOverlay(makeDeps({ session }));
		const handle = overlay.element.querySelector('.ink-resize-handle') as HTMLElement;

		handle.dispatchEvent(
			new PointerEvent('pointerdown', { pointerType: 'pen', buttons: 1, clientX: 0, clientY: 0 }),
		);
		handle.dispatchEvent(
			new PointerEvent('pointermove', { pointerType: 'pen', buttons: 1, clientX: 50, clientY: 50 }),
		);
		handle.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', buttons: 0 }));

		expect(session.drawing.strokes.length).toBe(0);
	});

	it('dragging the handle calls session.resize once, on release, clamped to the available bounds', () => {
		const session = new EditingSession(freshDrawing());
		const resizeSpy = vi.spyOn(session, 'resize');
		const overlay = openOverlay(makeDeps({ session }));
		const handle = overlay.element.querySelector('.ink-resize-handle') as HTMLElement;

		handle.dispatchEvent(
			new PointerEvent('pointerdown', { pointerType: 'pen', buttons: 1, clientX: 0, clientY: 0 }),
		);
		handle.dispatchEvent(
			new PointerEvent('pointermove', { pointerType: 'pen', buttons: 1, clientX: 100, clientY: 50 }),
		);
		expect(resizeSpy).not.toHaveBeenCalled();

		handle.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', buttons: 0 }));

		expect(resizeSpy).toHaveBeenCalledTimes(1);
		// 700+100 x 260+50, within the 800x600 available bound from makeDeps
		expect(session.drawing.width).toBe(800);
		expect(session.drawing.height).toBe(310);
	});

	it('a window resize event recomputes the fit scale without changing the drawing', () => {
		const session = new EditingSession(freshDrawing());
		let call = 0;
		const getAvailable = vi.fn(() => {
			call += 1;
			return call === 1 ? { width: 800, height: 600 } : { width: 400, height: 300 };
		});
		const overlay = openOverlay(makeDeps({ session, getAvailable }));
		const surface = overlay.element.querySelector('.ink-surface') as HTMLElement;

		window.dispatchEvent(new Event('resize'));

		expect(getAvailable.mock.calls.length).toBeGreaterThanOrEqual(2);
		const expectedScale = Math.min(400 / 700, 300 / 260);
		expect(surface.style.width).toBe(`${700 * expectedScale}px`);
		expect(session.drawing.width).toBe(700);
		expect(session.drawing.height).toBe(260);
	});
});
