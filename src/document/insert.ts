export function insertionText(currentLine: string, blockMarkdown: string): string {
	return currentLine === '' ? blockMarkdown : '\n' + blockMarkdown;
}
