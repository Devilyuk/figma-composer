<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { builtins, colorHex, dimensions, fromHex, palettes, svgUrl, validDimension, type Asset, type Palette, type Settings } from './library';
import { parseSvg } from './svg';

const tabs = ['Создать', 'Библиотека', 'Палитры'] as const;
const tab = ref<typeof tabs[number]>('Создать');
const brief = ref('');
const size = ref<keyof typeof dimensions | 'custom'>('L');
const customWidth = ref<number | ''>(1000);
const customHeight = ref<number | ''>(1000);
const canvas = computed(() => {
  if (size.value !== 'custom') {
    const edge = dimensions[size.value];
    return { width: edge, height: edge };
  }
  const width = customWidth.value;
  const height = customHeight.value;
  return validDimension(width) && validDimension(height) ? { width, height } : null;
});
const palette = ref(0);
const settings = ref<Settings>({ assets: [], palettes: [] });
const ready = ref(window.parent === window);
const busy = ref(false);
const status = ref('');
const failed = ref(false);
const apiKey = ref('');
const savedApiKey = ref('');
const draftName = ref('');
const draftColors = ref(palettes[0].colors.map(colorHex));
const search = ref('');
const download = ref('');
const allAssets = computed(() => [...builtins, ...settings.value.assets]);
const allPalettes = computed(() => [...palettes, ...settings.value.palettes]);
const visibleAssets = computed(() => allAssets.value.filter(asset => asset.name.toLowerCase().includes(search.value.trim().toLowerCase())));

function post(type: string, payload: object = {}) {
  window.parent.postMessage({ pluginMessage: { type, ...payload } }, '*');
}

function resetStatus() {
  failed.value = false;
  status.value = '';
}

function receive(event: MessageEvent) {
  // Figma Desktop can deliver messages from the host outside the immediate sandbox iframe.
  if (event.source !== window.parent && event.origin !== 'https://www.figma.com') return;
  const message = event.data?.pluginMessage;
  if (!message) return;
  if (message.type === 'progress') {
    status.value = message.status;
    return;
  }
  if (!['settings', 'api-key', 'done', 'error', 'exported'].includes(message.type)) return;
  busy.value = false;
  failed.value = message.type === 'error';
  status.value = message.status ?? '';
  if (message.type === 'settings') {
    settings.value = message.settings;
    ready.value = true;
    if (message.paletteIndex !== undefined) palette.value = message.paletteIndex;
  }
  if (typeof message.apiKey === 'string') {
    savedApiKey.value = message.apiKey;
    apiKey.value = message.apiKey;
  }
  if (message.type === 'exported') {
    if (download.value) URL.revokeObjectURL(download.value);
    download.value = URL.createObjectURL(new Blob([message.svg], { type: 'image/svg+xml' }));
    status.value = 'SVG готов к скачиванию.';
  }
}

onMounted(() => {
  window.addEventListener('message', receive);
  if (window.parent !== window) post('init');
});
onUnmounted(() => {
  window.removeEventListener('message', receive);
  if (download.value) URL.revokeObjectURL(download.value);
});

function updateSavedKey(key: string) {
  if (!ready.value || busy.value || window.parent === window) return;
  resetStatus();
  busy.value = true;
  post('save-api-key', { key });
}

function create() {
  const title = brief.value.trim();
  const canvasSize = canvas.value;
  const key = apiKey.value.trim();
  if (!ready.value || !title || !canvasSize || !key || busy.value) return;
  resetStatus();
  if (window.parent === window) {
    status.value = 'Откройте плагин в Figma, чтобы создать фрейм.';
    return;
  }
  busy.value = true;
  if (download.value) URL.revokeObjectURL(download.value);
  download.value = '';
  status.value = 'Разбираем метафору…';
  post('compose', { brief: title, canvas: canvasSize, palette: palette.value, key });
}

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length || busy.value) return;
  resetStatus();
  busy.value = true;
  try {
    const assets: Asset[] = await Promise.all(files.map(async file => {
      if (file.size > 250_000) throw new Error('Каждый SVG должен весить до 250 КБ.');
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const id = 'custom-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return {
        id, name: file.name.replace(/\.svg$/i, '').slice(0, 80),
        role: 'main', svg: parseSvg(await file.text()), custom: true
      };
    }));
    post('add-assets', { assets });
  } catch (error) {
    failed.value = true;
    status.value = error instanceof Error ? error.message : 'Не удалось открыть SVG.';
    busy.value = false;
  }
}

function removeAsset(id: string) {
  resetStatus();
  busy.value = true;
  post('remove-asset', { id });
}

function changeAssetRole(asset: Asset, event: Event) {
  const select = event.target as HTMLSelectElement;
  const role = select.value;
  select.value = asset.role;
  if (busy.value || !ready.value || role === asset.role) return;
  resetStatus();
  busy.value = true;
  post('set-asset-role', { id: asset.id, role });
}

function savePalette() {
  if (!draftName.value.trim() || busy.value) return;
  const entry: Palette = { name: draftName.value.trim(), colors: draftColors.value.map(fromHex) };
  busy.value = true;
  resetStatus();
  post('add-palette', { palette: entry });
}

function exportFrame() {
  busy.value = true;
  resetStatus();
  post('export');
}
</script>

