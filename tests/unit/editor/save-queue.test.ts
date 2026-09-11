import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveQueue } from '../../../src/editor/save-queue';
import type { SaveOutcome } from '../../../src/editor/save-queue';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const UPDATED: SaveOutcome = { kind: 'updated' };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('SaveQueue', () => {
	it('saves once, 500ms after the last schedule call, with the latest line', async () => {
		const save = vi.fn(async (): Promise<SaveOutcome> => UPDATED);
		const onOutcome = vi.fn();
		const queue = new SaveQueue(save, { debounceMs: 500, onOutcome });

		queue.schedule('line1');
		await vi.advanceTimersByTimeAsync(200);
		queue.schedule('line2'); // resets the debounce timer

		await vi.advanceTimersByTimeAsync(499);
		expect(save).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith('line2');
	});

	it('flush() saves immediately and cancels the pending timer', async () => {
		const save = vi.fn(async (): Promise<SaveOutcome> => UPDATED);
		const onOutcome = vi.fn();
		const queue = new SaveQueue(save, { debounceMs: 500, onOutcome });

		queue.schedule('lineX');
		const result = await queue.flush();

		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith('lineX');
		expect(result).toEqual(UPDATED);

		await vi.advanceTimersByTimeAsync(1000);
		expect(save).toHaveBeenCalledTimes(1); // the cancelled timer never fires
	});

	it('coalesces a schedule that arrives during an in-flight save into exactly one follow-up save', async () => {
		const pending: { resolve: (o: SaveOutcome) => void }[] = [];
		const save = vi.fn(
			() =>
				new Promise<SaveOutcome>((resolve) => {
					pending.push({ resolve });
				}),
		);
		const onOutcome = vi.fn();
		const queue = new SaveQueue(save, { debounceMs: 500, onOutcome });

		queue.schedule('first');
		await vi.advanceTimersByTimeAsync(500);
		expect(save).toHaveBeenCalledTimes(1); // 'first' is now in flight, unresolved

		queue.schedule('second');
		queue.schedule('third'); // debounce coalesces to a single pending line
		await vi.advanceTimersByTimeAsync(500);
		expect(save).toHaveBeenCalledTimes(1); // still just the in-flight save; 'third' is queued

		pending[0]?.resolve(UPDATED);
		await vi.advanceTimersByTimeAsync(0);

		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith('third');
	});

	it('flush() waits for an in-flight save to complete', async () => {
		const { promise, resolve } = deferred<SaveOutcome>();
		const save = vi.fn(async (): Promise<SaveOutcome> => promise);
		const onOutcome = vi.fn();
		const queue = new SaveQueue(save, { debounceMs: 500, onOutcome });

		queue.schedule('line');
		await vi.advanceTimersByTimeAsync(500); // save is now in flight

		const flushPromise = queue.flush();
		let settled = false;
		void flushPromise.then(() => {
			settled = true;
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toBe(false); // still waiting on the in-flight save

		resolve(UPDATED);
		const result = await flushPromise;
		expect(result).toEqual(UPDATED);
	});

	it('flush() with nothing pending resolves null', async () => {
		const save = vi.fn(async (): Promise<SaveOutcome> => UPDATED);
		const onOutcome = vi.fn();
		const queue = new SaveQueue(save, { debounceMs: 500, onOutcome });

		expect(await queue.flush()).toBeNull();
		expect(save).not.toHaveBeenCalled();
	});

	it('calls onOutcome after every save, both debounced and flushed', async () => {
		const outcomes: SaveOutcome[] = [{ kind: 'updated' }, { kind: 'unchanged' }];
		let call = 0;
		const save = vi.fn(async (): Promise<SaveOutcome> => outcomes[call++] as SaveOutcome);
		const onOutcome = vi.fn();
		const queue = new SaveQueue(save, { debounceMs: 500, onOutcome });

		queue.schedule('a');
		await vi.advanceTimersByTimeAsync(500);
		expect(onOutcome).toHaveBeenCalledWith(outcomes[0]);

		queue.schedule('b');
		await queue.flush();
		expect(onOutcome).toHaveBeenCalledWith(outcomes[1]);
		expect(onOutcome).toHaveBeenCalledTimes(2);
	});
});
