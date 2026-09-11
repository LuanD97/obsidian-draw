import { encodePayload, decodePayload } from './codec';
import { DecodeError } from './errors';
import type { Drawing } from '../model/types';

export { DecodeError };

const LINE_RE = /^v(\d+);id=([0-9a-z]{8});(\d+)x(\d+);([A-Za-z0-9+/]*={0,2})$/;

export function formatBlockLine(d: Drawing): string {
	return `v${d.version};id=${d.id};${d.width}x${d.height};${encodePayload(d.strokes)}`;
}

export function parseBlockLine(line: string): Drawing {
	const trimmed = line.replace(/\s+$/, '');
	const match = LINE_RE.exec(trimmed);
	if (!match) {
		throw new DecodeError('malformed', 'block line does not match the v1 grammar');
	}
	const [, versionStr, id, widthStr, heightStr, payload] = match as unknown as [
		string,
		string,
		string,
		string,
		string,
		string,
	];

	const version = Number(versionStr);
	if (version !== 1) {
		throw new DecodeError('unsupported-version', `unsupported block version v${versionStr}`);
	}

	const width = Number(widthStr);
	const height = Number(heightStr);
	if (width < 64 || width > 4096 || height < 64 || height > 4096) {
		throw new DecodeError('malformed', 'size out of range');
	}

	const strokes = decodePayload(payload, width, height);

	return { version: 1, id, width, height, strokes };
}

export function newBlockMarkdown(d: Drawing): string {
	return '```ink\n' + formatBlockLine(d) + '\n```\n';
}
