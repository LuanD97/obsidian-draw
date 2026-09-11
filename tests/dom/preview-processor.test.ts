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
});
