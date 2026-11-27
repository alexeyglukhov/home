---
name: house-light-graphics
description: >-
  Архитектура графики и управления house-light: meshopt GLB, каталог мебели,
  машины, орбита/зум, расстановка. Use when adding furniture or car models,
  optimizing GLB, MeshoptDecoder, furniture-tour-place, catalog.json,
  model-meta.json, loadModel, warmModelFiles, orbit after select, or house-light
  graphics pipeline.
---

# house-light: графика и управление

Источник правды для ассетов и ввода. Дом (стены/крыша) строится кодом в `variant-*.js`, не из GLB. GLB — мебель, машины, мелочь топочной.

## Формат моделей (обязательно)

1. Один файл **`.glb`** на объект (не мультифайловый `.gltf` + textures/).
2. После добавления сырого GLB прогнать:

```bash
node house-light/scripts/optimize-glb-assets.mjs
```

- Мебель/топочная: `optimize` (simplify + meshopt + webp).
- **Машины — только gentle** (dedup/prune/meshopt, без simplify и webp): иначе ломается `KHR_materials_pbrSpecularGlossiness` (пятна на кузове, пропавший блеск). Исходники машин: `house-plot/models/` или git `b1e4dc3`.
- В конце optimize **всегда** вызывается `bake-furniture-meta.mjs` → обновляет `furniture/model-meta.json`.

3. В GLB должны быть (после bake): `EXT_meshopt_compression`, обычно `EXT_texture_webp`, `KHR_mesh_quantization`.
4. Рантайм без MeshoptDecoder **не откроет** сжатые модели.

Ожидаемый порядок размера: стул/стол ~0.2–1 MB, машина ~1–3 MB. Каталог целиком ~20 MB после bake (не ~200 MB сырых).

## Куда класть файлы

| Тип | Путь | Регистрация |
| --- | --- | --- |
| Мебель | `house-light/furniture/models/{ID}.glb` | запись в `furniture/catalog.json` + **пересчёт `model-meta.json`** |
| Метагабариты / lastPose | `house-light/furniture/model-meta.json` | `scripts/bake-furniture-meta.mjs`; API `/api/furniture-meta` |
| Машина | `house-light/models/{name}.glb` | `addParkedModel({ url: "./models/…" })` в варианте / `app.js`; добавить путь в `CARS` в `scripts/optimize-glb-assets.mjs` |
| Топочная (детали) | `house-light/topochnaya/models/*.glb` | `topochnaya-v3.js` + bake в `optimize-glb-assets.mjs` |
| Топочная в 3.1d | содержимое без shell | `buildTopochnayaV3({ embed, room })` + `rotation.y = yaw(plan+x) + π` через `planDeltaToWorld` (не мировые оси и не mirrorX); `V31D_TOPO_CLEAR`, дверь на восток, окно на север |

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

`cm` = ширина × глубина × высота в **см** (целевой габарит при посадке; модель масштабируется `min(cm/native)`).

Раскладка варианта: `house-light/data/furniture/{variant}.json` — инстансы с `uid`, `id`, `file`, `cmW/cmD/cmH` (метры), `x/y/z`, `yaw`, `sx/sy/sz`, `mirror`, `wall`.

## model-meta.json (габариты + lastPose)

Файл: `house-light/furniture/model-meta.json`.

**Назначение:** один раз измерить нативный AABB каждой модели и не пересчитывать в браузере при каждой вставке; там же хранить последнюю трансформацию для повторной вставки.

```json
{
  "v": 1,
  "updated": "ISO-8601",
  "models": {
    "T01": {
      "file": "models/T01.glb",
      "catalogCm": [43, 74, 93],
      "fit": 0.995,
      "fittedM": { "w": 0.43, "d": 0.737, "h": 0.927 },
      "nativeM": { "w": 0.432, "d": 0.741, "h": 0.932 },
      "nativeMin": [-0.216, 0, -0.456],
      "nativeMax": [0.216, 0.932, 0.285],
      "nativeCenter": [0, 0.466, -0.085],
      "seatOffset": [0, 0, 0.085],
      "feetY": 0,
      "lastPose": { "sx": 1, "sy": 1, "sz": 1, "mirror": false, "mirrorZ": false }
    }
  }
}
```

