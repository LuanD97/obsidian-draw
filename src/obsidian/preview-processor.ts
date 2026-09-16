import { parseBlockLine, DecodeError } from '../format/block-line';
import { buildPreviewSvg } from '../render/svg-preview';

export interface RenderInkBlockOptions {
	sourcePath: string;
	openEditor: (sourcePath: string, id: string) => void;
}

const ERROR_MESSAGES: Record<DecodeError['kind'], string> = {
	malformed: "Can't read this drawing",
	'unsupported-version': 'Made with a newer version of the plugin',
};

export function renderInkBlock(source: string, el: HTMLElement, options: RenderInkBlockOptions): void {
	const doc = el.ownerDocument;

	let drawing;
	try {
		drawing = parseBlockLine(source.trim());
	} catch (e) {
		const kind = e instanceof DecodeError ? e.kind : 'malformed';
		const error = doc.createElement('div');
		error.className = 'ink-error';
		error.textContent = ERROR_MESSAGES[kind];
		el.appendChild(error);
		return;
	}

	const preview = doc.createElement('div');
	preview.className = 'ink-preview';

	if (drawing.strokes.length === 0) {
		preview.classList.add('is-empty');
		preview.textContent = 'Tap to draw';
		preview.style.width = '100%';
		preview.style.maxWidth = `${drawing.width}px`;
	} else {
		preview.appendChild(buildPreviewSvg(doc, drawing));
	}

	const suppressPress = (e: Event): void => {
		e.preventDefault();
		e.stopPropagation();
	};
	preview.addEventListener('pointerdown', suppressPress);
	preview.addEventListener('mousedown', suppressPress);
	// Not 'click': calling preventDefault() on a cancelable pointerdown for
	// pointerType 'pen'/'touch' (done above, to stop the tap moving
	// CodeMirror's cursor into the block) tells the browser to skip the
	// compatibility mousedown/mouseup/click it would otherwise synthesize,
	// so a real Pencil or finger tap would never reach a 'click' listener.
	// pointerup is a genuine pointer event and always fires.
	preview.addEventListener('pointerup', () => {
		options.openEditor(options.sourcePath, drawing.id);
	});

	el.appendChild(preview);
}
