const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 8;
// 252 = 7 * 36: the largest multiple of 36 that fits in a byte, so
// `byte % 36` is uniform over the alphabet with no modulo bias.
const REJECTION_CEILING = 252;

function defaultRandom(n: number): Uint8Array {
	const out = new Uint8Array(n);
	crypto.getRandomValues(out);
	return out;
}

export function generateId(random: (n: number) => Uint8Array = defaultRandom): string {
	let id = '';
	for (let i = 0; i < ID_LENGTH; i++) {
		let byte: number;
		do {
			byte = (random(1)[0] as number) & 0xff;
		} while (byte >= REJECTION_CEILING);
		id += ALPHABET[byte % 36];
	}
	return id;
}
