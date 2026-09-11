import { deflateSync, inflateSync } from 'fflate';
import { writeUvarint, writeSvarint, ByteReader } from './varint';
import { DecodeError } from './errors';
import type { Stroke } from '../model/types';

function bytesToBase64(bytes: Uint8Array): string {
	const CHUNK = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		const chunk = bytes.subarray(i, i + CHUNK);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	let binary: string;
	try {
		binary = atob(base64);
	} catch {
		throw new DecodeError('malformed', 'payload is not valid base64');
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function encodePayload(strokes: Stroke[]): string {
	if (strokes.length === 0) return '';

	const out: number[] = [];
	writeUvarint(out, strokes.length);
	for (const stroke of strokes) {
		writeUvarint(out, stroke.points.length);
		const [first, ...rest] = stroke.points;
		const p0 = first as { x: number; y: number; p: number };
		writeSvarint(out, p0.x);
		writeSvarint(out, p0.y);
		writeUvarint(out, p0.p);
		let prevX = p0.x;
		let prevY = p0.y;
		let prevP = p0.p;
		for (const point of rest) {
			writeSvarint(out, point.x - prevX);
			writeSvarint(out, point.y - prevY);
			writeSvarint(out, point.p - prevP);
			prevX = point.x;
			prevY = point.y;
			prevP = point.p;
		}
	}

	const compressed = deflateSync(new Uint8Array(out), { level: 9 });
	return bytesToBase64(compressed);
}

export function decodePayload(payload: string, width: number, height: number): Stroke[] {
	if (payload === '') return [];

	const compressed = base64ToBytes(payload);

	let raw: Uint8Array;
	try {
		raw = inflateSync(compressed);
	} catch {
		throw new DecodeError('malformed', 'payload is not a valid DEFLATE stream');
	}

	try {
		const reader = new ByteReader(raw);
		const strokeCount = reader.uvarint();
		const strokes: Stroke[] = [];
		for (let s = 0; s < strokeCount; s++) {
			const pointCount = reader.uvarint();
			if (pointCount < 1) {
				throw new DecodeError('malformed', 'stroke has zero points');
			}
			let x = reader.svarint();
			let y = reader.svarint();
			let p = reader.uvarint();
			assertPoint(x, y, p, width, height);
			const points = [{ x, y, p }];
			for (let i = 1; i < pointCount; i++) {
				x += reader.svarint();
				y += reader.svarint();
				p += reader.svarint();
				assertPoint(x, y, p, width, height);
				points.push({ x, y, p });
			}
			strokes.push({ points });
		}
		if (!reader.done()) {
			throw new DecodeError('malformed', 'trailing bytes after the last stroke');
		}
		return strokes;
	} catch (e) {
		if (e instanceof DecodeError) throw e;
		throw new DecodeError('malformed', 'payload failed to parse');
	}
}

function assertPoint(x: number, y: number, p: number, width: number, height: number): void {
	if (p < 0 || p > 255) {
		throw new DecodeError('malformed', 'pressure out of range');
	}
	if (x < 0 || x > width || y < 0 || y > height) {
		throw new DecodeError('malformed', 'coordinate out of range');
	}
}
