/** Empty audio hooks. Called from real gameplay sites. No assets, no mixer UI. */

export function stroke() {}
export function grow() {}
export function land() {}
export function leave() {}
export function tideChange() {}
export function ambient() {}

export const audio = { stroke, grow, land, leave, tideChange, ambient };
export const HOOKS = ['stroke', 'grow', 'land', 'leave', 'tideChange', 'ambient'];
