export interface MarginBand {
	start: number;
	width: number;
}

export interface MarginBands {
	left: MarginBand;
	right: MarginBand;
}

// Pure arithmetic over already-measured DOM numbers (the measurement itself
// is glue, added where this is called from). No special-casing for "no
// visible margin": a scroller no wider than the content column naturally
// clamps both bands to zero width (research.md R9).
export function computeMarginBands(
	scrollerWidth: number,
	contentLeft: number,
	contentWidth: number,
): MarginBands {
	const rightStart = contentLeft + contentWidth;
	return {
		left: { start: 0, width: Math.max(0, contentLeft) },
		right: { start: rightStart, width: Math.max(0, scrollerWidth - rightStart) },
	};
}

// Glue (constitution v1.1.0): reads DOM measurements and passes them into the
// tested computeMarginBands() above; no data-handling decisions of its own.
// Mirrors obsidian/column-width.ts's measureColumnWidth. Checked by
// quickstart.md manual items 1/2/10.
export function measureMarginBands(scroller: HTMLElement, content: HTMLElement): MarginBands {
	const scrollerRect = scroller.getBoundingClientRect();
	const contentRect = content.getBoundingClientRect();
	return computeMarginBands(scrollerRect.width, contentRect.left - scrollerRect.left, contentRect.width);
}
