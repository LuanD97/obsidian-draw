import { CanvasLayers } from './canvas-layers';
import { classifyPointer } from './input-filter';
import { toCanvasPoint } from './geometry';
import { fitScale, clampSize, resizeBounds } from '../model/canvas-size';
import type { EditingSession } from './session';
import type { SaveOutcome } from './save-queue';
import type { RawPoint, Size, Stroke } from '../model/types';

export interface OpenOverlayDeps {
	doc: Document;
	parent: HTMLElement;
	session: EditingSession;
	flush: () => Promise<SaveOutcome | null>;
	getStrokeColor: () => string;
	onThemeChange: (handler: () => void) => void;
	schedule: (line: string) => void;
	// Called on every path that actually closes the overlay (Done, Escape, a
	// direct close() call), never on a visibilitychange flush. This is the
	// one place "the overlay is closed" gets decided, so callers that track
	// an "is open" flag (main.ts) must react to this instead of wrapping the
	// returned close() themselves: the toolbar's own button handlers call
	// their closure-captured close directly, not a re-assigned property, so
	// an external wrapper around the returned handle is never actually run.
	onClosed: () => void;
	dpr: number;
	// A function, not a value: re-read on every window 'resize' (rotation,
	// split view) so the fit can be recomputed against the current viewport,
	// not just the one at open time.
	getAvailable: () => Size;
}

export interface CloseOptions {
	reason?: 'unload' | 'done';
}

export interface OverlayHandle {
	element: HTMLElement;
	close(opts?: CloseOptions): Promise<void>;
}

// Icon-only buttons, to leave more of the panel to the canvas: a simple,
// hand-drawn 24x24 stroke icon per action, with an aria-label (and title,
// for a mouse-hover tooltip) carrying the name no longer shown as text.
const ICONS: Record<string, string> = {
	pen: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/><path d="M14 7l3 3"/>',
	eraser:
		'<path d="M18 13l-7 7H6l-3-3a2 2 0 0 1 0-3l10-10a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3z"/><path d="M8 20h9"/>',
	undo: '<path d="M4 10h10a5 5 0 0 1 0 10H9"/><path d="M4 10l5-5"/><path d="M4 10l5 5"/>',
	redo: '<path d="M20 10H10a5 5 0 0 0 0 10h5"/><path d="M20 10l-5-5"/><path d="M20 10l-5 5"/>',
	done: '<path d="M5 13l4 4L19 7"/>',
};

function iconButton(doc: Document, name: keyof typeof ICONS, label: string): HTMLButtonElement {
	const button = doc.createElement('button');
	button.setAttribute('aria-label', label);
	button.title = label;
	button.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
	return button;
}

function toPreviewStroke(raw: RawPoint[]): Stroke {
	return {
		points: raw.map((pt) => ({
			x: pt.x,
			y: pt.y,
			p: Math.min(255, Math.max(0, Math.round(pt.pressure * 255))),
		})),
	};
}

