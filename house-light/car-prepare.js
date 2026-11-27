/**
 * Подготовка машин (Coolray / CX-5) после GLTFLoader: материалы, скрытие мусора.
 * Общая для addParkedModel и расстановки из каталога (Y01/Y02).
 */
import * as THREE from "three";

export function isCarCatalogId(id) {
  return id === "Y01" || id === "Y02";
}

export function carKindFromIdOrUrl(idOrUrl = "") {
  const s = String(idOrUrl);
  if (s.includes("Y02") || s.includes("mazda")) return "mazda";
  if (s.includes("Y01") || s.includes("coolray") || s.includes("geely")) return "coolray";
  return null;
}

/** Применить фиксы материалов; мутировать model на месте. */
export function prepareCarModel(model, idOrUrl) {
  const kind = carKindFromIdOrUrl(idOrUrl);
  if (!kind || !model) return model;

  let mazdaBody = null;
  let coolrayBody = null;

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    if (kind === "mazda") {
      let node = obj;
      while (node) {
        const name = node.name || "";
        if (name.includes("Component_101") || name.includes("Component_102") || name.includes("Component_118")) {
          obj.visible = false;
          return;
        }
        if (name.includes("Component_119")) {
          const src = obj.material;
          const m = (Array.isArray(src) ? src[0] : src).clone();
          m.map = null;
          m.color.set(0x3a1816);
          m.metalness = 0.08;
          m.roughness = 0.62;
          if (m.emissive) m.emissive.set(0x000000);
          obj.material = m;
        }
        node = node.parent;
      }
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      const paint = mat.name || "";
      const chrome = paint.includes("chrome") || paint.includes("Material_04");
      if (chrome) {
        mat.color.set(0xe6e8ec);
        mat.map = null;
        mat.metalness = 0.72;
        mat.roughness = 0.16;
        if (mat.specular) mat.specular.set(0xffffff);
      }
      if (kind === "mazda" && (paint.includes("Material_01") || paint.includes("Material_03"))) {
        if (!mazdaBody) {
          mazdaBody = new THREE.MeshPhysicalMaterial({
            name: "Mazda_Material_03",
            color: 0x6e675e,
            metalness: 0.62,
            roughness: 0.22,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            side: THREE.DoubleSide,
            transparent: false,
            opacity: 1,
            depthWrite: true,
          });
        }
        obj.material = mazdaBody;
      }
      if (kind === "mazda" && paint.includes("Material_11")) {
        mat.color.set(0x24262a);
        mat.map = null;
        mat.metalness = 0.45;
        mat.roughness = 0.38;
      }
      if (kind === "mazda" && (paint.includes("Material_10") || paint.includes("Material_12"))) {
        mat.map = null;
        mat.color.set(0x4a1e1c);
        mat.metalness = 0;
        mat.roughness = 0.8;
        if (mat.emissive) mat.emissive.set(0x000000);
      }
      if (kind === "mazda" && paint.includes("Material_07")) {
        mat.color.set(0x6a2824);
        mat.metalness = 0;
        mat.roughness = 0.78;
      }
      if (kind === "coolray" && paint.includes("carpaint") && !paint.includes("second")) {
        if (!coolrayBody) {
          coolrayBody = new THREE.MeshPhysicalMaterial({
            name: "CoolrayBody",
            color: 0x6a7078,
            metalness: 0.62,
            roughness: 0.22,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
          });
        }
        obj.material = coolrayBody;
      }
    }
  });

  if (kind === "mazda" && mazdaBody) {
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      let node = obj;
      while (node) {
        if ((node.name || "").includes("Component_06")) {
          obj.material = mazdaBody;
          return;
        }
        node = node.parent;
      }
    });
    model.updateWorldMatrix(true, true);
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.normal) return;
      const paint = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const paintName = (paint && paint.name) || "";
      if (!paintName.includes("Material_01") && !paintName.includes("Material_03")) return;
      const e = obj.matrixWorld.elements;
      const det =
        e[0] * (e[5] * e[10] - e[6] * e[9])
        - e[1] * (e[4] * e[10] - e[6] * e[8])
        + e[2] * (e[4] * e[9] - e[5] * e[8]);
      if (det >= 0) return;
      const geom = obj.geometry.clone();
      const nor = geom.attributes.normal;
      for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
      nor.needsUpdate = true;
      obj.geometry = geom;
      const m = paint.clone();
      m.side = THREE.DoubleSide;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      obj.material = m;
    });
  }
  return model;
}
