import { builtins, colorHex, palettes, validDimension, type Asset, type CanvasSize, type Palette, type Role, type Settings } from './library';
import { compositionStyles, sceneLayout } from './layout';
import { tkbkPlan } from './planner';
import confetti from './assets/backdrop-confetti.svg?raw';
import diagonal from './assets/backdrop-diagonal.svg?raw';

figma.showUI(__html__, { width: 420, height: 610, themeColors: true });

const storageKey = 'composer-library-v2';
const apiKeyStorageKey = 'composer-tkbk-api-key';
const frameKey = 'illustration-composition';
const saved = figma.clientStorage.getAsync(storageKey).then((value): Settings => value ?? { assets: [], palettes: [] });

function send(type: string, data: object = {}) {
  figma.ui.postMessage({ type, ...data });
}

function validateSvg(svg: string) {
  if (typeof svg !== 'string' || svg.length > 250_000 ||
      /<!doctype|<!entity|<\s*(?:[\w.-]+:)?(?:image|feimage|script|foreignobject)\b/i.test(svg)) {
    throw new Error('Нужен векторный SVG размером до 250 КБ.');
  }
}

function recolor(node: SceneNode, role: Role, palette: Palette, source = palettes[0], customBackground = false) {
  const allowed = source.colors.slice(0, role === 'background' ? 4 : 8).map(colorHex);
  const lightness = ({ r, g, b }: RGB) => .2126 * r + .7152 * g + .0722 * b;
  const tones = palette.colors.slice(0, 4).sort((a, b) => lightness(a) - lightness(b));
  const backgroundColor = (color: RGB) => tones[Math.round(lightness(color) * (tones.length - 1))];
  function replace(paints: readonly Paint[]): Paint[] {
    return paints.map(paint => {
      if (customBackground && paint.type === 'SOLID') return { ...paint, color: backgroundColor(paint.color) };
      if (customBackground && 'gradientStops' in paint) {
        return { ...paint, gradientStops: paint.gradientStops.map(stop =>
          ({ ...stop, color: { ...backgroundColor(stop.color), a: stop.color.a } })) };
      }
      if (paint.type !== 'SOLID') return paint;
      const index = allowed.indexOf(colorHex(paint.color));
      return index < 0 ? paint : { ...paint, color: palette.colors[index] };
    });
  }
  if ('fills' in node && node.fills !== figma.mixed) node.fills = replace(node.fills);
  if ('strokes' in node) node.strokes = replace(node.strokes);
  if ('children' in node) node.children.forEach(child => recolor(child, role, palette, source, customBackground));
}

