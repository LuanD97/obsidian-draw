import { describe, expect, it } from 'vitest';
import { writeUvarint, writeSvarint, ByteReader } from '../../../src/format/varint';

function roundTripUvarint(n: number): number {
	const out: number[] = [];
	writeUvarint(out, n);
	const reader = new ByteReader(new Uint8Array(out));
	return reader.uvarint();
}

function roundTripSvarint(n: number): number {
	const out: number[] = [];
	writeSvarint(out, n);
	const reader = new ByteReader(new Uint8Array(out));
	return reader.svarint();
}

describe('uvarint round-trip', () => {
	it.each([0, 1, 127, 128, 16383, 16384, 2 ** 31 - 1])('round-trips %i', (n) => {
		expect(roundTripUvarint(n)).toBe(n);
	});
});

describe('svarint round-trip', () => {
	it.each([0, -1, 1, -64, 63, -(2 ** 30), 2 ** 30 - 1])('round-trips %i', (n) => {
		expect(roundTripSvarint(n)).toBe(n);
	});
});

describe('zigzag mapping', () => {
	function zigzagFirstByte(n: number): number {
		const out: number[] = [];
		writeSvarint(out, n);
		// single-byte varints encode the zigzag value directly when < 128
		return out[0] as number;
	}

	it('maps 0 -> 0', () => {
		expect(zigzagFirstByte(0)).toBe(0);
	});

	it('maps -1 -> 1', () => {
		expect(zigzagFirstByte(-1)).toBe(1);
	});

	it('maps 1 -> 2', () => {
		expect(zigzagFirstByte(1)).toBe(2);
	});

	it('maps -64 -> 127 (single byte, boundary)', () => {
		expect(zigzagFirstByte(-64)).toBe(127);
	});

	it('maps 63 -> 126 (single byte, boundary)', () => {
		expect(zigzagFirstByte(63)).toBe(126);
	});

	it('round-trips -2^30 through the zigzag mapping', () => {
		expect(roundTripSvarint(-(2 ** 30))).toBe(-(2 ** 30));
	});
});

describe('ByteReader', () => {
	it('throws on a truncated varint', () => {
		// 0x80 alone has the continuation bit set with no following byte
		const reader = new ByteReader(new Uint8Array([0x80]));
		expect(() => reader.uvarint()).toThrow();
	});

	it('done() is false until all bytes are read, then true', () => {
		const out: number[] = [];
		writeUvarint(out, 300);
		writeUvarint(out, 1);
		const reader = new ByteReader(new Uint8Array(out));
		expect(reader.done()).toBe(false);
		reader.uvarint();
		expect(reader.done()).toBe(false);
		reader.uvarint();
		expect(reader.done()).toBe(true);
	});
});
