import type { EditorView } from '@codemirror/view';
import { listAnnotationBlocks } from './scan';
import { parseAnnotationLine, formatAnnotationLine } from './annotation-line';
import { findInsertionPoint } from './insert';
import { CanvasModeNoteState } from './session';
import { attachPointerCapture } from './pointer-capture';
import { toOverlayPoint } from './layout';
import { strokeOutlinePath } from '../render/outline';
import { strokesBoundingBox, boxesIntersect, type BoundingBox } from '../model/erase';
import { saveDirtyAnnotations, type DirtyAnnotationSave, type ProcessingVault, type TFileLike } from './save';
import type { SaveOutcome } from '../editor/save-queue';
import { SaveQueue } from '../editor/save-queue';
import type { RawPoint, Stroke } from '../model/types';

export interface CanvasModeSessionDeps {
	view: EditorView;
	file: TFileLike;
	vault: ProcessingVault;
	getStrokeColor: () => string;
	dpr: number;
}

interface StaticAnnotation {
	// Character offset of this annotation's (hidden) block in the current
	// doc text.
	anchorOffset: number;
	strokes: Stroke[]; // anchor-relative, exactly as stored on disk
	// A *hint* for whether this annotation could be near the viewport, from
	// the anchor as last resolved in loadStatic() (construction, a doc edit,
	// or a geometryChanged event — see live-plugin.ts). Deliberately not
	// used as the draw position itself (research.md R15): CM6 can revise a
	// not-yet-fully-measured position's real coordinates *between*
	// geometryChanged events while scrolling through long content, so a
	// cached anchor can go briefly stale in exactly the way that reads as
	// on-screen ink "distorting." redraw() re-resolves the real anchor fresh
	// for anything this hint says might be visible, and skips the (much more
	// numerous, in a long note) rest without paying for a coordsAtPos call —
	// keeping both correctness and the R12/R13 perf fix.
	approxBBox: BoundingBox | null;
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

// Glue (constitution v1.1.0): the live Canvas Mode surface for one open note.
// Owns the overlay DOM, the pointer capture, the in-session annotation state,
// and the debounced save queue. Not unit-tested (CM6 EditorView + real DOM
// rendering + Pencil input cannot be faithfully exercised headless); covered
// by the manual iPad checklist (quickstart.md). Every data-handling decision
// it makes (new-vs-existing annotation, save outcome handling) delegates to
// already-tested pure modules.
export class CanvasModeSession {
	private readonly overlayEl: HTMLElement;
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly detachPointer: () => void;
	private readonly detachScroll: () => void;
	private readonly state = new CanvasModeNoteState();
	private readonly queue: SaveQueue;

	// ids the file already has this annotation's block for (so a later save
	// is an update-by-id, not another insert).
	private readonly knownIds = new Set<string>();
	// per not-yet-saved new id, the findInsertionPoint offset its first save
	// will insert at (and the offset its strokes are stored relative to).
	private readonly newAnchorOffset = new Map<string, number>();

	private staticAnnotations: StaticAnnotation[] = [];
	private drawing = false;
	private currentRaw: RawPoint[] = [];
	private scale = 1;
	// requestAnimationFrame handle for a pending live-stroke repaint, so a
	// burst of coalesced pointermove events between frames collapses into
	// one canvas repaint instead of one per event (the other major
	// contributor to on-device input lag, alongside per-annotation
	// coordsAtPos above).
	private redrawFrame: number | null = null;

