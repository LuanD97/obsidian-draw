export interface Point {
	x: number;
	y: number;
	p: number;
}

export interface Stroke {
	points: Point[];
}

export interface Drawing {
	version: 1;
	id: string;
	width: number;
	height: number;
	strokes: Stroke[];
}

export interface RawPoint {
	x: number;
	y: number;
	pressure: number;
}

export interface Size {
	width: number;
	height: number;
}
