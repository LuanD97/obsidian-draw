export interface SaveOutcome {
	kind: 'updated' | 'unchanged' | 'not-found' | 'duplicate' | 'file-missing';
}

export interface Timers {
	setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaultTimers: Timers = {
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (handle) => clearTimeout(handle),
};

export class SaveQueue {
	private readonly save: (line: string) => Promise<SaveOutcome>;
	private readonly debounceMs: number;
	private readonly onOutcome: (o: SaveOutcome) => void;
	private readonly timers: Timers;

	private timerHandle: ReturnType<typeof setTimeout> | null = null;
	private timerLine: string | null = null;
	private activeChain: Promise<SaveOutcome> | null = null;
	private nextLine: string | null = null;

	constructor(
		save: (line: string) => Promise<SaveOutcome>,
		opts: { debounceMs: number; onOutcome: (o: SaveOutcome) => void; timers?: Timers },
	) {
		this.save = save;
		this.debounceMs = opts.debounceMs;
		this.onOutcome = opts.onOutcome;
		this.timers = opts.timers ?? defaultTimers;
	}

	schedule(line: string): void {
		this.timerLine = line;
		if (this.timerHandle !== null) {
			this.timers.clearTimeout(this.timerHandle);
		}
		this.timerHandle = this.timers.setTimeout(() => {
			this.timerHandle = null;
			const l = this.timerLine as string;
			this.timerLine = null;
			this.trigger(l);
		}, this.debounceMs);
	}

	async flush(): Promise<SaveOutcome | null> {
		if (this.timerHandle !== null) {
			this.timers.clearTimeout(this.timerHandle);
			this.timerHandle = null;
			const l = this.timerLine;
			this.timerLine = null;
			if (l !== null) this.trigger(l);
		}

		if (!this.activeChain) return null;

		let lastOutcome: SaveOutcome | null = null;
		while (this.activeChain) {
			lastOutcome = await this.activeChain;
		}
		return lastOutcome;
	}

	private trigger(line: string): void {
		if (this.activeChain) {
			this.nextLine = line;
			return;
		}
		this.activeChain = this.runOne(line);
	}

	private runOne(line: string): Promise<SaveOutcome> {
		const run: Promise<SaveOutcome> = this.save(line).then((outcome) => {
			this.onOutcome(outcome);
			return outcome;
		});
		run.finally(() => {
			if (this.activeChain !== run) return;
			if (this.nextLine !== null) {
				const next = this.nextLine;
				this.nextLine = null;
				this.activeChain = this.runOne(next);
			} else {
				this.activeChain = null;
			}
		});
		return run;
	}
}
