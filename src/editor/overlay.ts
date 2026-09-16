import { CanvasLayers } from './canvas-layers';
import { classifyPointer } from './input-filter';
import { toCanvasPoint } from './geometry';
import { fitScale } from '../model/canvas-size';
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
	available: Size;
}

export interface CloseOptions {
	reason?: 'unload' | 'done';
}

export interface OverlayHandle {
	element: HTMLElement;
	close(opts?: CloseOptions): Promise<void>;
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
	const { doc, parent, session, flush, getStrokeColor, onThemeChange, schedule, onClosed, dpr, available } =
		deps;

	const overlay = doc.createElement('div');
	overlay.className = 'ink-overlay';

	const toolbar = doc.createElement('div');
	toolbar.className = 'ink-toolbar';

	const penButton = doc.createElement('button');
	penButton.dataset.tool = 'pen';
	penButton.classList.add('is-active');
	penButton.textContent = 'Pen';
	toolbar.appendChild(penButton);

	const eraserButton = doc.createElement('button');
	eraserButton.dataset.tool = 'eraser';
	eraserButton.textContent = 'Eraser';
	toolbar.appendChild(eraserButton);

	const undoButton = doc.createElement('button');
	undoButton.dataset.action = 'undo';
	undoButton.textContent = 'Undo';
	toolbar.appendChild(undoButton);

	const redoButton = doc.createElement('button');
	redoButton.dataset.action = 'redo';
	redoButton.textContent = 'Redo';
	toolbar.appendChild(redoButton);

	const doneButton = doc.createElement('button');
	doneButton.dataset.action = 'done';
	doneButton.textContent = 'Done';
	toolbar.appendChild(doneButton);

	overlay.appendChild(toolbar);

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
	overlay.appendChild(surface);

	const size: Size = { width: session.drawing.width, height: session.drawing.height };
	const scale = fitScale(size, available);
	surface.style.width = `${size.width * scale}px`;
	surface.style.height = `${size.height * scale}px`;
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

	const layers = new CanvasLayers(doc, surface, size, dpr);
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

	onThemeChange(() => {
		redrawStatic();
	});

	session.onChange = () => {
		redrawStatic();
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

	async function close(_opts: CloseOptions = {}): Promise<void> {
		if (session.dirty) {
			await flush();
		}
		doc.removeEventListener('keydown', onKeydown);
		doc.removeEventListener('visibilitychange', onVisibilityChange);
		layers.free();
		overlay.remove();
		onClosed();
	}

	doneButton.addEventListener('click', () => {
		void close({ reason: 'done' });
	});

	return { element: overlay, close };
}