	constructor(private readonly deps: CanvasModeSessionDeps) {
		const { view } = deps;
		const doc = view.dom.ownerDocument;

		this.overlayEl = doc.createElement('div');
		this.overlayEl.className = 'canvas-mode-overlay';
		// Appended to view.dom (the outer, non-scrolling `.cm-editor` root —
		// documented public CM6 API, sized to the editor's visible viewport,
		// not the scrollable document), not to scrollDOM: sizing the overlay
		// to the *whole note* (research.md R2's original design) meant every
		// redraw cleared/repainted a canvas whose area grew with the note's
		// length, which is exactly what made input lag scale with note
		// length on-device, and meant the overlay's own JS-measured size
		// could drift from CM6's own (separately, continuously re-estimated
		// while scrolling) scrollable height — both fixed by not needing to
		// track the document's total height at all (research.md R13).
		view.dom.appendChild(this.overlayEl);

		this.canvas = doc.createElement('canvas');
		this.canvas.className = 'canvas-mode-surface';
		this.overlayEl.appendChild(this.canvas);
		this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

		this.queue = new SaveQueue(() => this.flushDirty(), { debounceMs: 500, onOutcome: () => {} });

		this.loadStatic();
		this.resizeAndRedraw();

		this.detachPointer = attachPointerCapture(view.scrollDOM, {
			onPenStart: (e, local) => this.onPenStart(e, local),
			onPenMove: (e, local) => this.onPenMove(e, local),
			onPenEnd: () => this.onPenEnd(),
		});

		// The overlay no longer scrolls with the note (it's anchored to the
		// stable editor viewport), so a plain scroll needs to trigger a
		// repaint to keep already-painted ink glued to its paragraph —
		// scheduleRedraw's rAF throttle keeps this cheap during a fast/native
		// scroll gesture.
		const onScroll = (): void => this.scheduleRedraw();
		view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
		this.detachScroll = () => view.scrollDOM.removeEventListener('scroll', onScroll);
	}

	// Called by the wiring ViewPlugin (glue) whenever this view's document OR
	// its layout changed (ViewUpdate.geometryChanged — a real edit, a resize,
	// or CM6 correcting a height estimate while scrolling), so annotations
	// reflow with their paragraphs (research.md R3) and re-resolve their
	// anchors before the next redraw uses them.
	onLayoutChanged(): void {
		this.loadStatic();
		this.resizeAndRedraw();
	}

	async destroy(): Promise<void> {
		this.detachPointer();
		this.detachScroll();
		if (this.redrawFrame !== null) {
			cancelAnimationFrame(this.redrawFrame);
			this.redrawFrame = null;
		}
		await this.queue.flush();
		this.canvas.width = 0;
		this.canvas.height = 0;
		this.overlayEl.remove();
	}

	private loadStatic(): void {
		const text = this.deps.view.state.doc.toString();
		const loaded: StaticAnnotation[] = [];
		for (const ref of listAnnotationBlocks(text)) {
			// Annotations created (and already saved) this session are drawn
			// from the live session state instead, in absolute overlay space —
			// skip them here to avoid drawing them twice.
			if (this.state.annotations.has(ref.id)) continue;
			try {
				const annotation = parseAnnotationLine(text.slice(ref.payloadStart, ref.payloadEnd));
				const anchor = this.resolveAnchorPoint(ref.blockStart);
				const localBox = strokesBoundingBox(annotation.strokes);
				const approxBBox =
					anchor && localBox
						? {
								minX: localBox.minX + anchor.x,
								minY: localBox.minY + anchor.y,
								maxX: localBox.maxX + anchor.x,
								maxY: localBox.maxY + anchor.y,
							}
						: null;
				loaded.push({ anchorOffset: ref.blockStart, strokes: annotation.strokes, approxBBox });
			} catch {
				// malformed/unsupported-version: never rendered, never rewritten (FR-010).
			}
		}
		this.staticAnnotations = loaded;
	}

	// Sized to the editor's own visible box (view.dom), not the scrollable
	// document — see the constructor's note and research.md R13. This keeps
	// canvas pixel area, and therefore clear/repaint cost, bounded by the
	// viewport regardless of how long the note is.
	private resizeAndRedraw(): void {
		const width = this.deps.view.dom.clientWidth;
		const height = this.deps.view.dom.clientHeight;
		this.overlayEl.style.width = `${width}px`;
		this.overlayEl.style.height = `${height}px`;

		this.scale = Math.min(this.deps.dpr, 2);
		const w = Math.round(width * this.scale);
		const h = Math.round(height * this.scale);
		if (this.canvas.width !== w) this.canvas.width = w;
		if (this.canvas.height !== h) this.canvas.height = h;
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;

		this.redraw();
	}

