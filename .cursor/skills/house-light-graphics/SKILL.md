---
name: house-light-graphics
description: >-
  Архитектура графики и управления house-light: meshopt GLB, каталог мебели,
  машины, орбита/зум, расстановка. Use when adding furniture or car models,
  optimizing GLB, MeshoptDecoder, furniture-tour-place, catalog.json,
  loadModel, warmModelFiles, orbit after select, or house-light graphics pipeline.
---

# house-light: графика и управление

Источник правды для ассетов и ввода. Дом (стены/крыша) строится кодом в `variant-*.js`, не из GLB. GLB — мебель, машины, мелочь топочной.

## Формат моделей (обязательно)

1. Один файл **`.glb`** на объект (не мультифайловый `.gltf` + textures/).
2. После добавления сырого GLB прогнать:

```bash
node house-light/scripts/optimize-glb-assets.mjs
```

Пайплайн: `gltf-transform optimize --compress meshopt --texture-compress webp` (simplify + meshopt + webp). Скрипт перезаписывает на месте; для машин пути уже в скрипте.

3. В GLB должны быть (после bake): `EXT_meshopt_compression`, обычно `EXT_texture_webp`, `KHR_mesh_quantization`.
4. Рантайм без MeshoptDecoder **не откроет** сжатые модели.

Ожидаемый порядок размера: стул/стол ~0.2–1 MB, машина ~1–3 MB. Каталог целиком ~20 MB после bake (не ~200 MB сырых).

## Куда класть файлы

| Тип | Путь | Регистрация |
| --- | --- | --- |
| Мебель | `house-light/furniture/models/{ID}.glb` | запись в `furniture/catalog.json` |
| Машина | `house-light/models/{name}.glb` | `addParkedModel({ url: "./models/…" })` в варианте / `app.js`; добавить путь в `CARS` в `scripts/optimize-glb-assets.mjs` |
| Топочная | `house-light/topochnaya/models/*.glb` | `topochnaya-v3.js` (мелочь; bake по желанию) |

ID мебели: буква группы + номер (`C04`, `P03`). Группы — массив `groups` в `catalog.json`.

### Запись каталога

```json
{
  "id": "C99",
  "group": "C",
  "name": "Стул …",
  "file": "models/C99.glb",
  "cm": [45, 50, 90],
  "license": "CC0",
  "source": "https://…"
}
```

`cm` = ширина × глубина × высота в **см** (габарит пятна в плане; модель подгоняется под эти размеры при spawn).

Раскладка варианта: `house-light/data/furniture/{variant}.json` — инстансы с `uid`, `id`, `file`, `cmW/cmD/cmH` (метры), `x/y/z`, `yaw`, `sx/sy/sz`, `mirror`, `wall`.

## Рантайм загрузки

Loader + decoder (все три места):

- `furniture-tour-place.js` — сцена / расстановка
- `furniture-catalog.js` — превью каталога
- `app.js` — `gltfLoader` для машин

```js
import { MeshoptDecoder } from "./vendor/meshopt_decoder.module.js";
loader.setMeshoptDecoder(MeshoptDecoder);
```

Кэш: `Map file → Promise<scene>`; инстансы через `scene.clone(true)` (геометрия шарится).

При загрузке раскладки / undo-restore: сначала `warmModelFiles(uniqueFiles)` (`Promise.all`), потом `spawnRecord` — не грузить уникальные GLB строго по одному.

URL мебели: `./furniture/` + `file` из каталога (`fileUrl`).

После правок JS поднять `?v=` у модуля в `app.js` и `app.js?v=` в `index.html`.

## Добавление новой мебели (чеклист)

1. Положить сырой `{ID}.glb` в `furniture/models/`.
2. Добавить item в `furniture/catalog.json` (`id`, `group`, `name`, `file`, `cm`, license/source).
3. `node house-light/scripts/optimize-glb-assets.mjs` (или точечно тот же `gltf-transform optimize` в тот же путь).
4. Проверить во вьювере: каталог (M) → вставка → Enter; орбита ЛКМ и зум колесом после клика по объекту.
5. Не оставлять мультифайловые папки `.gltf`/textures — только плоский `.glb` в `file`.

## Добавление машины (чеклист)

1. Положить `.glb` в `house-light/models/`.
2. Вписать путь в `CARS` в `optimize-glb-assets.mjs`, прогнать скрипт.
3. Вызвать `addParkedModel({ url, length, centerE, centerN, … })` из нужного `variant-*.js` / сборки в `app.js`.
4. Убедиться, что используется общий `gltfLoader` с MeshoptDecoder.

## Управление (осмотр без крыши)

Редактирование мебели: только осмотр, крыша снята (`canEditFurniture`). В экскурсии — нет.

| Ввод | Поведение |
| --- | --- |
| ЛКМ по мебели | Выделить; **не** глотать событие — OrbitControls вращает сцену |
| Shift/Ctrl+ЛКМ | Мультивыбор / группа |
| ЛКМ в пустоту | Снять выбор; орбита |
| Колесо | Зум камеры (орбита); при вставке мебель колесом не масштабирует |
| M | Каталог |
| E / C / X | Правка / копия / удалить выделенное |
| Insert / Delete | Зеркало L↔R / F↔B (не удаление) |
| Enter / Esc | Фиксация / отмена режима |
| Стрелки, Home/End, PgUp/PgDn, T, х/ъ, -/= | Движение / поворот / высота / масштаб в place |

Вставка из каталога: фаза `aim` (призрак за мышью) → клик или Enter → `tune` → Enter фиксирует. Только клик фиксации aim **съедает** pointerdown (орбита с этого клика не стартует).

`blocksOrbit()` всегда `false`. Орбита блокируется лишь пока открыт каталог (`syncFurnitureOrbitLock` в `app.js`).

Capture `pointerdown` на canvas: `onPointerDown` → `stopImmediatePropagation` **только** если вернул `true` (фиксация aim). Выбор возвращает `false`.

## Что не трогать без нужды

- Геометрию дома через GLB — её нет; правки в `variant-*.js` / `geometry.js`.
- Сырые несжатые GLB в репозиторий — только после optimize.
- Отключение MeshoptDecoder «для совместимости» — сломает bake.
- `stopImmediatePropagation` на обычном выборе мебели — снова заблокирует орбиту.

## Связанные скилы

- `house-light-viewer` — запуск HTTP-вьювера.
- `topochnaya-draw` — топочная V3 (отдельные правила труб/подписей).
