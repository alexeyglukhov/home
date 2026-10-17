// Печатные листы открытого варианта. Ключ — id варианта вьювера.
const PRINTS = {
  vd2: [
    {
      label: "Планировка",
      file: "prints/plan-1-etazh-variant-d2-print.svg",
      name: "планировка-д2",
    },
    {
      label: "2D схема",
      file: "prints/abrikosovaya-22-layout-variant-d2-1-100-print.svg",
      name: "2d-схема-д2",
    },
    {
      label: "Дом",
      file: "prints/plan-1-etazh-variant-d2-dom-print.svg?v=3",
      name: "дом-д2",
    },
  ],
  vd3: [
    {
      label: "Планировка",
      file: "prints/plan-1-etazh-variant-d3-print.svg",
      name: "планировка-д3",
    },
    {
      label: "2D схема",
      file: "prints/abrikosovaya-22-layout-variant-d3-1-100-print.svg",
      name: "2d-схема-д3",
    },
    {
      label: "Дом",
      file: "prints/plan-1-etazh-variant-d3-dom-print.svg?v=3",
      name: "дом-д3",
    },
  ],
  vd4: [
    {
      label: "Планировка",
      file: "prints/plan-1-etazh-variant-d4-print.svg",
      name: "планировка-д4",
    },
    {
      label: "2D схема",
      file: "prints/abrikosovaya-22-layout-variant-d4-1-100-print.svg",
      name: "2d-схема-д4",
    },
    {
      label: "Дом",
      file: "prints/plan-1-etazh-variant-d4-dom-print.svg?v=3",
      name: "дом-д4",
    },
  ],
};

function sheetsOf(variant) {
  if (variant === "vd1") return PRINTS.vd2;
  if (variant === "vd5") return PRINTS.vd4;
  return PRINTS[variant] || [];
}

const A4_W = 297;
const A4_H = 210;
const DPI = 200;

const dock = document.getElementById("prints");
const viewer = document.getElementById("print-open");
const viewImg = document.getElementById("print-open-img");
const viewLabel = document.getElementById("print-open-label");
const viewStatus = document.getElementById("print-open-status");
const printSlotImg = document.getElementById("print-slot-img");
const actionButtons = viewer.querySelectorAll("[data-act]");

const ready = new Map();
let current = null;

function loadImage(url) {
  let job = ready.get(url);
  if (job) return job;
  job = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
  ready.set(url, job);
  return job;
}

function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function rasterSize() {
  return {
    w: Math.round(A4_W / 25.4 * DPI),
    h: Math.round(A4_H / 25.4 * DPI),
  };
}

async function rasterJpeg(url) {
  const img = await loadImage(url);
  const { w, h } = rasterSize();
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("jpeg"));
    }, "image/jpeg", 0.92);
  });
  return { blob, w, h };
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function jpegPdf(jpeg, widthPx, heightPx) {
  const text = new TextEncoder();
  const pageW = (A4_W / 25.4 * 72).toFixed(2);
  const pageH = (A4_H / 25.4 * 72).toFixed(2);
  const content = text.encode(`q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im Do\nQ\n`);
  const objects = [
    text.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    text.encode("<< /Type /Pages /Count 1 /Kids [3 0 R] >>"),
    text.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R >> >> >>`),
    text.encode(`<< /Length ${content.length} >>`),
    text.encode(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`),
  ];
  const chunks = [text.encode("%PDF-1.4\n")];
  const starts = [0];
  let size = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    starts.push(size);
    const head = text.encode(`${i + 1} 0 obj\n`);
    const tail = text.encode("\nendobj\n");
    if (i === 3) {
      const streamHead = text.encode("\nstream\n");
      const streamTail = text.encode("endstream\nendobj\n");
      chunks.push(head, objects[i], streamHead, content, streamTail);
      size += head.length + objects[i].length + streamHead.length + content.length + streamTail.length;
    } else if (i === 4) {
      const streamHead = text.encode("\nstream\n");
      const streamTail = text.encode("\nendstream\nendobj\n");
      chunks.push(head, objects[i], streamHead, jpeg, streamTail);
      size += head.length + objects[i].length + streamHead.length + jpeg.length + streamTail.length;
    } else {
      chunks.push(head, objects[i], tail);
      size += head.length + objects[i].length + tail.length;
    }
  }
  let xref = `xref\n0 ${starts.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < starts.length; i++) {
    xref += `${String(starts[i]).padStart(10, "0")} 00000 n \n`;
  }
  const xrefAt = size;
  chunks.push(text.encode(`${xref}trailer\n<< /Size ${starts.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));
  return concatBytes(chunks);
}

function closeViewer() {
  viewer.hidden = true;
  current = null;
  viewStatus.textContent = "";
  document.body.classList.remove("sheet-print");
}

function openViewer(sheet) {
  current = sheet;
  viewImg.src = sheet.file;
  viewLabel.textContent = sheet.label;
  printSlotImg.src = sheet.file;
  viewStatus.textContent = "";
  viewer.hidden = false;
  loadImage(sheet.file).catch(() => {
    viewStatus.textContent = "Лист не открылся";
  });
}

function sheetButton(sheet) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sheet";
  btn.hidden = true;
  btn.innerHTML = `<span class="leaf"><span class="page"><img alt="" draggable="false"></span></span><span class="cap"></span>`;
  const img = btn.querySelector("img");
  const cap = btn.querySelector(".cap");
  cap.textContent = sheet.label;
  img.alt = sheet.label;
  img.src = sheet.file;
  img.addEventListener("load", () => {
    btn.hidden = false;
  });
  img.addEventListener("error", () => {
    btn.remove();
    if (!dock.querySelector(".sheet")) dock.hidden = true;
  });
  btn.addEventListener("click", () => openViewer(sheet));
  return btn;
}

export function syncPrintSheets(variant) {
  closeViewer();
  dock.replaceChildren();
  const sheets = sheetsOf(variant);
  dock.hidden = sheets.length === 0;
  for (const sheet of sheets) dock.appendChild(sheetButton(sheet));
}

async function runAction(act, button) {
  if (!current) return;
  const sheet = current;
  button.disabled = true;
  viewStatus.textContent = "";
  try {
    if (act === "print") {
      await loadImage(sheet.file);
      printSlotImg.src = sheet.file;
      document.body.classList.add("sheet-print");
      window.print();
      document.body.classList.remove("sheet-print");
      return;
    }
    if (act === "svg") {
      const response = await fetch(sheet.file);
      if (!response.ok) throw new Error(String(response.status));
      const blob = new Blob([await response.arrayBuffer()], { type: "image/svg+xml" });
      saveBlob(blob, `${sheet.name}.svg`);
      return;
    }
    const { blob, w, h } = await rasterJpeg(sheet.file);
    if (act === "jpg") {
      saveBlob(blob, `${sheet.name}.jpg`);
      return;
    }
    const pdf = jpegPdf(new Uint8Array(await blob.arrayBuffer()), w, h);
    saveBlob(new Blob([pdf], { type: "application/pdf" }), `${sheet.name}.pdf`);
  } catch {
    viewStatus.textContent = "Не удалось подготовить файл";
  } finally {
    button.disabled = false;
  }
}

viewer.addEventListener("click", (event) => {
  if (event.target === viewer) closeViewer();
});
for (const button of actionButtons) {
  button.addEventListener("click", () => runAction(button.dataset.act, button));
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !viewer.hidden) closeViewer();
});
