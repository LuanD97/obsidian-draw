// Runs for every test file (Node or happy-dom). happy-dom has no 2D canvas
// context and no Path2D, and may be missing PointerEvent/TouchEvent, so this
// fills those gaps when a `window` exists. It is a no-op under the plain
// Node environment (no `window`).

export interface RecordedCall {
	op: string;
	args: unknown[];
}

export class RecordingPath2D {
	calls: RecordedCall[] = [];
	addPath(): void {
		this.calls.push({ op: 'addPath', args: [] });
	}
}

class RecordingContext2D {
	fillStyle = '#000000';
	strokeStyle = '#000000';
	calls: RecordedCall[] = [];
	fill(..._args: unknown[]): void {
		this.calls.push({ op: 'fill', args: _args });
	}
	clearRect(...args: unknown[]): void {
		this.calls.push({ op: 'clearRect', args });
	}
	beginPath(): void {
		this.calls.push({ op: 'beginPath', args: [] });
	}
	save(): void {
		this.calls.push({ op: 'save', args: [] });
	}
	restore(): void {
		this.calls.push({ op: 'restore', args: [] });
	}
	scale(...args: unknown[]): void {
		this.calls.push({ op: 'scale', args });
	}
	translate(...args: unknown[]): void {
		this.calls.push({ op: 'translate', args });
	}
}

if (typeof window !== 'undefined') {
	const w = window as unknown as {
		HTMLCanvasElement?: { prototype: Record<string, unknown> };
		Path2D?: unknown;
		PointerEvent?: unknown;
		TouchEvent?: unknown;
		MouseEvent: new (type: string, init?: MouseEventInit) => MouseEvent;
		UIEvent: new (type: string, init?: UIEventInit) => UIEvent;
	};

	if (w.HTMLCanvasElement) {
		// happy-dom's own getContext('2d') returns null unless a native canvas
		// adapter (e.g. node-canvas) is installed, so it is always replaced
		// with a recording stub regardless of whether the method exists.
		w.HTMLCanvasElement.prototype.getContext = function getContext(
			this: HTMLCanvasElement,
			kind: string,
		) {
			if (kind !== '2d') return null;
			const existing = (this as unknown as { __ctx?: RecordingContext2D }).__ctx;
			if (existing) return existing;
			const ctx = new RecordingContext2D();
			(this as unknown as { __ctx?: RecordingContext2D }).__ctx = ctx;
			return ctx;
		};
	}

	if (!w.Path2D) {
		w.Path2D = RecordingPath2D;
	}

	if (!w.PointerEvent) {
		class PointerEventPolyfill extends w.MouseEvent {
			pointerId: number;
			pointerType: string;
			pressure: number;
			constructor(type: string, init: PointerEventInit = {}) {
				super(type, init);
				this.pointerId = init.pointerId ?? 0;
				this.pointerType = init.pointerType ?? '';
				this.pressure = init.pressure ?? 0;
			}
			getCoalescedEvents(): PointerEvent[] {
				return [this as unknown as PointerEvent];
			}
		}
		w.PointerEvent = PointerEventPolyfill;
	}

	if (!w.TouchEvent) {
		class TouchEventPolyfill extends w.UIEvent {
			touches: unknown[];
			changedTouches: unknown[];
			constructor(type: string, init: { touches?: unknown[]; changedTouches?: unknown[] } = {}) {
				super(type, init as UIEventInit);
				this.touches = init.touches ?? [];
				this.changedTouches = init.changedTouches ?? [];
			}
		}
		w.TouchEvent = TouchEventPolyfill;
	}
}