<template>
  <div class="app">
    <header><div class="mark" aria-hidden="true">✦</div><div><strong>Illustration Composer</strong><p>Иллюстрации из готовых объектов</p></div></header>
    <nav aria-label="Разделы плагина">
      <button v-for="item in tabs" :key="item" type="button" :aria-current="tab === item ? 'page' : undefined"
        @click="tab = item">{{ item }}</button>
    </nav>
    <main>
      <section v-if="tab === 'Создать'">
        <form @submit.prevent="create">
          <label for="brief">Метафора или заголовок</label>
          <textarea id="brief" v-model="brief" rows="3" maxlength="600" placeholder="Например, «Знания освещают путь»" required></textarea>
          <div class="row fields">
            <div><label for="size">Размер</label><select id="size" v-model="size">
              <option v-for="(edge, option) in dimensions" :key="option" :value="option">{{ option }} · {{ edge }} × {{ edge }}</option>
              <option value="custom">Свой размер</option>
            </select></div>
            <div><label for="palette">Палитра</label><select id="palette" v-model.number="palette">
              <option v-for="(item, i) in allPalettes" :key="i" :value="i">{{ item.name }}</option>
            </select></div>
          </div>
          <div v-if="size === 'custom'" class="row fields">
            <div><label for="width">Ширина, px</label><input id="width" v-model.number="customWidth" type="number" min="1" step="1" required></div>
            <div><label for="height">Высота, px</label><input id="height" v-model.number="customHeight" type="number" min="1" step="1" required></div>
          </div>
          <div class="swatches" aria-label="Цвета выбранной палитры">
            <span v-for="(color, i) in allPalettes[palette]?.colors" :key="i" :style="{ background: colorHex(color) }" :title="colorHex(color)"></span>
          </div>
          <div class="fields">
            <label for="api-key">API-ключ TKBK</label>
            <input id="api-key" v-model="apiKey" type="password" placeholder="cr_…" autocomplete="off" spellcheck="false" :disabled="!ready || busy" required>
            <p class="muted">{{ savedApiKey && apiKey.trim() === savedApiKey ? 'Ключ сохранён на этом устройстве.' : 'Ключ можно запомнить на этом устройстве.' }}</p>
            <div class="row">
              <button type="button" class="subtle" :disabled="!ready || busy || !apiKey.trim() || apiKey.trim() === savedApiKey"
                @click="updateSavedKey(apiKey.trim())">{{ savedApiKey ? 'Обновить сохранённый ключ' : 'Запомнить ключ' }}</button>
              <button v-if="savedApiKey" type="button" class="subtle" :disabled="busy" @click="updateSavedKey('')">Забыть ключ</button>
            </div>
          </div>
          <button class="primary" :disabled="!ready || busy || !brief.trim() || !canvas || !apiKey.trim()">{{ busy ? 'Обработка…' : 'Создать' }}</button>
        </form>
        <div v-if="ready && !busy" class="export">
          <button type="button" class="subtle" @click="exportFrame">Экспорт выбранного фрейма</button>
          <a v-if="download" :href="download" download="composition.svg">Скачать SVG</a>
        </div>
      </section>
      <section v-else-if="tab === 'Библиотека'">
        <div class="section-head"><div><h1>Объекты SVG</h1><p>Объектов: {{ visibleAssets.length }}</p></div>
          <label class="upload" :class="{ disabled: busy || !ready }">Добавить SVG<input type="file" accept=".svg,image/svg+xml" multiple :disabled="busy || !ready" @change="importFiles"></label>
        </div>
        <input v-model="search" type="search" aria-label="Поиск по библиотеке" placeholder="Найти объект">
        <div class="grid">
          <article v-for="asset in visibleAssets" :key="asset.id" class="asset">
            <img :src="svgUrl(asset.svg)" :alt="asset.name" loading="lazy">
            <strong>{{ asset.name }}</strong>
            <select v-if="asset.custom" :value="asset.role" :disabled="busy || !ready" :aria-label="'Роль объекта «' + asset.name + '»'"
              @change="changeAssetRole(asset, $event)">
              <option value="main">Основной</option>
              <option value="background">Фоновый</option>
            </select>
            <small v-else>{{ asset.role === 'background' ? 'Фоновый' : 'Основной' }}</small>
            <button v-if="asset.custom" type="button" class="remove" :disabled="busy" :aria-label="'Удалить ' + asset.name" @click="removeAsset(asset.id)">×</button>
          </article>
        </div>
        <p v-if="!visibleAssets.length" class="muted">Ничего не найдено.</p>
      </section>
      <section v-else>
        <h1>Цветовые палитры</h1>
        <div class="palette-list">
          <button v-for="(item, i) in allPalettes" :key="i" class="palette-card" :aria-pressed="palette === i" @click="palette = i">
            <strong>{{ item.name }}</strong><span class="swatches"><span v-for="(color, c) in item.colors" :key="c" :style="{ background: colorHex(color) }"></span></span>
          </button>
        </div>
        <form class="palette-form" @submit.prevent="savePalette">
          <h2>Новая палитра</h2>
          <label for="palette-name">Название</label><input id="palette-name" v-model="draftName" maxlength="60" placeholder="Например, «Утро»" required>
          <fieldset v-for="(label, group) in ['Фоновые цвета', 'Цвета объектов']" :key="label">
            <legend>{{ label }}</legend>
            <input v-for="n in 4" :key="n" v-model="draftColors[group * 4 + n - 1]" type="color" :aria-label="label + ' ' + n">
          </fieldset>
          <button class="primary" :disabled="!ready || busy || !draftName.trim()">Сохранить палитру</button>
        </form>
      </section>
      <p v-if="status" class="status" :class="{ failed }" role="status">{{ status }}</p>
    </main>
  </div>
</template>
