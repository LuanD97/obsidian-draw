import { contentWidth } from '../model/canvas-size';
import type { MarkdownView } from 'obsidian';

// Glue (constitution v1.1.0): reads DOM measurements and passes them into the
// tested contentWidth(); no data-handling decisions of its own. Checked by
// quickstart.md manual item 1.
export function measureColumnWidth(view: MarkdownView): number | null {
	const container = view.containerEl;
	const el =
		container.querySelector<HTMLElement>('.cm-content') ??
		container.querySelector<HTMLElement>('.markdown-preview-sizer');
	if (!el) return null;

	const style = el.ownerDocument.defaultView?.getComputedStyle(el);
	const paddingLeft = style ? parseFloat(style.paddingLeft) || 0 : 0;
	const paddingRight = style ? parseFloat(style.paddingRight) || 0 : 0;

	return contentWidth(el.clientWidth, paddingLeft, paddingRight);
}