	private visibleBox(): BoundingBox {
		const scroller = this.deps.view.scrollDOM;
		return {
			minX: scroller.scrollLeft,
			minY: scroller.scrollTop,
			maxX: scroller.scrollLeft + scroller.clientWidth,
			maxY: scroller.scrollTop + scroller.clientHeight,
		};
	}

	private redraw(): void {
		const ctx = this.ctx;
		const scroller = this.deps.view.scrollDOM;
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.save();
		ctx.scale(this.scale, this.scale);
		// Strokes are stored/anchored in absolute document (overlay) space
		// (research.md R2/R3, unchanged); this translate is the only thing
		// that maps that space onto the now viewport-sized canvas, so it
		// keeps tracking scroll without the canvas itself needing to move.
		ctx.translate(-scroller.scrollLeft, -scroller.scrollTop);
		const colour = this.deps.getStrokeColor();
		const visible = this.visibleBox();
		// A generous margin (one viewport in every direction) around the
		// cheap approxBBox filter below, so a hint that's gone slightly
		// stale since the last loadStatic() still catches anything that
		// could plausibly have just scrolled into view (research.md R15).
		const filterBox: BoundingBox = {
			minX: visible.minX - scroller.clientWidth,
			minY: visible.minY - scroller.clientHeight,
			maxX: visible.maxX + scroller.clientWidth,
			maxY: visible.maxY + scroller.clientHeight,
		};

		for (const a of this.staticAnnotations) {
			if (!a.approxBBox || !boxesIntersect(a.approxBBox, filterBox)) continue;
			// Re-resolved fresh here, never from the cached hint above: CM6 can
			// correct this exact position's real coordinates between
			// geometryChanged events while scrolling through unmeasured
			// content (research.md R12), so drawing at anything but the
			// current coordsAtPos result is what read as ink "distorting" on
			// longer notes. Bounding the candidate set by approxBBox first is
			// what keeps this affordable — only annotations already near the
			// viewport pay for a coordsAtPos call.
			const anchor = this.resolveAnchorPoint(a.anchorOffset);
			if (anchor) this.drawStrokesAt(a.strokes, anchor, colour);
		}
		for (const [, annotation] of this.state.annotations) {
			const box = strokesBoundingBox(annotation.strokes);
			if (box && boxesIntersect(box, visible)) this.drawStrokesAt(annotation.strokes, { x: 0, y: 0 }, colour);
		}
		if (this.drawing && this.currentRaw.length > 0) {
			this.drawStrokesAt([toPreviewStroke(this.currentRaw)], { x: 0, y: 0 }, colour);
		}
		ctx.restore();
	}

	private drawStrokesAt(strokes: Stroke[], anchor: { x: number; y: number }, colour: string): void {
		const ctx = this.ctx;
		ctx.save();
		ctx.translate(anchor.x, anchor.y);
		ctx.fillStyle = colour;
		for (const stroke of strokes) {
			ctx.fill(new Path2D(strokeOutlinePath(stroke)));
		}
		ctx.restore();
	}

	private resolveAnchorPoint(offset: number): { x: number; y: number } | null {
		const { view } = this.deps;
		const coords = view.coordsAtPos(Math.min(offset, view.state.doc.length));
		if (!coords) return null;
		const scrollerRect = view.scrollDOM.getBoundingClientRect();
		return toOverlayPoint(
			{ x: coords.left, y: coords.top },
			{ left: scrollerRect.left, top: scrollerRect.top },
			{ left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop },
		);
	}

	// attachPointerCapture's `local` is relative to the scroller's current
	// (viewport-visible) top-left; overlay space additionally accounts for
	// how much has been scrolled (toOverlayPoint / layout.ts).
	private toOverlaySpace(local: { x: number; y: number }): { x: number; y: number } {
		const scroller = this.deps.view.scrollDOM;
		return { x: local.x + scroller.scrollLeft, y: local.y + scroller.scrollTop };
	}

	private pushRawPoint(e: PointerEvent, local: { x: number; y: number }): void {
		const scrollerRect = this.deps.view.scrollDOM.getBoundingClientRect();
		const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
		const events = coalesced.length > 0 ? coalesced : [e];
		for (const ev of events) {
			const evLocal = { x: ev.clientX - scrollerRect.left, y: ev.clientY - scrollerRect.top };
			const point = this.toOverlaySpace(evLocal);
			this.currentRaw.push({ x: point.x, y: point.y, pressure: ev.pressure });
		}
	}

