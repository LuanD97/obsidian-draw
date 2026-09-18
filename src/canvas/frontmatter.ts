const KEY = 'canvas-mode';

export function isCanvasModeEnabled(frontmatter: Record<string, unknown> | null | undefined): boolean {
	return frontmatter?.[KEY] === true;
}

export function setCanvasModeEnabled(frontmatter: Record<string, unknown>, enabled: boolean): void {
	frontmatter[KEY] = enabled;
}
