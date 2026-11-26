// Расстановка Д5. Источник — furniture-map-d4.svg.
// Карту правьте там, затем: python3 furniture-map/sync_map_to_place.py d5
import { mountFurniture, CAB_H, COUNTER_H, RAISE } from "./furniture-place-d2.js?v=44";

export const D5_FURNITURE = [];

export function mountD5Furniture(group, api) {
  return mountFurniture(group, api, D5_FURNITURE);
}
