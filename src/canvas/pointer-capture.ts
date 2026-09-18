import { classifyPointer } from '../editor/input-filter';

export interface PointerCaptureHandlers {
	onPenStart: (e: PointerEvent, local: { x: number; y: number }) => void;
	onPenMove: (e: PointerEvent, local: { x: number; y: number }) => void;
	onPenEnd: (e: PointerEvent) => void;
}

// Filter/dispatch logic only: a capturing-phase pointerdown/move/up listener
// attached over `root` (glue attaches it to the real .cm-scroller with
// { capture: true, passive: false } — research.md R1) that lets every
// non-pen event continue unmodified so touch/mouse scrolling, selection and
// cursor placement behave exactly as before Canvas Mode existed.
export function attachPointerCapture(root: HTMLElement, handlers: PointerCaptureHandlers): () => void {
	function localPoint(e: PointerEvent): { x: number; y: number } {
		const rect = root.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function handle(e: PointerEvent): void {
		const action = classifyPointer({ type: e.type, pointerType: e.pointerType, buttons: e.buttons });
		if (action === 'ignore') return;

		e.preventDefault();

		if (action === 'end') {
			handlers.onPenEnd(e);
			return;
		}

		const local = localPoint(e);
		if (e.type === 'pointerdown') {
			handlers.onPenStart(e, local);
		} else {
			handlers.onPenMove(e, local);
		}
	}

	const opts: AddEventListenerOptions = { capture: true, passive: false };
	root.addEventListener('pointerdown', handle, opts);
	root.addEventListener('pointermove', handle, opts);
	root.addEventListener('pointerup', handle, opts);
	root.addEventListener('pointercancel', handle, opts);

	return () => {
		root.removeEventListener('pointerdown', handle, opts);
		root.removeEventListener('pointermove', handle, opts);
		root.removeEventListener('pointerup', handle, opts);
		root.removeEventListener('pointercancel', handle, opts);
	};
}
