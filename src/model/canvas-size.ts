import type { Size } from './types';

const DEFAULT_WIDTH = 700;
const DEFAULT_HEIGHT = 260;
const MIN_DEFAULT_WIDTH = 200;
const MAX_DEFAULT_WIDTH = 2000;

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
