import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { CanvasModeSession } from './live-session';

// Glue (constitution v1.1.0): registered once, globally, via
// Plugin.registerEditorExtension — CM6 creates one instance per open editor
// pane. Holds at most one CanvasModeSession, created/destroyed by the
// "Turn note into canvas" command / active-leaf wiring in main.ts (looked up
// per view via EditorView.plugin(canvasLiveViewPlugin)), not by this class
// itself. No data-handling decisions of its own.
export class CanvasLivePluginInstance {
	session: CanvasModeSession | null = null;

	update(update: ViewUpdate): void {
		if (this.session && update.docChanged) {
			this.session.onDocChanged();
		}
	}

	destroy(): void {
		void this.session?.destroy();
		this.session = null;
	}
}

export const canvasLiveViewPlugin = ViewPlugin.fromClass(CanvasLivePluginInstance);

export function getCanvasSession(view: EditorView): CanvasLivePluginInstance | null {
	return view.plugin(canvasLiveViewPlugin);
}
