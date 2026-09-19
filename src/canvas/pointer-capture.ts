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

	// WebKit does not let CSS distinguish pointer type (research.md R1's
	// "Alternatives considered"), and preventDefault() on pointerdown alone
	// has not reliably cancelled a touch-action-driven pan in this project's
	// own on-device testing (CLAUDE.md "Touch defaults"): the compositor can
	// commit to panning before that preventDefault() is seen to matter.
	// Toggling touch-action off only for the duration of a stylus contact —
	// detected via WebKit's non-standard Touch.touchType — keeps finger
	// scrolling completely unaffected in between strokes.
	function isStylusTouch(e: TouchEvent): boolean {
		return Array.from(e.touches).some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus');
	}

	function handleTouchStart(e: TouchEvent): void {
		if (!isStylusTouch(e)) return;
		root.style.touchAction = 'none';
		e.preventDefault();
	}

	function restoreTouchAction(): void {
		root.style.touchAction = '';
	}

	const touchStartOpts: AddEventListenerOptions = { capture: true, passive: false };
	root.addEventListener('touchstart', handleTouchStart, touchStartOpts);
	root.addEventListener('touchend', restoreTouchAction, { capture: true });
	root.addEventListener('touchcancel', restoreTouchAction, { capture: true });

	return () => {
		root.removeEventListener('pointerdown', handle, opts);
		root.removeEventListener('pointermove', handle, opts);
		root.removeEventListener('pointerup', handle, opts);
		root.removeEventListener('pointercancel', handle, opts);
		root.removeEventListener('touchstart', handleTouchStart, touchStartOpts);
		root.removeEventListener('touchend', restoreTouchAction, { capture: true });
		root.removeEventListener('touchcancel', restoreTouchAction, { capture: true });
		restoreTouchAction();
	};
}
