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

	// update()/destroy() are called directly by CM6's own render/teardown
	// cycle for as long as a session is attached, so an uncaught exception
	// here would break that editor's rendering, not just Canvas Mode — an
	// undocumented-internals assumption failing (as insertBefore's did) must
	// degrade to dropping the session, never to crashing the editor or the
	// plugin's load sequence.
	update(update: ViewUpdate): void {
		if (!this.session || !update.docChanged) return;
		try {
			this.session.onDocChanged();
		} catch (e) {
			console.error('Canvas Mode: onDocChanged failed, deactivating', e);
			void this.session.destroy().catch(() => {});
			this.session = null;
		}
	}

	destroy(): void {
		try {
			void this.session?.destroy();
		} catch (e) {
			console.error('Canvas Mode: session teardown failed', e);
		}
		this.session = null;
	}
}

export const canvasLiveViewPlugin = ViewPlugin.fromClass(CanvasLivePluginInstance);

export function getCanvasSession(view: EditorView): CanvasLivePluginInstance | null {
	return view.plugin(canvasLiveViewPlugin);
}
