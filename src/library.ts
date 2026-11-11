import catalog from './assets/catalog.json';
import sourcePalettes from './assets/palettes.json';

export type CanvasSize = { width: number; height: number };
export type Role = 'main' | 'background';
export type Color = { r: number; g: number; b: number };
export type Palette = { name: string; colors: Color[] };
export type Asset = { id: string; name: string; role: Role; svg: string; custom?: true };
export type Settings = { assets: Asset[]; palettes: Palette[] };

const files = import.meta.glob<string>('./assets/*.svg', { eager: true, query: '?raw', import: 'default' });
export const builtins = catalog.map(asset => ({ ...asset, svg: files[`./assets/${asset.id}.svg`] })) as Asset[];
export const palettes: Palette[] = sourcePalettes;
export const dimensions = { S: 500, L: 1000 };

export function validDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export const svgUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

export function colorHex(color: Color) {
  return '#' + [color.r, color.g, color.b].map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Color {
  return { r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 };
}
