import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { encodePayload, decodePayload } from '../../../src/format/codec';
import { writeUvarint, writeSvarint } from '../../../src/format/varint';
import { DecodeError } from '../../../src/format/errors';
import type { Stroke } from '../../../src/model/types';

const WIDTH = 700;
const HEIGHT = 260;

function u8ToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number);
	return btoa(binary);
}

describe('encodePayload / decodePayload round-trip', () => {
	it('empty strokes <-> empty string', () => {
		expect(encodePayload([])).toBe('');
		expect(decodePayload('', WIDTH, HEIGHT)).toEqual([]);
	});

	it('round-trips a single-point stroke', () => {
		const strokes: Stroke[] = [{ points: [{ x: 5, y: 6, p: 100 }] }];
		const payload = encodePayload(strokes);
		expect(payload.length).toBeGreaterThan(0);
		expect(decodePayload(payload, WIDTH, HEIGHT)).toEqual(strokes);
	});

	it('round-trips several multi-point strokes exactly', () => {
		const strokes: Stroke[] = [
			{
				points: [
					{ x: 0, y: 0, p: 10 },
					{ x: 10, y: 5, p: 120 },
					{ x: 3, y: 20, p: 255 },
				],
			},
			{
				points: [
					{ x: 700, y: 260, p: 0 },
					{ x: 690, y: 250, p: 1 },
				],
			},
			{ points: [{ x: 350, y: 130, p: 200 }] },
		];
		const payload = encodePayload(strokes);
		expect(decodePayload(payload, WIDTH, HEIGHT)).toEqual(strokes);
	});

	it('is deterministic: same input gives the same string', () => {
		const strokes: Stroke[] = [
			{
				points: [
					{ x: 1, y: 2, p: 3 },
					{ x: 4, y: 5, p: 6 },
				],
			},
		];
		expect(encodePayload(strokes)).toBe(encodePayload(strokes));
	});
});

describe('decodePayload rejects malformed input', () => {
	it('throws on invalid base64', () => {
		expect(() => decodePayload('!!!not-base64!!!', WIDTH, HEIGHT)).toThrow(DecodeError);
		try {
			decodePayload('!!!not-base64!!!', WIDTH, HEIGHT);
		} catch (e) {
			expect((e as DecodeError).kind).toBe('malformed');
		}
	});

	it('throws on a corrupt DEFLATE stream', () => {
		const garbage = u8ToBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
		expect(() => decodePayload(garbage, WIDTH, HEIGHT)).toThrow(DecodeError);
	});

	it('throws on trailing bytes after the last stroke', () => {
		const out: number[] = [];
		writeUvarint(out, 1); // strokeCount
		writeUvarint(out, 1); // pointCount
		writeSvarint(out, 1); // x0
		writeSvarint(out, 1); // y0
		writeUvarint(out, 100); // p0
		out.push(0xff, 0xff); // trailing garbage bytes
		const compressed = deflateSync(new Uint8Array(out));
		expect(() => decodePayload(u8ToBase64(compressed), WIDTH, HEIGHT)).toThrow(DecodeError);
	});

	it('throws on a truncated varint', () => {
		const out: number[] = [];
		writeUvarint(out, 1); // strokeCount
		out.push(0x80); // pointCount varint with continuation bit but no following byte
		const compressed = deflateSync(new Uint8Array(out));
		expect(() => decodePayload(u8ToBase64(compressed), WIDTH, HEIGHT)).toThrow(DecodeError);
	});

	it('throws on pointCount = 0', () => {
		const out: number[] = [];
		writeUvarint(out, 1); // strokeCount
		writeUvarint(out, 0); // pointCount = 0, invalid
		const compressed = deflateSync(new Uint8Array(out));
		expect(() => decodePayload(u8ToBase64(compressed), WIDTH, HEIGHT)).toThrow(DecodeError);
	});

	it('throws on pressure > 255', () => {
		const out: number[] = [];
		writeUvarint(out, 1);
		writeUvarint(out, 1);
		writeSvarint(out, 1);
		writeSvarint(out, 1);
		writeUvarint(out, 300); // pressure out of range
		const compressed = deflateSync(new Uint8Array(out));
		expect(() => decodePayload(u8ToBase64(compressed), WIDTH, HEIGHT)).toThrow(DecodeError);
	});

	it('throws on coordinates outside [0,width] x [0,height]', () => {
		const out: number[] = [];
		writeUvarint(out, 1);
		writeUvarint(out, 1);
		writeSvarint(out, WIDTH + 50); // x0 out of range
		writeSvarint(out, 1);
		writeUvarint(out, 100);
		const compressed = deflateSync(new Uint8Array(out));
		expect(() => decodePayload(u8ToBase64(compressed), WIDTH, HEIGHT)).toThrow(DecodeError);
	});
});
