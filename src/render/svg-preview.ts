import { strokeOutlinePath } from './outline';
import type { Drawing } from '../model/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildPreviewSvg(doc: Document, d: Drawing): SVGSVGElement {
	const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
	svg.classList.add('ink-preview-svg');
	svg.setAttribute('viewBox', `0 0 ${d.width} ${d.height}`);
	svg.style.width = '100%';
	svg.style.maxWidth = `${d.width}px`;

	for (const stroke of d.strokes) {
		const path = doc.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', strokeOutlinePath(stroke));
		path.setAttribute('fill', 'currentColor');
		svg.appendChild(path);
	}

	return svg;
}
