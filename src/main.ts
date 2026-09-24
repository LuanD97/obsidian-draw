import { MarkdownRenderChild, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { renderInkBlock } from './obsidian/preview-processor';
import { createInsertCommand } from './obsidian/insert-command';
import { openEditorFlow } from './obsidian/flows';
import { openOverlay, type OverlayHandle } from './editor/overlay';
import { canvasAnnotationField } from './canvas/view-plugin';
import { canvasLiveViewPlugin, getCanvasSession, type CanvasLivePluginInstance } from './canvas/live-plugin';
import { CanvasModeSession } from './canvas/live-session';
import { isCanvasModeEnabled, setCanvasModeEnabled } from './canvas/frontmatter';
import type { EditingSession } from './editor/session';
import type { SaveQueue } from './editor/save-queue';
import type { TFileLike } from './obsidian/vault-save';

// TEMPORARY on-device diagnostic logging for the "failed to open ''" reopen
// investigation (research.md "Still open" section). Tagged '[CanvasMode:DEBUG]'
// for easy filtering in Safari Web Inspector's console and easy removal once
// diagnosed — not meant to ship.
const DEBUG = true;
function debugLog(...args: unknown[]): void {
	if (DEBUG) console.warn('[CanvasMode:DEBUG]', ...args);
}

// Glue (constitution v1.1.0): registers the code block processor and the
// insert command, and holds the one open overlay reference. No data-handling
// decisions of its own; every function it calls is already tested.
export default class DrawPlugin extends Plugin {
	private overlayHandle: OverlayHandle | null = null;

	// Canvas Mode: at most one note's session is active at a time (plan.md
	// Scale/Scope), tracked directly rather than by re-scanning open leaves.
	private activeCanvasFile: TFile | null = null;
	private activeCanvasPlugin: CanvasLivePluginInstance | null = null;

	// TEMPORARY: see onload()'s window listener registration below.
	private debugOnError: ((e: ErrorEvent) => void) | null = null;
	private debugOnRejection: ((e: PromiseRejectionEvent) => void) | null = null;

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

		// canvasAnnotationField (hides raw ink-canvas block source) is
		// unconditional, for every note, per research.md R4. canvasLiveViewPlugin
		// only ever does anything once this.activateCanvasSession gives it a
		// session (contracts/canvas-mode-toggle.md "Activation scope").
		this.registerEditorExtension([canvasAnnotationField, canvasLiveViewPlugin]);

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

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				debugLog('active-leaf-change');
				this.syncCanvasSession();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				debugLog('file-open', { path: file?.path ?? null });
				this.syncCanvasSession();
			}),
		);
		this.app.workspace.onLayoutReady(() => {
			debugLog('onLayoutReady');
			this.syncCanvasSession();
		});

		// TEMPORARY: catches anything Obsidian's own file-open pipeline might
		// otherwise swallow before surfacing only a generic "failed to open"
		// Notice — logs the real error/rejection, if there is one, at the
		// moment it happens.
		this.debugOnError = (e: ErrorEvent) => debugLog('window error', { message: e.message, error: e.error });
		this.debugOnRejection = (e: PromiseRejectionEvent) => debugLog('unhandled rejection', { reason: e.reason });
		window.addEventListener('error', this.debugOnError);
		window.addEventListener('unhandledrejection', this.debugOnRejection);
	}

	onunload(): void {
		void this.overlayHandle?.close({ reason: 'unload' });
		this.deactivateCanvasSession();
		if (this.debugOnError) window.removeEventListener('error', this.debugOnError);
		if (this.debugOnRejection) window.removeEventListener('unhandledrejection', this.debugOnRejection);
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
	//
	// Whether to (re)activate is decided from the *current* view's own CM6
	// plugin instance (getCanvasSession(editorView)?.session), not from
	// this.activeCanvasFile/activeCanvasPlugin's cached equality check
	// against `file`. Obsidian can reuse the same TFile object across a
	// close-then-reopen of the same note's leaf/tab, in which case CM6 tears
	// down the old EditorView (and, via CanvasLivePluginInstance.destroy(),
	// its session) without this class ever hearing about it — leaving
	// activeCanvasFile still pointing at that (by-reference-equal) file. The
	// old `this.activeCanvasFile !== file` guard then treated that as
	// "already active" and skipped creating a session for the *new*
	// EditorView entirely, so the reopened note silently never got Canvas
	// Mode back. Checking the live plugin's own session is the source of
	// truth regardless of what this class's cache still remembers.
	private syncCanvasSession(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file ?? null;
		const enabled = file ? isCanvasModeEnabled(this.app.metadataCache.getFileCache(file)?.frontmatter) : false;
		debugLog('syncCanvasSession', {
			path: file?.path ?? null,
			enabled,
			activeCanvasFilePath: this.activeCanvasFile?.path ?? null,
			sameFileRef: this.activeCanvasFile === file,
		});

		if (this.activeCanvasFile && (this.activeCanvasFile !== file || !enabled)) {
			this.deactivateCanvasSession();
		}

		if (!enabled || !file || !view) return;

		const editorView = this.getEditorView(view);
		const plugin = editorView ? getCanvasSession(editorView) : null;
		debugLog('syncCanvasSession: current view plugin state', {
			hasEditorView: !!editorView,
			hasPlugin: !!plugin,
			hasSession: !!plugin?.session,
		});
		if (plugin?.session) {
			this.activeCanvasFile = file;
			this.activeCanvasPlugin = plugin;
		} else {
			this.activateCanvasSession(view, file);
		}
	}

	// Never lets a failure here escape uncaught: this can run during
	// onLayoutReady (startup, for a restored canvas-mode note) or from a
	// workspace event handler, and an uncaught exception in either would
	// otherwise surface as "plugin failed to load" or a broken workspace —
	// far worse than Canvas Mode simply not activating for one note.
	//
	// getCanvasSession(editorView) can legitimately return null for a fresh
	// EditorView for a few milliseconds after Obsidian creates it: our
	// globally-registered editor extension (registerEditorExtension in
	// onload()) is applied to a new/reopened leaf's EditorView slightly after
	// the leaf itself becomes the active view and fires 'active-leaf-change'/
	// 'file-open' — the same class of "event fires before the thing it
	// announces has fully caught up" race as R11's frontmatter-cache timing,
	// confirmed on-device (the user hit exactly the "couldn't find its editor
	// extension" Notice specifically when switching away from and back to, or
	// closing and reopening, a canvas-mode note). Retrying a few times over a
	// short window before giving up is the same "fail closed, but not on the
	// very first synchronous check" fix as that earlier race (research.md R17).
	private activateCanvasSession(view: MarkdownView, file: TFile, attempt = 0): void {
		const MAX_ATTEMPTS = 6;
		const RETRY_DELAY_MS = 50;
		debugLog('activateCanvasSession attempt', { attempt, path: file.path });
		try {
			const editorView = this.getEditorView(view);
			if (!editorView) {
				debugLog('activateCanvasSession: no EditorView (getEditorView returned null)');
				new Notice("Canvas Mode couldn't attach to this editor (unexpected Obsidian internals)");
				return;
			}
			const plugin = getCanvasSession(editorView);
			if (!plugin) {
				if (attempt < MAX_ATTEMPTS) {
					window.setTimeout(() => {
						// The active view may have changed while waiting; only
						// retry if this is still the one the user is looking at,
						// otherwise a later syncCanvasSession() call already owns
						// deciding what (if anything) to activate.
						if (this.app.workspace.getActiveViewOfType(MarkdownView) === view) {
							this.activateCanvasSession(view, file, attempt + 1);
						} else {
							debugLog('activateCanvasSession: active view changed during retry wait, abandoning', {
								path: file.path,
							});
						}
					}, RETRY_DELAY_MS);
					return;
				}
				debugLog('activateCanvasSession: exhausted retries, giving up', { path: file.path });
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
			debugLog('activateCanvasSession: session created', { path: file.path, attempt });
		} catch (e) {
			debugLog('activateCanvasSession: threw', { path: file.path, error: e });
			console.error('Canvas Mode: failed to activate', e);
			new Notice("Canvas Mode failed to start for this note — see console for details");
		}
	}

	private deactivateCanvasSession(): void {
		debugLog('deactivateCanvasSession', {
			path: this.activeCanvasFile?.path ?? null,
			hadSession: !!this.activeCanvasPlugin?.session,
		});
		try {
			if (this.activeCanvasPlugin?.session) {
				void this.activeCanvasPlugin.session
					.destroy()
					.then(() => debugLog('deactivateCanvasSession: async destroy() resolved'))
					.catch((e: unknown) => {
						debugLog('deactivateCanvasSession: async destroy() rejected', { error: e });
						console.error('Canvas Mode: failed to tear down cleanly', e);
					});
				this.activeCanvasPlugin.session = null;
			}
		} catch (e) {
			console.error('Canvas Mode: failed to tear down cleanly', e);
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
