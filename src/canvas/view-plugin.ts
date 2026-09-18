import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, WidgetType, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
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

// Glue (constitution v1.1.0): the actual registered CM6 ViewPlugin, wiring
// the tested computeAnnotationDecorations above into CodeMirror's decoration
// pipeline. No data-handling decisions of its own; covered by the manual
// on-device checklist (quickstart.md item 3), not unit-tested.
export const canvasAnnotationViewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = computeAnnotationDecorations(view.state.doc.toString());
		}

		update(update: ViewUpdate): void {
			if (update.docChanged) {
				this.decorations = computeAnnotationDecorations(update.state.doc.toString());
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);
