import { commitStroke } from '../model/quantize';
import { strokesBoundingBox } from '../model/erase';
import { History } from '../model/history';
import { generateId } from '../format/id';
import type { Drawing, RawPoint, Stroke } from '../model/types';
import type { Annotation } from './annotation-line';

// Absolute session-space coordinates (the overlay's own coordinate system,
// spanning the whole scrollable note) are always non-negative in practice;
// this just needs to be generous enough not to clip a legitimately
// far-scrolled drawing. The anchor-relative (possibly negative) offset used
// for storage is computed at save time, outside this module (research.md R3).
const SANITY_BOUND = 1_000_000;

// How far outside an existing annotation's exact stroke bounds a new
// pen-down still counts as "continuing" it, rather than starting a fresh
// annotation. Real handwriting is a sequence of separate pen-lifts (one per
// letter, or per stroke within a letter) whose bounding boxes routinely
// don't touch at all despite being clearly one continuous scribble — a
// strict containment test (data-model.md's original "pen-down outside any
// existing annotation's stroke bounds" wording) fragmented an ordinary
// handwritten word into one ink-canvas block per letter, each padded with
// its own blank line, which is what read on-device as "too many spaces
// between typed blocks" (research.md R20). 40 (overlay-space pixels, i.e.
// roughly CSS px) comfortably bridges a letter-to-letter or word-to-word gap
// while staying well short of the distance between a margin annotation and
// the text column, or between separate lines of text.
const ANNOTATION_MERGE_MARGIN = 40;

function toDrawing(a: Annotation): Drawing {
	return { version: 1, id: a.id, width: 0, height: 0, strokes: a.strokes };
}

function fromDrawing(d: Drawing): Annotation {
	return { id: d.id, strokes: d.strokes };
}

// Whether `at` falls inside the union of all of the annotation's strokes'
// bounding boxes (model/erase.ts's boundingBox logic, reused unchanged, per
// research.md R10), expanded by ANNOTATION_MERGE_MARGIN in every direction
// (research.md R20) so a new pen-down close to, but not literally touching,
// an existing annotation still continues it.
function containsPoint(strokes: Stroke[], at: { x: number; y: number }): boolean {
	const box = strokesBoundingBox(strokes);
	if (!box) return false;
	return (
		at.x >= box.minX - ANNOTATION_MERGE_MARGIN &&
		at.x <= box.maxX + ANNOTATION_MERGE_MARGIN &&
		at.y >= box.minY - ANNOTATION_MERGE_MARGIN &&
		at.y <= box.maxY + ANNOTATION_MERGE_MARGIN
	);
}

export interface CanvasModeNoteStateDeps {
	generateId?: () => string;
}

// In-memory state for one note currently open with Canvas Mode active
// (data-model.md CanvasModeNoteState). One model/history.ts History instance
// per annotation, wrapping each Annotation as a Drawing-shaped value for
// history purposes (width/height unused zeros — Canvas Mode never resizes),
// per research.md R10.
export class CanvasModeNoteState {
	annotations = new Map<string, Annotation>();
	undoLedger: string[] = [];
	dirty = new Set<string>();

	private readonly histories = new Map<string, History>();
	private readonly newId: () => string;

	constructor(initial: Annotation[] = [], deps: CanvasModeNoteStateDeps = {}) {
		this.newId = deps.generateId ?? generateId;
		for (const annotation of initial) {
			this.annotations.set(annotation.id, annotation);
			this.histories.set(annotation.id, new History());
		}
	}

	private resolveTarget(at: { x: number; y: number }): string {
		for (const [id, annotation] of this.annotations) {
			if (containsPoint(annotation.strokes, at)) return id;
		}
		const id = this.newId();
		this.annotations.set(id, { id, strokes: [] });
		this.histories.set(id, new History());
		return id;
	}

	addStroke(raw: RawPoint[]): string {
		const first = raw[0] as RawPoint;
		const id = this.resolveTarget({ x: first.x, y: first.y });
		const history = this.histories.get(id) as History;
		const drawing = toDrawing(this.annotations.get(id) as Annotation);
		const stroke = commitStroke(raw, SANITY_BOUND, SANITY_BOUND);
		const updated = history.apply(drawing, { kind: 'add', stroke });
		this.annotations.set(id, fromDrawing(updated));
		this.undoLedger.push(id);
		this.dirty.add(id);
		return id;
	}
}
