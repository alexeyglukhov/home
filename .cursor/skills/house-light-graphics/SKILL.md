---
name: house-light-graphics
description: >-
  Архитектура графики и управления house-light: meshopt GLB, каталог мебели,
  машины (группа Y), орбита/зум, расстановка. Use when adding furniture or car
  models, optimizing GLB, MeshoptDecoder, furniture-tour-place, catalog.json,
  model-meta.json, nativeM/cm bounds, FOOT_CLEAR/WALL_CLEAR 1cm, crooked
  dimensions, loadModel, warmModelFiles, orbit after select, or house-light
  graphics pipeline. Always re-verify visible bounds (bake + catalog cm) when
  touching furniture models.
---

# house-light: графика и управление

Источник правды для ассетов и ввода. Дом (стены/крыша) строится кодом в `variant-*.js`, не из GLB. GLB — мебель, машины, мелочь топочной.

## Формат моделей (обязательно)

1. Один файл **`.glb`** на объект (не мультифайловый `.gltf` + textures/).
2. После добавления сырого GLB прогнать:

```bash
node house-light/scripts/optimize-glb-assets.mjs
```

- Мебель/топочная: `optimize` (meshopt + webp, **без** `--join` / `--simplify` — иначе полки вроде `Cabinet top bottom` сливаются в боковину, G03).
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

### Агент: всегда перепроверяй габариты

Любая задача про мебель / GLB / каталог / «кривой размер» / вставку — **не доверять** уже лежащим `cm` и `nativeM` без проверки.

1. Прогнать `selectVisibleParts` / `unionVisibleBounds` по мешам модели (или bake `--id`) и сравнить с `catalog.json` `cm` и `model-meta.json` `nativeM`.
2. Если расхождение заметное (особенно одна ось раздута ручкой/`brace`/хелпером ±1 м) — поправить логику bounds при необходимости, **переbake**, выровнять `cm` под `nativeM` (тонкое стекло: глубина ≥ `ceil(native·100)` см, иначе `fit` сжимает).
3. После смены `furniture-visible-bounds.js` — **полный** bake всех моделей + точечная сверка подозрительных id (душа, экраны, угловые шкафы).
4. Не считать задачу закрытой, пока `nativeM` × `fit` ≈ целевой `cm` и во вьювере пятно совпадает с видимым корпусом.

### Рантайм

- `furniture-tour-place.js` грузит meta (`GET /api/furniture-meta`, fallback на статический JSON).
- Fit: `nativeM` + `catalog cm` из meta (без повторного «угадывания» размера).
- Посадка ног: **всегда** `seatModelFeet` + `measureFootBoxPrecise` / `selectFootParts` (все видимые не-хелперы), **не** `seatOffset` из bake и не только корпус-якорь. Иначе quantized GLB или «hanger frame» как body утапливают шкаф (G02/G03) в пол. W×D×H стен — по-прежнему `selectVisibleParts` (корпус без ручек/brace/hanger).
- Fallback замера размера только если id нет в meta.
- После Enter (вставка/правка/копия) `rememberPoseForId` пишет `lastPose` и `PUT /api/furniture-meta` (сервер мержит, не затирая `native*`).
- Повторная вставка того же `id` сразу с последним `lastPose`.

Сервер: `serve-viewer.py` — `GET/PUT /api/furniture-meta` → `furniture/model-meta.json`.

## Габариты, пол и стены (все модели, включая авто)

Константы в `furniture-tour-place.js`:

| Константа | Значение | Смысл |
| --- | --- | --- |
| `FOOT_CLEAR` | **1 см** | низ мебели над полом при посадке / snap / load |
| `WALL_CLEAR` | **1 см** | зазор до стены для мебели **на полу** (пятно, pushOut, ниша) |
| `NICHE_CLEAR` | = `WALL_CLEAR` | рост в нишу не доводит вплотную |
| `WALL_EPS` | ~3 мм | только **mount=wall** (ТВ flush) |
| `FOOT_PAD` | = `WALL_CLEAR` | контур стены в `nearestBlockingFoot` |

1. Источник нативного размера — **`model-meta.json`** (`nativeM` + низ по вершинам).
2. Посадка Y: **`measureLowestMeshY`** (все видимые меши), не корпус-якорь и не AABB. Иначе вешалка/фильтр → шкаф в полу. Пол дома **0.57** (`floorSlab`), не цоколь **0.45**: `sampleFloorY` для `floorSlab`/`walkTop` принимает **|n.y|** (нормаль верха часто перевёрнута); `markHouseFloor` пишет `walkTop`. После load — `stickToFloor` на `sampleFloorY + FOOT_CLEAR`. **Не** сдвигать XZ от стен при load (AABB повёрнутого шкафа → ложные 30–40 см).
3. 1 см до стены — при движении/росте (`WALL_CLEAR` / `NICHE_CLEAR`), `FOOT_PAD` ≈ 2 мм (не дублировать clear).
4. OBB для стен в правке: корпус (`selectVisibleParts`).
5. `baseSize` / `cmW/D/H` — после fit, без wrap `sx/sy/sz`. Каталог **Y (Авто)** тоже.

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

Машины — обычные позиции каталога (группа **Y**), редактируются как мебель (M / E / стрелки).

1. Положить `.glb` в `house-light/models/` (gentle optimize в `CARS` у `optimize-glb-assets.mjs`).
2. Симлинк в каталог: `furniture/models/Y0N.glb` → `../../models/….glb`.
3. Запись в `furniture/catalog.json`: `group: "Y"`, `"car": true`, `cm` = ширина × длина × высота (см), `file: "models/Y0N.glb"`.
4. `node house-light/scripts/bake-furniture-meta.mjs --id Y0N` (или полный bake).
5. Материалы: `car-prepare.js` → `prepareCarModel` (вызов из `loadModel` для Y01/Y02).
6. Позу парковки — в `data/furniture/{variant}.json`, **не** `addParkedModel` в variant-31d (устарело для 3.1d). Другие варианты пока могут звать `addParkedModel` до миграции.
7. MeshoptDecoder обязателен.

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

При **увеличении** ширины/масштаба: рост уходит в свободную сторону; упор в обе стены — ниша с зазором **`WALL_CLEAR` / `NICHE_CLEAR` = 1 см**. Не `pushOut` после роста; `ensureNicheClearAlong` дожимает 1 см. Уже стоящая мебель при load проходит `ensurePlacedClearances`.

`settleGrowthAgainstWalls`: ужимать **только оси, выросшие на этом шаге**. Ширина (`BracketLeft`/`Right` → `sx` или `sz`) не должна менять `sy`/другую ось; равномерный `Comma`/`Period` — все три. Не сгонять группу в изотропный scale после ужима.

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
2. Якорь — **корпус** по имени (`glass|screen|tray|enclosure|panel|case|leg|…`); ручки/`brace`/`pull`/`grip` — не корпус.
3. При наличии корпуса фурнитуру в AABB **не** включают (иначе walk-in V06 получает глубину ~75 см из AABB растяжки, закрытая V05 — +3 см от door pull).
4. Безымянные ±1 м / blob ~2×2 и всё, что сильно раздувает якорь — отбросить.
5. Bake (`bake-furniture-meta.mjs`) и рантайм используют один алгоритм; `strip-furniture-junk-meshes.mjs` вырезает хелперы из GLB.

Нельзя брать сырой scene AABB. После смены логики — полный bake `model-meta.json` и поправить `catalog.json` `cm` под новый `nativeM` (тонкое стекло: глубина ≥ ceil(native·100) см, иначе `fit` сжимает модель).

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
