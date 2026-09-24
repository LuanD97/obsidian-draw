import { RangeSetBuilder, StateField, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { listAnnotationBlocks } from './scan';

// Renders as nothing: the raw ink-canvas block source (fence lines + base64
// payload) must never be visible in Live Preview (research.md R4).
class HiddenAnnotationWidget extends WidgetType {
	toDOM(): HTMLElement {
		const el = document.createElement('div');
		el.style.display = 'none';
		return el;
	}
	eq(other: WidgetType): boolean {
		return other instanceof HiddenAnnotationWidget;
	}
}

// Pure: given the note's current text, computes which ranges to hide. Spans
// the full block (opening fence through closing fence), replaced with a
// zero-size widget rather than removed, so a cursor landing inside it still
// resolves to a real document position (research.md R4's noted fallback).
export function computeAnnotationDecorations(text: string): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	for (const ref of listAnnotationBlocks(text)) {
		if (ref.blockEnd <= ref.blockStart) continue;
		builder.add(
			ref.blockStart,
			ref.blockEnd,
			Decoration.replace({ widget: new HiddenAnnotationWidget(), block: true }),
		);
	}
	return builder.finish();
}

// Glue (constitution v1.1.0): the actual registered CM6 extension, wiring the
// tested computeAnnotationDecorations above into CodeMirror's decoration
// pipeline. No data-handling decisions of its own; covered by the manual
// on-device checklist (quickstart.md item 3), not unit-tested.
//
// Must be a StateField, not a ViewPlugin: CM6 throws "Block decorations may
// not be specified via plugins" (@codemirror/view's own point() range-builder
// check) the moment a decoration with `block: true` — exactly what
// computeAnnotationDecorations produces for every ink-canvas block — comes
// from a plugin's `decorations` facet instead of a field's. This was the
// actual cause behind the "still open" reopen failure and scroll-triggered
// layout corruption in research.md: any note with an ink-canvas block in its
// rendered range threw here, uncaught, inside CM6's own render pipeline.
export const canvasAnnotationField = StateField.define<DecorationSet>({
	create(state) {
		return computeAnnotationDecorations(state.doc.toString());
	},
	update(decorations, tr: Transaction) {
		if (!tr.docChanged) return decorations;
		return computeAnnotationDecorations(tr.state.doc.toString());
	},
	provide: (f) => EditorView.decorations.from(f),
});
