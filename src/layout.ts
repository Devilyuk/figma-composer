import type { CanvasSize, Role } from './library';

type Anchor = readonly [x: number, y: number];
type Scene = {
  scale: number;
  backdrop: 'confetti' | 'diagonal';
  objects: Readonly<Record<string, Anchor>>;
  wide: Readonly<Record<string, Anchor>>;
};

const referenceScenes: readonly Scene[] = [
  {
    scale: 1, backdrop: 'confetti',
    objects: { '1-8636': [.47, .61], '1-8383': [.61, .31] },
    wide: { '1-8636': [.42, .61], '1-8383': [.76, .33] },
  },
  {
    scale: .97, backdrop: 'diagonal',
    objects: { '1-8528': [.23, .43], '1-8636': [.54, .45] },
    wide: { '1-8528': [.28, .36], '1-8636': [.70, .40] },
  },
  {
    scale: .94, backdrop: 'diagonal',
    objects: { '1-9398': [.65, .33], '1-9174': [.15, .72], '1-9444': [.63, .79] },
    wide: { '1-9398': [.66, .24], '1-9174': [.15, .70], '1-9444': [.59, .78] },
  },
  {
    scale: 1.06, backdrop: 'confetti',
    objects: { '1-8948': [.66, .65], '1-9866': [.25, .18] },
    wide: { '1-8948': [.69, .67], '1-9866': [.19, .16] },
  },
  {
    scale: .98, backdrop: 'diagonal',
    objects: { '1-9174': [.52, .72], '1-9444': [.78, .53], '1-9146': [.17, .10] },
    wide: { '1-9174': [.56, .76], '1-9444': [.82, .35], '1-9146': [.20, .08] },
  },
  {
    scale: 1, backdrop: 'diagonal',
    objects: { '1-8383': [.34, .25], '1-9348': [.38, .77], '1-8582': [.64, .46] },
    wide: { '1-8383': [.47, .21], '1-9348': [.24, .74], '1-8582': [.63, .43] },
  },
];

export const compositionStyles = [
  'Prefer a clear focal object and one complementary detail.',
  'Look for a secondary interpretation of the metaphor with a contrasting supporting object.',
  'Prefer a minimal scene with strong visual focus and only necessary support.',
  'Look for a narrative pairing that shows a relationship between the objects.',
] as const;

export function sceneLayout(canvas: CanvasSize, objects: (CanvasSize & { id: string; role: Role; focus: boolean })[],
  variation: number, random = Math.random) {
  const scene = referenceScenes.find(candidate => Object.keys(candidate.objects).length === objects.length &&
    objects.every(object => Object.prototype.hasOwnProperty.call(candidate.objects, object.id)));
  const shortSide = Math.min(canvas.width, canvas.height);
  const cropSize = Math.min(Math.sqrt(canvas.width * canvas.height), shortSide * 1.35);
  let anchors: Anchor[];
  let scale: number;
  if (scene) {
    const spread = Math.max(0, Math.min(1, (canvas.width / canvas.height - 1) / .8));
    anchors = objects.map(({ id }): Anchor => {
      const [x, y] = scene.objects[id];
      const [wideX, wideY] = scene.wide[id];
      return [x + (wideX - x) * spread, y + (wideY - y) * spread];
    });
    scale = scene.scale * cropSize / 1000;
  } else {
    const main = objects.filter(object => object.role === 'main');
    const extent = Math.max(...objects.map(object => Math.max(object.width, object.height) * (object.role === 'main' ? 1 : .8)));
    scale = cropSize * .84 / extent;
    const foreground: Anchor[] = main.length <= 1 ? [[.58, .56]] : [[.38, .60], [.72, .32], [.75, .75]];
    const background: Anchor[] = [[.22, .18], [.84, .80]];
    let mainIndex = 0;
    let backgroundIndex = 0;
    anchors = objects.map(object => object.role === 'main' ? foreground[mainIndex++] : background[backgroundIndex++]);
  }

  scale = Math.min(scale * (.93 + random() * .24),
    ...objects.map(object => Math.min(canvas.width * 1.18 / object.width, canvas.height * 1.18 / object.height)));
  const backdrop = scene?.backdrop ?? (variation % 2 ? 'diagonal' : 'confetti');
  const shiftX = (random() - .5) * .16;
  const shiftY = (random() - .5) * .16;
  function limit(center: number, length: number, side: number, crop: number) {
    const margin = (length * scale / side) * (.5 - crop);
    return Math.max(margin, Math.min(1 - margin, center));
  }

  const sizes = objects.map(object => ({
    width: object.width * scale / canvas.width,
    height: object.height * scale / canvas.height,
  }));
  function constrain([x, y]: Anchor, index: number): Anchor {
    const object = objects[index];
    const crop = object.focus ? .10 : object.role === 'background' ? .28 : .20;
    return [limit(x, object.width, canvas.width, crop), limit(y, object.height, canvas.height, crop)];
  }

  const positions = anchors.map(([x, y], index) => {
    const offset = objects.length === 1 ? .12 : 0;
    return constrain([
      (variation & 1 ? 1 - x - offset : x + offset) + shiftX,
      (variation & 2 ? 1 - y - offset : y + offset) + shiftY,
    ], index);
  });

  const focusIndex = objects.findIndex(object => object.focus);
  if (focusIndex < 0) return { scale, backdrop, anchors: positions };
  const [fx, fy] = positions[focusIndex];
  const focus = sizes[focusIndex];
  return { scale, backdrop, anchors: positions.map(([x, y], index): Anchor => {
    if (index === focusIndex) return [x, y];
    const { width, height } = sizes[index];
    const dx = (focus.width + width) / 2;
    const dy = (focus.height + height) / 2;
    const maxOverlap = objects[index].role === 'background' ? .45 : .20;
    const candidates: Anchor[] = [[x, y], [fx - dx, y], [fx + dx, y], [x, fy - dy], [x, fy + dy]];
    let best: Anchor = [x, y];
    let bestCost = Infinity;
    for (const candidate of candidates) {
      const [cx, cy] = constrain(candidate, index);
      const overlapX = Math.max(0, Math.min(fx + focus.width / 2, cx + width / 2) - Math.max(fx - focus.width / 2, cx - width / 2));
      const overlapY = Math.max(0, Math.min(fy + focus.height / 2, cy + height / 2) - Math.max(fy - focus.height / 2, cy - height / 2));
      const overlap = overlapX * overlapY / (width * height);
      const cost = Math.hypot(cx - x, cy - y) + Math.max(0, overlap - maxOverlap) * 2;
      if (cost < bestCost) {
        best = [cx, cy];
        bestCost = cost;
      }
    }
    return best;
  }) };
}
