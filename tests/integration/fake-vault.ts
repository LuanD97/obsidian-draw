export interface TFileLike {
	path: string;
}

export class FakeVault {
	private files = new Map<string, string>();

	constructor(initial: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initial)) {
			this.files.set(path, content);
		}
	}

	async process(file: TFileLike, fn: (data: string) => string): Promise<string> {
		const current = this.files.get(file.path);
		if (current === undefined) {
			throw new Error(`file not found: ${file.path}`);
		}
		const next = fn(current);
		this.files.set(file.path, next);
		return next;
	}

	read(path: string): string | undefined {
		return this.files.get(path);
	}

	remove(path: string): void {
		this.files.delete(path);
	}
}
