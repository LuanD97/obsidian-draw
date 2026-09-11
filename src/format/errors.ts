export type DecodeErrorKind = 'malformed' | 'unsupported-version';

export class DecodeError extends Error {
	kind: DecodeErrorKind;

	constructor(kind: DecodeErrorKind, message: string) {
		super(message);
		this.kind = kind;
		this.name = 'DecodeError';
	}
}
