import { MarkdownRenderChild, Notice, Plugin, TFile } from 'obsidian';
import { renderInkBlock } from './obsidian/preview-processor';
import { createInsertCommand } from './obsidian/insert-command';
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
				// Wired to real behaviour by User Story 2 (T072): tapping a
				// preview isn't clickable yet, so this is unreachable in v1's MVP.
				openEditor: () => {},
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
		void this.overlayHandle?.close();
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
			dpr: window.devicePixelRatio,
			available: { width: window.innerWidth, height: window.innerHeight },
		});

		const close = handle.close.bind(handle);
		handle.close = async () => {
			await close();
			this.overlayHandle = null;
		};

		this.overlayHandle = handle;
	}
}
