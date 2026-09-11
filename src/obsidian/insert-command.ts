import type { Command, Editor, MarkdownFileInfo, MarkdownView } from 'obsidian';
import { defaultSize } from '../model/canvas-size';
import { generateId } from '../format/id';
import { newBlockMarkdown } from '../format/block-line';
import { insertionText } from '../document/insert';
import { measureColumnWidth } from './column-width';
import { openEditorFlow, type OpenEditorDeps } from './flows';
import type { Drawing } from '../model/types';
import type { TFileLike } from './vault-save';

export type InsertCommandDeps = Omit<OpenEditorDeps, 'file' | 'id' | 'openViews'>;

// Glue (constitution v1.1.0): wires the tested defaultSize/generateId/
// newBlockMarkdown/insertionText/openEditorFlow together with Obsidian's
// Editor API; no data-handling decisions of its own.
export function createInsertCommand(deps: InsertCommandDeps): Command {
	return {
		id: 'insert-block',
		name: 'Insert handwriting block',
		icon: 'pencil',
		editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
			// editorCallback is only ever invoked for a full editor view; ctx is
			// typed to include MarkdownFileInfo (e.g. embedded editors) but is a
			// MarkdownView here in every case the command can be triggered from.
			const view = ctx as MarkdownView;
			const size = defaultSize(measureColumnWidth(view));
			const drawing: Drawing = {
				version: 1,
				id: generateId(),
				width: size.width,
				height: size.height,
				strokes: [],
			};

			const cursorLine = editor.getCursor().line;
			const currentLine = editor.getLine(cursorLine);
			const text = insertionText(currentLine, newBlockMarkdown(drawing));
			editor.replaceRange(text, { line: cursorLine, ch: currentLine.length });

			void openEditorFlow({
				...deps,
				file: view.file as TFileLike,
				id: drawing.id,
				openViews: () => [view],
			});
		},
	};
}