function compose(brief: string, canvas: CanvasSize, palette: Palette, plan: string[], assets: Asset[], variation: number) {
  if (!validDimension(canvas?.width) || !validDimension(canvas?.height)) {
    throw new Error('Ширина и высота должны быть целыми положительными числами.');
  }
  if (!Array.isArray(plan) || !plan.length || plan.length > 3 || new Set(plan).size !== plan.length) {
    throw new Error('План композиции пуст или некорректен.');
  }
  const layers = plan.map(id => {
    const asset = assets.find(entry => entry.id === id);
    if (!asset) throw new Error('План содержит недоступный объект.');
    return asset;
  });
  layers.sort((a, b) => Number(a.role === 'main') - Number(b.role === 'main'));
  const { width, height } = canvas;
  const frame = figma.createFrame();
  try {
    frame.name = brief.slice(0, 100) + ' · ' + width + ' × ' + height;
    frame.resizeWithoutConstraints(width, height);
    frame.fills = [{ type: 'SOLID', color: palette.colors[0] }];
    frame.clipsContent = true;
    frame.x = Math.round(figma.viewport.center.x - width / 2);
    frame.y = Math.round(figma.viewport.center.y - height / 2);
    const objects = layers.map(asset => {
      const node = figma.createNodeFromSvg(asset.svg);
      frame.appendChild(node);
      node.name = asset.name;
      recolor(node, asset.role, palette, palettes[0], asset.custom === true && asset.role === 'background');
      return { node, id: asset.id, role: asset.role, width: node.width, height: node.height };
    });
    const layout = sceneLayout(canvas, objects, variation);
    const useDiagonal = layout.backdrop === 'diagonal';
    const backdrop = figma.createNodeFromSvg(useDiagonal ? diagonal : confetti);
    frame.insertChild(0, backdrop);
    backdrop.name = 'Фон композиции';
    recolor(backdrop, 'background', palette, palettes[useDiagonal ? 1 : 0]);
    backdrop.rescale(Math.max(width / backdrop.width, height / backdrop.height));
    backdrop.x = (width - backdrop.width) / 2;
    backdrop.y = (height - backdrop.height) / 2;
    objects.forEach(({ node }, index) => {
      const [x, y] = layout.anchors[index];
      node.rescale(layout.scale);
      node.x = width * x - node.width / 2;
      node.y = height * y - node.height / 2;
    });
    frame.setPluginData(frameKey, '1');
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

let busy = false;
let previous: { brief: string; plan: string[]; variation: number } | undefined;
figma.ui.onmessage = async message => {
  if (busy) return;
  busy = true;
  try {
    const settings = await saved;
    switch (message.type) {
      case 'init': {
        try {
          const key: unknown = await figma.clientStorage.getAsync(apiKeyStorageKey);
          send('settings', { settings, apiKey: typeof key === 'string' ? key : '' });
        } catch {
          send('settings', { settings, status: 'Не удалось прочитать сохранённый ключ. Введите его вручную.' });
        }
        break;
      }
      case 'save-api-key': {
        if (typeof message.key !== 'string') throw new Error('Некорректный API-ключ.');
        const key = message.key.trim();
        try {
          if (key) await figma.clientStorage.setAsync(apiKeyStorageKey, key);
          else await figma.clientStorage.deleteAsync(apiKeyStorageKey);
        } catch {
          throw new Error(key ? 'Не удалось сохранить ключ на этом устройстве.' : 'Не удалось удалить сохранённый ключ.');
        }
        send('api-key', { apiKey: key, status: key ? 'Ключ сохранён на этом устройстве.' : 'Сохранённый ключ удалён.' });
        break;
      }
      case 'add-assets': {
        const entries = message.assets as Asset[];
        for (const asset of entries) validateSvg(asset.svg);
        const assets = [...settings.assets, ...entries];
        await figma.clientStorage.setAsync(storageKey, { ...settings, assets });
        settings.assets = assets;
        send('settings', { settings, status: 'SVG добавлены в библиотеку.' });
        break;
      }
      case 'remove-asset': {
        const assets = settings.assets.filter(asset => asset.id !== message.id);
        await figma.clientStorage.setAsync(storageKey, { ...settings, assets });
        settings.assets = assets;
        send('settings', { settings, status: 'SVG удалён из библиотеки.' });
        break;
      }
      case 'set-asset-role': {
        const { id, role } = message;
        if (role !== 'main' && role !== 'background') throw new Error('Выберите роль объекта.');
        if (!settings.assets.some(asset => asset.id === id && asset.custom)) throw new Error('SVG не найден.');
        const assets = settings.assets.map(asset => asset.id === id && asset.custom ? { ...asset, role: role as Role } : asset);
        await figma.clientStorage.setAsync(storageKey, { ...settings, assets });
        settings.assets = assets;
        send('settings', { settings, status: 'Роль SVG сохранена.' });
        break;
      }
      case 'add-palette': {
        const next = [...settings.palettes, message.palette as Palette];
        await figma.clientStorage.setAsync(storageKey, { ...settings, palettes: next });
        settings.palettes = next;
        send('settings', { settings, paletteIndex: palettes.length + next.length - 1, status: 'Палитра сохранена.' });
        break;
      }
      case 'compose': {
        const palette = [...palettes, ...settings.palettes][message.palette];
        if (!palette) throw new Error('Выберите палитру.');
        const { brief, canvas, key } = message;
        if (typeof brief !== 'string' || !brief.trim() || brief.length > 600 ||
            !validDimension(canvas?.width) || !validDimension(canvas?.height)) {
          throw new Error('Проверьте метафору и размеры холста.');
        }
        if (typeof key !== 'string' || !key.trim()) throw new Error('Введите API-ключ TKBK.');
        const assets = [...builtins, ...settings.assets];
        const briefKey = brief.trim().toLowerCase();
        const last = previous?.brief === briefKey ? previous : undefined;
        const count = compositionStyles.length;
        const variation = last
          ? (last.variation + 1 + Math.floor(Math.random() * (count - 1))) % count
          : Math.floor(Math.random() * count);
        const plan = await tkbkPlan(brief, assets, key.trim(), canvas, compositionStyles[variation], last?.plan);
        send('progress', { status: 'Составляем композицию…' });
        compose(brief, canvas, palette, plan, assets, variation);
        previous = { brief: briefKey, plan, variation };
        send('done', { status: 'Композиция появилась на холсте.' });
        break;
      }
      case 'export': {
        const [frame] = figma.currentPage.selection;
        if (figma.currentPage.selection.length !== 1 || frame.type !== 'FRAME' || frame.getPluginData(frameKey) !== '1') {
          throw new Error('Выберите один фрейм композиции на холсте.');
        }
        const svg = await frame.exportAsync({ format: 'SVG_STRING', svgIdAttribute: true });
        if (/<(?:[\w.-]+:)?(?:image|feimage)\b/i.test(svg)) throw new Error('Композиция содержит растровый слой.');
        send('exported', { svg });
        break;
      }
    }
  } catch (error) {
    send('error', { status: error instanceof Error ? error.message : 'Не удалось выполнить действие.' });
  } finally {
    busy = false;
  }
};
