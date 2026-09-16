// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderInkBlock } from '../../src/obsidian/preview-processor';

describe('renderInkBlock', () => {
	it('renders div.ink-preview containing the SVG for a valid drawing', () => {
		const el = document.createElement('div');
		const source = 'v1;id=aaaaaaaa;700x260;Y2RkYkoBAA==';
		renderInkBlock(source, el, { sourcePath: 'note.md', openEditor: vi.fn() });

		const preview = el.querySelector('div.ink-preview');
		expect(preview).not.toBeNull();
		expect(preview?.querySelector('svg.ink-preview-svg')).not.toBeNull();
		expect(preview?.classList.contains('is-empty')).toBe(false);
	});

	it('renders div.ink-preview.is-empty with "Tap to draw" for an empty drawing', () => {
		const el = document.createElement('div');
		const source = 'v1;id=aaaaaaaa;700x260;';
		renderInkBlock(source, el, { sourcePath: 'note.md', openEditor: vi.fn() });

		const preview = el.querySelector('div.ink-preview.is-empty');
		expect(preview).not.toBeNull();
		expect(preview?.textContent).toBe('Tap to draw');
	});

	it('renders div.ink-error "Can\'t read this drawing" for a malformed block', () => {
		const el = document.createElement('div');
		renderInkBlock('not a valid block line', el, { sourcePath: 'note.md', openEditor: vi.fn() });

		const error = el.querySelector('div.ink-error');
		expect(error).not.toBeNull();
		expect(error?.textContent).toBe("Can't read this drawing");
	});

	it('renders div.ink-error for an unsupported version', () => {
		const el = document.createElement('div');
		renderInkBlock('v2;id=aaaaaaaa;700x260;', el, {
			sourcePath: 'note.md',
			openEditor: vi.fn(),
		});

		const error = el.querySelector('div.ink-error');
		expect(error).not.toBeNull();
		expect(error?.textContent).toBe('Made with a newer version of the plugin');
	});

	it('never creates a canvas element', () => {
		const el = document.createElement('div');
		renderInkBlock('v1;id=aaaaaaaa;700x260;Y2RkYkoBAA==', el, {
			sourcePath: 'note.md',
			openEditor: vi.fn(),
		});
		renderInkBlock('v1;id=aaaaaaaa;700x260;', el, { sourcePath: 'note.md', openEditor: vi.fn() });
		renderInkBlock('garbage', el, { sourcePath: 'note.md', openEditor: vi.fn() });

		expect(el.querySelectorAll('canvas').length).toBe(0);
	});

	it('prevents default and stops propagation for pointerdown/mousedown on the preview', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		renderInkBlock('v1;id=aaaaaaaa;700x260;Y2RkYkoBAA==', el, {
			sourcePath: 'note.md',
			openEditor: vi.fn(),
		});
		const preview = el.querySelector('div.ink-preview') as HTMLElement;

		const parentListener = vi.fn();
		el.addEventListener('pointerdown', parentListener);
		el.addEventListener('mousedown', parentListener);

		const pointerdown = new Event('pointerdown', { cancelable: true, bubbles: true });
		preview.dispatchEvent(pointerdown);
		expect(pointerdown.defaultPrevented).toBe(true);

		const mousedown = new Event('mousedown', { cancelable: true, bubbles: true });
		preview.dispatchEvent(mousedown);
		expect(mousedown.defaultPrevented).toBe(true);

		expect(parentListener).not.toHaveBeenCalled();
		el.remove();
	});

	// Regression: a real tap with pointerType 'pen' or 'touch' never produces
	// a click event here. Per the Pointer Events spec, calling
	// preventDefault() on a cancelable pointerdown for those pointer types
	// tells the browser not to dispatch the compatibility mousedown/mouseup/
	// click at all - which the pointerdown suppression above does on
	// purpose, to stop the tap from moving CodeMirror's cursor into the
	// block. happy-dom's synthetic 'click' dispatch doesn't model that
	// suppression, so a test relying on 'click' would pass even though real
	// iPad taps never open the editor. Only pointerup is guaranteed to fire.
	it('a pointerdown+pointerup tap (no click event) calls the injected openEditor(sourcePath, id)', () => {
		const el = document.createElement('div');
		const openEditor = vi.fn();
		renderInkBlock('v1;id=aaaaaaaa;700x260;Y2RkYkoBAA==', el, {
			sourcePath: 'note.md',
			openEditor,
		});
		const preview = el.querySelector('div.ink-preview') as HTMLElement;

		const pointerdown = new Event('pointerdown', { cancelable: true, bubbles: true });
		preview.dispatchEvent(pointerdown);
		preview.dispatchEvent(new Event('pointerup', { bubbles: true }));

		expect(openEditor).toHaveBeenCalledWith('note.md', 'aaaaaaaa');
	});

	it('div.ink-error is not tappable', () => {
		const el = document.createElement('div');
		const openEditor = vi.fn();
		renderInkBlock('garbage', el, { sourcePath: 'note.md', openEditor });
		const error = el.querySelector('div.ink-error') as HTMLElement;

		error.dispatchEvent(new Event('pointerup', { bubbles: true }));

		expect(openEditor).not.toHaveBeenCalled();
	});
});
