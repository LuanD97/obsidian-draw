import { MarkdownRenderChild, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { renderInkBlock } from './obsidian/preview-processor';
import { createInsertCommand } from './obsidian/insert-command';
import { openEditorFlow } from './obsidian/flows';
import { openOverlay, type OverlayHandle } from './editor/overlay';
import { canvasAnnotationViewPlugin } from './canvas/view-plugin';
import { canvasLiveViewPlugin, getCanvasSession, type CanvasLivePluginInstance } from './canvas/live-plugin';
import { CanvasModeSession } from './canvas/live-session';
import { isCanvasModeEnabled, setCanvasModeEnabled } from './canvas/frontmatter';
import type { EditingSession } from './editor/session';
import type { SaveQueue } from './editor/save-queue';
import type { TFileLike } from './obsidian/vault-save';

// Glue (constitution v1.1.0): registers the code block processor and the
// insert command, and holds the one open overlay reference. No data-handling
// decisions of its own; every function it calls is already tested.
export default class DrawPlugin extends Plugin {
	private overlayHandle: OverlayHandle | null = null;

	// Canvas Mode: at most one note's session is active at a time (plan.md
	// Scale/Scope), tracked directly rather than by re-scanning open leaves.
	private activeCanvasFile: TFile | null = null;
	private activeCanvasPlugin: CanvasLivePluginInstance | null = null;

	onload(): void {
		this.registerMarkdownCodeBlockProcessor('ink', (source, el, ctx) => {
			ctx.addChild(new MarkdownRenderChild(el));
			renderInkBlock(source, el, {
				sourcePath: ctx.sourcePath,
				openEditor: (sourcePath, id) => this.openEditor(sourcePath, id),
			});
		});

		this.addCommand(
			createInsertCommand({
				vault: this.app.vault,
				read: (file) => this.app.vault.read(file as TFile),
				isOverlayOpen: () => this.overlayHandle !== null,
				openOverlay: (file, session, queue) => this.showOverlay(file, session, queue),
				notice: (message) => {
					new Notice(message);
				},
			}),
		);

		// canvasAnnotationViewPlugin (hides raw ink-canvas block source) is
		// unconditional, for every note, per research.md R4. canvasLiveViewPlugin
		// only ever does anything once this.activateCanvasSession gives it a
		// session (contracts/canvas-mode-toggle.md "Activation scope").
		this.registerEditorExtension([canvasAnnotationViewPlugin, canvasLiveViewPlugin]);

		this.addCommand({
			id: 'toggle-canvas-mode',
			name: 'Turn note into canvas',
			icon: 'layout-panel-top',
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view?.file) return false;
				if (!checking) void this.toggleCanvasMode(view);
				return true;
			},
		});

		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncCanvasSession()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.syncCanvasSession()));
		this.app.workspace.onLayoutReady(() => this.syncCanvasSession());
	}

	onunload(): void {
		void this.overlayHandle?.close({ reason: 'unload' });
		this.deactivateCanvasSession();
	}

	// Community-plugin convention: Obsidian's public Editor API doesn't
	// expose the underlying CM6 EditorView, but MarkdownView's editor always
	// carries one at `.cm` in practice. @codemirror/view is externalized at
	// build time (esbuild.config.mjs), so at runtime this is literally
	// Obsidian's own EditorView class — the instanceof check is exact, and a
	// mismatch (a future Obsidian internal change) degrades to Canvas Mode
	// simply not activating for that view rather than throwing.
	private getEditorView(view: MarkdownView): EditorView | null {
		const cm = (view.editor as unknown as { cm?: unknown }).cm;
		return cm instanceof EditorView ? cm : null;
	}

	private async toggleCanvasMode(view: MarkdownView): Promise<void> {
		const file = view.file;
		if (!file) return;
		const currentlyEnabled = isCanvasModeEnabled(this.app.metadataCache.getFileCache(file)?.frontmatter);
		const nextEnabled = !currentlyEnabled;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			setCanvasModeEnabled(fm, nextEnabled);
		});
		// Acts on the state just written, not by re-reading metadataCache:
		// processFrontMatter's promise resolving doesn't guarantee the cache
		// has already been re-parsed, so an immediate syncCanvasSession() here
		// could still see the pre-toggle frontmatter and skip activation
		// until the next unrelated active-leaf-change/file-open event.
		if (nextEnabled) {
			this.activateCanvasSession(view, file);
		} else {
			this.deactivateCanvasSession();
		}
	}

	// Activates/deactivates the live Canvas Mode surface to match whichever
	// note is active and whether it currently has canvas-mode: true —
	// covering both the toggle command and switching to/from an
	// already-enabled note (contracts/canvas-mode-toggle.md "Activation scope").
	private syncCanvasSession(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file ?? null;
		const enabled = file ? isCanvasModeEnabled(this.app.metadataCache.getFileCache(file)?.frontmatter) : false;

		if (this.activeCanvasFile && (this.activeCanvasFile !== file || !enabled)) {
			this.deactivateCanvasSession();
		}

		if (enabled && file && view && this.activeCanvasFile !== file) {
			this.activateCanvasSession(view, file);
		}
	}

	private activateCanvasSession(view: MarkdownView, file: TFile): void {
		const editorView = this.getEditorView(view);
		if (!editorView) {
			new Notice("Canvas Mode couldn't attach to this editor (unexpected Obsidian internals)");
			return;
		}
		const plugin = getCanvasSession(editorView);
		if (!plugin) {
			new Notice("Canvas Mode couldn't find its editor extension — try reloading Obsidian");
			return;
		}

		plugin.session = new CanvasModeSession({
			view: editorView,
			file: file as TFileLike,
			vault: { process: (f, fn) => this.app.vault.process(f as unknown as TFile, fn) },
			getStrokeColor: () => getComputedStyle(document.body).getPropertyValue('--text-normal').trim(),
			dpr: window.devicePixelRatio,
		});
		this.activeCanvasFile = file;
		this.activeCanvasPlugin = plugin;
	}

	private deactivateCanvasSession(): void {
		if (this.activeCanvasPlugin?.session) {
			void this.activeCanvasPlugin.session.destroy();
			this.activeCanvasPlugin.session = null;
		}
		this.activeCanvasPlugin = null;
		this.activeCanvasFile = null;
	}

	private openEditor(sourcePath: string, id: string): void {
		const file = this.app.vault.getFileByPath(sourcePath);
		if (!file) return;

		const openViews = this.app.workspace
			.getLeavesOfType('markdown')
			.map((leaf) => leaf.view as MarkdownView)
			.filter((view) => view.file?.path === file.path);

		void openEditorFlow({
			file: file as TFileLike,
			id,
			vault: this.app.vault,
			openViews: () => openViews,
			read: (f) => this.app.vault.read(f as TFile),
			isOverlayOpen: () => this.overlayHandle !== null,
			openOverlay: (f, session, queue) => this.showOverlay(f, session, queue),
			notice: (message) => {
				new Notice(message);
			},
		});
	}

	private showOverlay(_file: TFileLike, session: EditingSession, queue: SaveQueue): void {
		const handle = openOverlay({
			doc: document,
			parent: document.body,
			session,
			flush: () => queue.flush(),
			getStrokeColor: () =>
				getComputedStyle(document.body).getPropertyValue('--text-normal').trim(),
			onThemeChange: (handler) => {
				this.registerEvent(this.app.workspace.on('css-change', handler));
			},
			schedule: (line) => queue.schedule(line),
			onClosed: () => {
				this.overlayHandle = null;
			},
			dpr: window.devicePixelRatio,
			// Leaves room for the panel's own padding/border and the toolbar
			// above the surface, and keeps some scrim visible around the
			// panel even for a drawing that would otherwise fit the viewport
			// exactly, matching .ink-panel's max-width/max-height clamp.
			// Re-read on every call (not captured once) so a window resize
			// (rotation, split view) picks up the new viewport.
			getAvailable: () => ({
				width: window.innerWidth * 0.9,
				height: window.innerHeight * 0.75,
			}),
		});

		this.overlayHandle = handle;
	}
}