	private scheduleRedraw(): void {
		if (this.redrawFrame !== null) return;
		this.redrawFrame = requestAnimationFrame(() => {
			this.redrawFrame = null;
			this.redraw();
		});
	}

	private onPenStart(e: PointerEvent, local: { x: number; y: number }): void {
		this.drawing = true;
		this.currentRaw = [];
		this.pushRawPoint(e, local);
		this.scheduleRedraw();
	}

	private onPenMove(e: PointerEvent, local: { x: number; y: number }): void {
		if (!this.drawing) return;
		this.pushRawPoint(e, local);
		this.scheduleRedraw();
	}

	private posAtOverlayPoint(point: { x: number; y: number }): number | null {
		const { view } = this.deps;
		const scrollerRect = view.scrollDOM.getBoundingClientRect();
		const clientX = point.x + scrollerRect.left - view.scrollDOM.scrollLeft;
		const clientY = point.y + scrollerRect.top - view.scrollDOM.scrollTop;
		return view.posAtCoords({ x: clientX, y: clientY });
	}

	private onPenEnd(): void {
		if (!this.drawing) return;
		this.drawing = false;
		if (this.currentRaw.length === 0) return;

		const raw = this.currentRaw;
		this.currentRaw = [];

		const wasKnown = new Set(this.state.annotations.keys());
		const id = this.state.addStroke(raw);

		if (!wasKnown.has(id)) {
			const text = this.deps.view.state.doc.toString();
			const penDownOffset = this.posAtOverlayPoint(raw[0] as RawPoint) ?? text.length;
			this.newAnchorOffset.set(id, findInsertionPoint(text, penDownOffset));
		}

		this.redraw();
		this.queue.schedule(id);
	}

	private currentAnchorOffsetForKnown(id: string): number {
		const text = this.deps.view.state.doc.toString();
		const ref = listAnnotationBlocks(text).find((r) => r.id === id);
		return ref ? ref.blockStart : text.length;
	}

	private buildEntry(id: string): DirtyAnnotationSave {
		const annotation = this.state.annotations.get(id);
		const strokes = annotation ? annotation.strokes : [];
		const isNew = !this.knownIds.has(id);
		const anchorOffset = isNew
			? (this.newAnchorOffset.get(id) ?? this.deps.view.state.doc.length)
			: this.currentAnchorOffsetForKnown(id);
		const anchor = this.resolveAnchorPoint(anchorOffset) ?? { x: 0, y: 0 };
		const relative = strokes.map((s) => ({
			points: s.points.map((p) => ({ ...p, x: p.x - anchor.x, y: p.y - anchor.y })),
		}));
		const line = formatAnnotationLine({ id, strokes: relative });
		return { id, line, pos: isNew ? anchorOffset : null };
	}

	private async flushDirty(): Promise<SaveOutcome> {
		const ids = [...this.state.dirty];
		if (ids.length === 0) return { kind: 'unchanged' };

		const entries = ids.map((id) => this.buildEntry(id));
		const outcomes = await saveDirtyAnnotations(this.deps.vault, this.deps.file, entries);

		let sawUpdate = false;
		let sawFailure: SaveOutcome | null = null;
		let anySucceeded = false;
		for (const id of ids) {
			const outcome = outcomes.get(id) ?? { kind: 'file-missing' };
			if (outcome.kind === 'updated' || outcome.kind === 'unchanged') {
				// Only ids that actually persisted are cleared; a not-found/
				// duplicate/file-missing id stays dirty so it keeps retrying on
				// the next save tick instead of silently dropping the drawing
				// (constitution III — a polished "orphaned" notice is out of
				// scope for this spike).
				this.state.dirty.delete(id);
				this.knownIds.add(id);
				anySucceeded = true;
				if (outcome.kind === 'updated') sawUpdate = true;
			} else {
				sawFailure = outcome;
			}
		}
		if (anySucceeded) this.loadStatic();
		if (sawFailure) return sawFailure;
		return { kind: sawUpdate ? 'updated' : 'unchanged' };
	}
}
