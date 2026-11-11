export function parseSvg(source: string): string {
  const externalSvgDoctype = /^(\uFEFF?(?:<\?xml\s+[^?]*\?>)?\s*)<!DOCTYPE\s+svg\s+(?:PUBLIC\s+(?:"[^"<>]*"|'[^'<>]*')\s+|SYSTEM\s+)(?:"[^"<>]*"|'[^'<>]*')\s*>/;
  const document = new DOMParser().parseFromString(source.replace(externalSvgDoctype, '$1'), 'image/svg+xml');
  const root = document.documentElement;
  if (document.doctype || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || document.querySelector('parsererror')) {
    throw new Error('Файл должен содержать корректный SVG.');
  }
  const forbidden = /^(?:image|feimage|script|foreignobject|style|animate.*|set|a)$/i;
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.namespaceURI !== root.namespaceURI || forbidden.test(element.localName)) {
      throw new Error('SVG должен состоять из векторных элементов.');
    }
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'base' ||
          (name === 'href' && !/^#[\w:.-]+$/.test(value)) ||
          /\\|@import/i.test(value) ||
          /url\s*\(/i.test(value.replace(/url\(\s*['"]?#[\w:.-]+['"]?\s*\)/gi, ''))) {
        throw new Error('SVG должен использовать только внутренние ссылки.');
      }
    }
  }
  return new XMLSerializer().serializeToString(root);
}