| Поле | Смысл |
| --- | --- |
| `nativeM` / `nativeMin` / `nativeMax` / `nativeCenter` | Габарит **видимых** мешей в метрах (bake `robustSceneBounds`, не сырой scene AABB) |
| `seatOffset` | `position` при `scale=1`, чтобы низ был в y=0 и центр XZ в нуле |
| `feetY` | `nativeMin.y` до посадки (обычно ~0) |
| `fit` / `fittedM` | масштаб к `catalogCm` и габарит после fit (без sx/sy/sz) |
| `lastPose` | последние `sx/sy/sz/mirror/mirrorZ` после Enter — следующая вставка сразу с ними |

Рантайм: `fit` + `seatOffset*fit` из meta; wrap = `lastPose`; инстансный `cmW` **не** брать для fit (там часто впекан sx). Высота `z` сохраняется; snap только поднимает из пола.

### Когда пересчитывать габариты

```bash
# все модели из catalog.json (lastPose сохраняется)
node house-light/scripts/bake-furniture-meta.mjs

# одна модель
node house-light/scripts/bake-furniture-meta.mjs --id V01
```

Также автоматически в конце `optimize-glb-assets.mjs`.

**Обязательно** после добавления/замены любого `{ID}.glb`: optimize → bake meta (или полный optimize-скрипт). Не оставлять модель без записи в `model-meta.json`.

### Рантайм

- `furniture-tour-place.js` грузит meta (`GET /api/furniture-meta`, fallback на статический JSON).
- Fit: `nativeM` + `catalog cm` из meta (без повторного «угадывания» размера).
- Посадка ног: **всегда** по вершинам меша (`measureMeshBoxPrecise` / `seatModelFeet`), не по `nativeMin/Center` из bake — иначе quantized GLB (ванна V03 и др.) уходит в пол.
- Fallback замера размера только если id нет в meta.
- После Enter (вставка/правка/копия) `rememberPoseForId` пишет `lastPose` и `PUT /api/furniture-meta` (сервер мержит, не затирая `native*`).
- Повторная вставка того же `id` сразу с последним `lastPose`.

Сервер: `serve-viewer.py` — `GET/PUT /api/furniture-meta` → `furniture/model-meta.json`.

## Габариты и упор к стене (все модели)

1. Источник нативного размера — **`model-meta.json`**, не «сырой» `cm` и не повторный замер на каждый spawn.
2. OBB/пятно для стен в режиме правки: `measureMeshBox` / `ensureLocalFurnBox` (углы × `ghostRoot.matrixWorld`). Хелперы `selectHelper` не включать. **Не** `Box3.setFromObject` для посадки ног.
3. `baseSize` / `cmW/D/H` при сохранении — габарит **после fit, без** wrap `sx/sy/sz` (иначе масштаб впекается дважды).
4. Высота `z` сохраняется и при загрузке не сбрасывается. `snapFeet` / `snapRootFeetToFloor` по умолчанию **только поднимают** из пола; `stick` — лишь при явном «на плиту» (T со стены). PgUp и сохранённый подъём не затирать. Луч пола **не** в мебель/ghost.
5. `FOOT_PAD` ≈ **2 мм**. В `resolveMoveAgainstWalls` порог `pressingIntoWall` — ~**4 см**, не 25 см.
6. Правило для **всех** предметов каталога (V/T/W/C/…).

При правках коллизий/посадки править `furniture-tour-place.js`, не подгонять `cm` в JSON «с запасом».

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

После правок JS поднять `?v=` у модуля в `app.js` и `app.js?v=` в `index.html`. После смены API — перезапуск вьювера.

## Добавление новой мебели (чеклист)

