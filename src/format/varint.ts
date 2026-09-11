export function writeUvarint(out: number[], n: number): void {
	let value = n >>> 0;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (value < 0x80) {
			out.push(value);
			return;
		}
		out.push((value & 0x7f) | 0x80);
		value = Math.floor(value / 128);
	}
}

export function writeSvarint(out: number[], n: number): void {
	const zigzag = ((n << 1) ^ (n >> 31)) >>> 0;
	writeUvarint(out, zigzag);
}

export class ByteReader {
	private readonly bytes: Uint8Array;
	private pos = 0;

	constructor(bytes: Uint8Array) {
		this.bytes = bytes;
	}

	uvarint(): number {
		let result = 0;
		let shift = 0;
		for (;;) {
			if (this.pos >= this.bytes.length) {
				throw new Error('truncated varint');
			}
			const byte = this.bytes[this.pos] as number;
			this.pos += 1;
			result += (byte & 0x7f) * 2 ** shift;
			if ((byte & 0x80) === 0) {
				return result;
			}
			shift += 7;
		}
	}

	svarint(): number {
		const zigzag = this.uvarint();
		return (zigzag >>> 1) ^ -(zigzag & 1);
	}

	done(): boolean {
		return this.pos >= this.bytes.length;
	}
}
