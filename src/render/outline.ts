import { getStroke } from 'perfect-freehand';
import type { Stroke } from '../model/types';

const STROKE_OPTIONS = {
	size: 3,
	thinning: 0.6,
	smoothing: 0.5,
	streamline: 0.5,
	simulatePressure: false,
};

// The standard perfect-freehand SVG conversion: a closed path through the
// midpoints of the outline polygon, smoothed with quadratic curves.
function outlineToPath(points: number[][]): string {
	if (points.length === 0) return '';
	if (points.length === 1) {
		const [x, y] = points[0] as number[];
		return `M ${x} ${y} Z`;
	}

	const first = points[0] as number[];
	const d = points.reduce(
		(acc, point, i, arr) => {
			const next = arr[(i + 1) % arr.length] as number[];
			const [x0, y0] = point;
			const [x1, y1] = next;
			acc.push(
				String(x0),
				String(y0),
				String((x0 as number + (x1 as number)) / 2),
				String((y0 as number + (y1 as number)) / 2),
			);
			return acc;
		},
		['M', String(first[0]), String(first[1]), 'Q'],
	);
	d.push('Z');
	return d.join(' ');
}

export function strokeOutlinePath(stroke: Stroke): string {
	const input = stroke.points.map((pt) => [pt.x, pt.y, pt.p / 255]);
	const outline = getStroke(input, STROKE_OPTIONS);
	return outlineToPath(outline);
}