1. Положить сырой `{ID}.glb` в `furniture/models/`.
2. Добавить item в `furniture/catalog.json` (`id`, `group`, `name`, `file`, `cm`, license/source).
3. `node house-light/scripts/optimize-glb-assets.mjs` (optimize + **bake model-meta**).
4. Убедиться, что в `furniture/model-meta.json` есть запись `{ID}` с `nativeM` / `nativeMin` / `nativeCenter`.
5. Проверить во вьювере: каталог (M) → вставка → Enter; повторная вставка того же id с тем же масштабом/зеркалом; орбита ЛКМ и зум колесом после клика.
6. Не оставлять мультифайловые папки `.gltf`/textures — только плоский `.glb` в `file`.

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
| Стрелки, Home/End, PgUp/PgDn, T, BracketLeft/Right, Minus/Equal | Движение / поворот / высота / ширина·высота в place |
| Comma / Period (и IntlBackslash) | Равномерный масштаб ±5% (лимит **0.15…8**) |
| BracketLeft/Right / Minus/Equal | Ширина / высота (тот же лимит 0.15…8) |

При **увеличении** ширины/масштаба: рост уходит в свободную сторону; упор в обе стены — заполнение ниши с зазором **`NICHE_CLEAR` = 1 см** до каждой стены (`usableNicheGap`), чтобы потом ездить вперёд-назад. Не `pushOut` после роста; `ensureNicheClearAlong` дожимает 1 см.

### Горячие клавиши — только физические (`event.code`)

В `furniture-tour-place.js` **нельзя** вешать действия на `event.key` / символ / раскладку. Только `event.code` (физическая клавиша). Раскладка RU/US не должна влиять.

| Действие | `event.code` |
| --- | --- |
| Масштаб −5% / +5% | `Comma` / `Period` (клавиши `<>` на US); также `IntlBackslash` / `Backslash` (ISO `<>|` у левого Shift: без Shift −, с Shift +) |
| Ширина −/+ | `BracketLeft` / `BracketRight` (х/ъ на RU — те же физические) |
| Высота −/+ | `Minus` / `Equal` |

Повторная вставка того же `id` — `lastPose` из `model-meta.json` (`sx/sy/sz/mirror/mirrorZ`).

### Габариты = только видимые детали (любая модель)

Общая логика: `house-light/furniture-visible-bounds.js` → `selectVisibleParts` / `unionVisibleBounds`.

1. Невидимые / без шейдинга / `shadow|collision|helper|proxy` — вне габарита.
2. Якорь — **именованные** видимые меши (если имён нет — все прошедшие фильтр).
3. Безымянные ±1 м / blob ~2×2 и всё, что **раздувает** AABB якоря — отбросить.
4. Bake (`bake-furniture-meta.mjs`) и рантайм (`measureMeshBox` / `measureMeshBoxPrecise` / каркас выделения) используют один алгоритм.
5. `strip-furniture-junk-meshes.mjs` вырезает геометрические хелперы из GLB (вызов из optimize).

Нельзя брать сырой scene AABB. После смены логики — полный bake `model-meta.json`.

Вставка из каталога: фаза `aim` (призрак за мышью) → клик или Enter → `tune` → Enter фиксирует. Только клик фиксации aim **съедает** pointerdown (орбита с этого клика не стартует).
**Aim всегда на пол** (`placeGhostOnFloorAtPointer`): даже если под курсором стена или другая мебель — XZ с луча, ноги на `sampleFloorY`, без mount=wall и без `alignFloorToNearbyWall`.

`blocksOrbit()` всегда `false`. Орбита блокируется лишь пока открыт каталог (`syncFurnitureOrbitLock` в `app.js`).

Capture `pointerdown` на canvas: `onPointerDown` → `stopImmediatePropagation` **только** если вернул `true` (фиксация aim). Выбор возвращает `false`.

## Что не трогать без нужды

- Геометрию дома через GLB — её нет; правки в `variant-*.js` / `geometry.js`.
- Сырые несжатые GLB в репозиторий — только после optimize.
- Отключение MeshoptDecoder «для совместимости» — сломает bake.
- `stopImmediatePropagation` на обычном выборе мебели — снова заблокирует орбиту.
- Ручное затирание `lastPose` в `model-meta.json` при bake — скрипт сам сохраняет старые позы.

## Связанные скилы

- `house-light-viewer` — запуск HTTP-вьювера (после смены `serve-viewer.py` — перезапуск).
- `topochnaya-draw` — топочная V3 (отдельные правила труб/подписей).
