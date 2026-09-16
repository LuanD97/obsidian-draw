import { MarkdownRenderChild, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { renderInkBlock } from './obsidian/preview-processor';
import { createInsertCommand } from './obsidian/insert-command';
import { openEditorFlow } from './obsidian/flows';
import { openOverlay, type OverlayHandle } from './editor/overlay';
import type { EditingSession } from './editor/session';
import type { SaveQueue } from './editor/save-queue';
import type { TFileLike } from './obsidian/vault-save';

// Glue (constitution v1.1.0): registers the code block processor and the
// insert command, and holds the one open overlay reference. No data-handling
// decisions of its own; every function it calls is already tested.
export default class DrawPlugin extends Plugin {
	private overlayHandle: OverlayHandle | null = null;

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
	}

	onunload(): void {
		void this.overlayHandle?.close({ reason: 'unload' });
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
