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
		dpr: 2,
		available: { width: 800, height: 600 },
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
});
