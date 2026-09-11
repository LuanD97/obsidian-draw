export type PointerAction = 'draw' | 'ignore' | 'end';

export function classifyPointer(e: { type: string; pointerType: string; buttons: number }): PointerAction {
	if (e.pointerType !== 'pen') return 'ignore';

	if (e.type === 'pointerup' || e.type === 'pointercancel') return 'end';

	if (e.type === 'pointerdown' || e.type === 'pointermove') {
		return e.buttons > 0 ? 'draw' : 'ignore';
	}

	return 'ignore';
}
