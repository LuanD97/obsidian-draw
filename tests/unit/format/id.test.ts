import { describe, expect, it } from 'vitest';
import { generateId } from '../../../src/format/id';

describe('generateId', () => {
	it('returns 8 characters matching [0-9a-z]{8}', () => {
		const id = generateId();
		expect(id).toMatch(/^[0-9a-z]{8}$/);
	});

	it('is deterministic with an injected random source', () => {
		// One byte requested per character; values < 252 so nothing is rejected.
		const queue = [0, 1, 9, 10, 35, 20, 5, 30];
		function makeRandom(): (n: number) => Uint8Array {
			let i = 0;
			return (n: number) => {
				const out = new Uint8Array(n);
				for (let k = 0; k < n; k++) {
					out[k] = queue[i % queue.length] as number;
					i += 1;
				}
				return out;
			};
		}
		expect(generateId(makeRandom())).toBe(generateId(makeRandom()));
		expect(generateId(makeRandom())).toMatch(/^[0-9a-z]{8}$/);
	});

	it('maps byte values to the expected base-36 characters', () => {
		const bytes = [0, 1, 9, 10, 35, 71, 179, 251];
		let i = 0;
		const random = (n: number) => {
			const out = new Uint8Array(n);
			for (let k = 0; k < n; k++) out[k] = bytes[i++] as number;
			return out;
		};
		// 0->'0', 1->'1', 9->'9', 10->'a', 35->'z', 71%36=35->'z', 179%36=35->'z', 251%36=35->'z'
		expect(generateId(random)).toBe('019azzzz');
	});

	it('rejects bytes >= 252 and redraws without modulo bias', () => {
		// First byte is drawn as 252 (rejected), 253 (rejected), then 0 (accepted -> '0').
		// Remaining 7 bytes are accepted immediately.
		const sequence = [252, 253, 0, 0, 0, 0, 0, 0, 0, 0];
		let i = 0;
		let calls = 0;
		const random = (n: number) => {
			calls += 1;
			const out = new Uint8Array(n);
			for (let k = 0; k < n; k++) out[k] = sequence[i++] as number;
			return out;
		};
		const id = generateId(random);
		expect(id).toBe('00000000');
		expect(calls).toBeGreaterThan(8); // proves the two rejected draws triggered redraws
	});

	it('generates 10,000 unique ids', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 10000; i++) {
			ids.add(generateId());
		}
		expect(ids.size).toBe(10000);
	});
});
