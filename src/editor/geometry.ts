export function toCanvasPoint(
	client: { x: number; y: number },
	surfaceRect: { left: number; top: number },
	scale: number,
): { x: number; y: number } {
	return {
		x: (client.x - surfaceRect.left) / scale,
		y: (client.y - surfaceRect.top) / scale,
	};
}
