import type { Size, Stroke } from './types';

const DEFAULT_WIDTH = 700;
const DEFAULT_HEIGHT = 260;
const MIN_DEFAULT_WIDTH = 200;
const MAX_DEFAULT_WIDTH = 2000;
const MIN_CANVAS_DIM = 64;
const MAX_CANVAS_DIM = 4096;

export function contentWidth(clientWidth: number, paddingLeft: number, paddingRight: number): number {
	return clientWidth - paddingLeft - paddingRight;
}

export function defaultSize(measuredColumnWidth: number | null): Size {
	if (measuredColumnWidth === null) {
		return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
	}
	const width = Math.min(
		MAX_DEFAULT_WIDTH,
		Math.max(MIN_DEFAULT_WIDTH, Math.floor(measuredColumnWidth)),
	);
	return { width, height: DEFAULT_HEIGHT };
}

export function fitScale(size: Size, available: Size): number {
	if (size.width <= available.width && size.height <= available.height) {
		return 1;
	}
	return Math.min(available.width / size.width, available.height / size.height);
}

// The smallest size that doesn't cut off any stroke, with a small margin.
export function minSize(strokes: Stroke[]): Size {
	let right = 0;
	let bottom = 0;
	for (const stroke of strokes) {
		for (const p of stroke.points) {
			if (p.x > right) right = p.x;
			if (p.y > bottom) bottom = p.y;
		}
	}
	return {
		width: Math.max(MIN_CANVAS_DIM, right + 4),
		height: Math.max(MIN_CANVAS_DIM, bottom + 4),
	};
}

function clampDimension(want: number, min: number, max: number): number {
	// min wins when min > max: the effective ceiling can never drop below the
	// floor, so a request is always clamped into [min, max(min, cappedMax)].
	const effectiveMax = Math.max(min, Math.min(max, MAX_CANVAS_DIM));
	// Rounded, not just clamped: a live resize drag divides a pointer delta by
	// the fit scale (rarely exactly 1), so `want` is routinely fractional. The
	// stored width/height must stay a whole number - the block header grammar
	// (`\d+x\d+`) has no room for a decimal point, and a fractional value
	// written there fails to parse on the very next read.
	return Math.round(Math.min(effectiveMax, Math.max(min, want)));
}

export function clampSize(want: Size, min: Size, max: Size): Size {
	return {
		width: clampDimension(want.width, min.width, max.width),
		height: clampDimension(want.height, min.height, max.height),
	};
}

// The draggable bounds for a resize: never below what the strokes need,
// never below the canvas's current size or the space available on screen
// (so it's never forced smaller just because the window is), and never
// above MAX_CANVAS_DIM.
export function resizeBounds(current: Size, strokes: Stroke[], available: Size): { min: Size; max: Size } {
	return {
		min: minSize(strokes),
		max: {
			width: Math.min(MAX_CANVAS_DIM, Math.max(current.width, available.width)),
			height: Math.min(MAX_CANVAS_DIM, Math.max(current.height, available.height)),
		},
	};
}