export function openOverlay(deps: OpenOverlayDeps): OverlayHandle {
	const { doc, parent, session, flush, getStrokeColor, onThemeChange, schedule, onClosed, dpr, getAvailable } =
		deps;

	// overlay is a fixed, full-viewport scrim so it can stay attached to
	// document.body and center its content - that's what keeps it outside
	// the note's editable DOM (the actual safety property from research R13/
	// CLAUDE.md's iPad pitfalls). panel is the visible card, sized to its
	// content (roughly the drawing plus chrome) rather than the viewport, so
	// the rest of the note stays visible around it.
	const overlay = doc.createElement('div');
	overlay.className = 'ink-overlay';

	const panel = doc.createElement('div');
	panel.className = 'ink-panel';
	overlay.appendChild(panel);

	const toolbar = doc.createElement('div');
	toolbar.className = 'ink-toolbar';

	const penButton = iconButton(doc, 'pen', 'Pen');
	penButton.dataset.tool = 'pen';
	penButton.classList.add('is-active');
	toolbar.appendChild(penButton);

	const eraserButton = iconButton(doc, 'eraser', 'Eraser');
	eraserButton.dataset.tool = 'eraser';
	toolbar.appendChild(eraserButton);

	const undoButton = iconButton(doc, 'undo', 'Undo');
	undoButton.dataset.action = 'undo';
	toolbar.appendChild(undoButton);

	const redoButton = iconButton(doc, 'redo', 'Redo');
	redoButton.dataset.action = 'redo';
	toolbar.appendChild(redoButton);

	const doneButton = iconButton(doc, 'done', 'Done');
	doneButton.dataset.action = 'done';
	toolbar.appendChild(doneButton);

	panel.appendChild(toolbar);

	function setActiveTool(tool: 'pen' | 'eraser'): void {
		penButton.classList.toggle('is-active', tool === 'pen');
		eraserButton.classList.toggle('is-active', tool === 'eraser');
	}

	function updateHistoryButtons(): void {
		undoButton.disabled = !session.canUndo();
		redoButton.disabled = !session.canRedo();
	}

	penButton.addEventListener('click', () => {
		session.setTool('pen');
		setActiveTool('pen');
	});
	eraserButton.addEventListener('click', () => {
		session.setTool('eraser');
		setActiveTool('eraser');
	});
	undoButton.addEventListener('click', () => {
		session.undo();
	});
	redoButton.addEventListener('click', () => {
		session.redo();
	});

	const surface = doc.createElement('div');
	surface.className = 'ink-surface';
	panel.appendChild(surface);

	function currentSize(): Size {
		return { width: session.drawing.width, height: session.drawing.height };
	}

	let scale = fitScale(currentSize(), getAvailable());
	surface.style.width = `${currentSize().width * scale}px`;
	surface.style.height = `${currentSize().height * scale}px`;
	surface.style.position = 'relative';
	surface.style.setProperty('touch-action', 'none');
	// Applied last, and via the attribute rather than further style.*
	// assignments: some CSSOM implementations only track recognised
	// property names and re-serialise the style attribute from that model
	// on every .style mutation, which would silently drop these two.
	surface.setAttribute(
		'style',
		`${surface.getAttribute('style') ?? ''}-webkit-user-select: none; -webkit-touch-callout: none;`,
	);

	const layers = new CanvasLayers(doc, surface, currentSize(), dpr);
	layers.static.classList.add('ink-static');
	layers.live.classList.add('ink-live');

	surface.addEventListener(
		'touchstart',
		(e) => {
			e.preventDefault();
		},
		{ passive: false },
	);

	function redrawStatic(): void {
		layers.redrawStatic(session.drawing.strokes, getStrokeColor());
	}

	function clearLive(): void {
		const ctx = layers.live.getContext('2d');
		ctx?.clearRect(0, 0, layers.live.width, layers.live.height);
	}

	// Re-fits the surface to the current drawing size (its own, after a
	// resize commit/undo/redo, or the viewport's, after a window resize),
	// resizes the canvas backing stores to match (which clears them) and
	// redraws. Also run after every non-resize change (add/erase/undo/redo):
	// the size is then unchanged, so this is a cheap no-op resize plus a
	// redraw, avoiding a separate "did the size actually change" branch.
	function applySurfaceSize(): void {
		const size = currentSize();
		scale = fitScale(size, getAvailable());
		surface.style.width = `${size.width * scale}px`;
		surface.style.height = `${size.height * scale}px`;
		layers.resize(size);
		redrawStatic();
	}

	let drawing = false;
	let currentRaw: RawPoint[] = [];

	function surfaceRect(): { left: number; top: number } {
		const rect = surface.getBoundingClientRect();
		return { left: rect.left, top: rect.top };
	}

	function handlePointer(e: PointerEvent): void {
		const action = classifyPointer({ type: e.type, pointerType: e.pointerType, buttons: e.buttons });
		if (action === 'ignore') return;

		if (action === 'end') {
			if (drawing) {
				if (session.tool === 'eraser') {
					session.endErase();
				} else if (currentRaw.length > 0) {
					session.addStroke(currentRaw);
				}
			}
			drawing = false;
			currentRaw = [];
			clearLive();
			return;
		}

		const isContactStart = !drawing;
		drawing = true;
		// getCoalescedEvents() only ever returns entries for genuinely
		// hardware-coalesced pointermove events; it is an empty array for
		// pointerdown/pointerup and for any event the platform didn't batch
		// (including every synthetic event in tests), so fall back to the
		// event itself whenever the list is empty.
		const coalesced: PointerEvent[] =
			typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
		const events: PointerEvent[] = coalesced.length > 0 ? coalesced : [e];
		const rect = surfaceRect();

		if (session.tool === 'eraser') {
			if (isContactStart) session.beginErase();
			for (const ev of events) {
				session.eraseAt(toCanvasPoint({ x: ev.clientX, y: ev.clientY }, rect, scale));
			}
			return;
		}

		for (const ev of events) {
			const canvasPt = toCanvasPoint({ x: ev.clientX, y: ev.clientY }, rect, scale);
			currentRaw.push({ x: canvasPt.x, y: canvasPt.y, pressure: ev.pressure });
		}
		layers.drawLive(toPreviewStroke(currentRaw), getStrokeColor());
	}

	surface.addEventListener('pointerdown', handlePointer);
	surface.addEventListener('pointermove', handlePointer);
	surface.addEventListener('pointerup', handlePointer);
	surface.addEventListener('pointercancel', handlePointer);

	// Outside the two canvases (a plain sibling div, not part of either
	// backing store), positioned at the surface's bottom-right corner.
	// Handles its own pointer events and stops them from reaching the
	// surface's draw/erase handler above, so dragging it never starts a
	// stroke. Accepts finger or pen (no classifyPointer filtering), unlike
	// drawing, which is pen-only.
	const resizeHandle = doc.createElement('div');
	resizeHandle.className = 'ink-resize-handle';
	surface.appendChild(resizeHandle);

	let isResizing = false;
	let resizeStartClient = { x: 0, y: 0 };
	let resizeStartSize: Size = currentSize();
	let resizeWant: Size = currentSize();

	function handleResizePointer(e: PointerEvent): void {
		e.stopPropagation();

		if (e.type === 'pointerdown') {
			e.preventDefault();
			isResizing = true;
			resizeStartClient = { x: e.clientX, y: e.clientY };
			resizeStartSize = currentSize();
			resizeWant = resizeStartSize;
			return;
		}
		if (!isResizing) return;

		if (e.type === 'pointermove') {
			const dx = (e.clientX - resizeStartClient.x) / scale;
			const dy = (e.clientY - resizeStartClient.y) / scale;
			const bounds = resizeBounds(resizeStartSize, session.drawing.strokes, getAvailable());
			resizeWant = clampSize(
				{ width: resizeStartSize.width + dx, height: resizeStartSize.height + dy },
				bounds.min,
				bounds.max,
			);
			// Live preview only: stretches the existing canvas pixels to the
			// dragged box. The canvases are properly resized and redrawn once
			// the drag commits, in session.resize's onChange -> applySurfaceSize.
			surface.style.width = `${resizeWant.width * scale}px`;
			surface.style.height = `${resizeWant.height * scale}px`;
			return;
		}

		// pointerup or pointercancel: commit once, on release.
		isResizing = false;
		const bounds = resizeBounds(resizeStartSize, session.drawing.strokes, getAvailable());
		session.resize(resizeWant, bounds.max);
	}

	resizeHandle.addEventListener('pointerdown', handleResizePointer);
	resizeHandle.addEventListener('pointermove', handleResizePointer);
	resizeHandle.addEventListener('pointerup', handleResizePointer);
	resizeHandle.addEventListener('pointercancel', handleResizePointer);

	onThemeChange(() => {
		redrawStatic();
	});

	session.onChange = () => {
		applySurfaceSize();
		updateHistoryButtons();
		schedule(session.currentLine());
	};

	redrawStatic();
	updateHistoryButtons();

	parent.appendChild(overlay);

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			void close();
		}
	}
	doc.addEventListener('keydown', onKeydown);

	function onVisibilityChange(): void {
		if (doc.visibilityState === 'hidden') {
			void flush();
		}
	}
	doc.addEventListener('visibilitychange', onVisibilityChange);

	// Rotation/split-view: re-fit against the current viewport without
	// touching the stored drawing size.
	function onWindowResize(): void {
		applySurfaceSize();
	}
	window.addEventListener('resize', onWindowResize);

	async function close(_opts: CloseOptions = {}): Promise<void> {
		if (session.dirty) {
			await flush();
		}
		doc.removeEventListener('keydown', onKeydown);
		doc.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('resize', onWindowResize);
		layers.free();
		overlay.remove();
		onClosed();
	}

	doneButton.addEventListener('click', () => {
		void close({ reason: 'done' });
	});

	// Tapping the dim scrim outside the panel closes like Done (flush, then
	// close): e.target === overlay only when the tap landed on the scrim
	// itself, not when a click on a descendant (toolbar button, surface,
	// panel background) bubbles up here.
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) {
			void close();
		}
	});

	return { element: overlay, close };
}
