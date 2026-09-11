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
	dpr: number;
	available: Size;
}

export interface OverlayHandle {
	element: HTMLElement;
	close(): Promise<void>;
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
	const { doc, parent, session, flush, getStrokeColor, onThemeChange, dpr, available } = deps;

	const overlay = doc.createElement('div');
	overlay.className = 'ink-overlay';

	const toolbar = doc.createElement('div');
	toolbar.className = 'ink-toolbar';

	const penButton = doc.createElement('button');
	penButton.dataset.tool = 'pen';
	penButton.classList.add('is-active');
	penButton.textContent = 'Pen';
	toolbar.appendChild(penButton);

	const doneButton = doc.createElement('button');
	doneButton.dataset.action = 'done';
	doneButton.textContent = 'Done';
	toolbar.appendChild(doneButton);

	overlay.appendChild(toolbar);

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
			if (drawing && currentRaw.length > 0) {
				session.addStroke(currentRaw);
				redrawStatic();
			}
			drawing = false;
			currentRaw = [];
			clearLive();
			return;
		}

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

	redrawStatic();

	parent.appendChild(overlay);

	async function close(): Promise<void> {
		if (session.dirty) {
			await flush();
		}
		layers.free();
		overlay.remove();
	}

	doneButton.addEventListener('click', () => {
		void close();
	});

	return { element: overlay, close };
}
