const formats = {
  square: [1080, 1080],
  landscape: [1600, 900],
  portrait: [900, 1600],
};

const compositionKey = 'illustration-composition';

figma.showUI(__html__, { width: 360, height: 510, themeColors: true });

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function findComponents(names) {
  const components = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] });
  return names.map((name) => {
    const matches = components.filter((component) => normalizeName(component.name) === normalizeName(name));
    if (matches.length === 0) throw new Error('Компонент не найден на текущей странице: ' + name);
    if (matches.length > 1) throw new Error('На странице несколько компонентов с именем «' + name + '». Задайте им уникальные имена.');
    return matches[0];
  });
}

function compose(names, format) {
  if (!Object.hasOwn(formats, format)) throw new Error('Выберите формат.');
  if (!names.length) throw new Error('Укажите хотя бы один компонент.');

  const components = findComponents(names);
  const [width, height] = formats[format];
  const columns = Math.min(components.length, Math.ceil(Math.sqrt(components.length * width / height)));
  const rows = Math.ceil(components.length / columns);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const frame = figma.createFrame();

  try {
    frame.name = 'Композиция ' + width + ' × ' + height;
    frame.resizeWithoutConstraints(width, height);
    frame.fills = [];
    frame.clipsContent = false;
    frame.x = Math.round(figma.viewport.center.x - width / 2);
    frame.y = Math.round(figma.viewport.center.y - height / 2);

    components.forEach((component, index) => {
      const instance = component.createInstance();
      frame.appendChild(instance);

      const scale = Math.min(
        cellWidth * 0.8 / instance.width,
        cellHeight * 0.8 / instance.height,
        1,
      );
      if (scale < 1) instance.rescale(scale);

      const row = Math.floor(index / columns);
      const column = index % columns;
      const countInRow = Math.min(columns, components.length - row * columns);
      const rowInset = (columns - countInRow) * cellWidth / 2;
      instance.x = rowInset + column * cellWidth + (cellWidth - instance.width) / 2;
      instance.y = row * cellHeight + (cellHeight - instance.height) / 2;
    });

    frame.setPluginData(compositionKey, '1');
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

async function exportComposition() {
  const selection = figma.currentPage.selection;
  const frame = selection[0];
  if (selection.length !== 1 || frame.type !== 'FRAME' || frame.getPluginData(compositionKey) !== '1') {
    throw new Error('Выделите один фрейм, созданный плагином.');
  }
  const svg = await frame.exportAsync({ format: 'SVG_STRING', svgIdAttribute: true });
  figma.ui.postMessage({ type: 'svg', svg });
}

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === 'compose') {
      const names = message.names.split('\n').map((name) => name.trim()).filter(Boolean);
      compose(names, message.format);
      figma.ui.postMessage({ type: 'status', text: 'Композиция создана.' });
    }
    if (message.type === 'export') await exportComposition();
  } catch (error) {
    figma.ui.postMessage({
      type: 'status',
      text: error instanceof Error ? error.message : String(error),
      error: true,
    });
  }
};
