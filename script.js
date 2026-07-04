import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.0/+esm";

const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput"), chooseBtn = $("chooseBtn"), processBtn = $("processBtn"), downloadBtn = $("downloadBtn");
const originalPreview = $("originalPreview"), editCanvas = $("editCanvas"), finalCanvas = $("finalCanvas");
const statusEl = $("status"), fileInfo = $("fileInfo"), dropZone = $("dropZone"), barFill = $("barFill");
const fileNameInput = $("fileNameInput"), gridToggle = $("gridToggle");

const moveMode = $("moveMode"), eraseMode = $("eraseMode"), restoreMode = $("restoreMode");
const rotLeft = $("rotLeft"), rotRight = $("rotRight"), flipH = $("flipH"), centerBtn = $("centerBtn");
const zoomRange = $("zoomRange"), zoomVal = $("zoomVal"), brushRange = $("brushRange"), brushVal = $("brushVal");
const undoBtn = $("undoBtn"), redoBtn = $("redoBtn"), clearMaskBtn = $("clearMaskBtn"), resetAll = $("resetAll");

const ectx = editCanvas.getContext("2d", { willReadFrequently: true });
const fctx = finalCanvas.getContext("2d");

let selectedFile = null, originalImg = null, cutoutImg = null, finalBlob = null;
let tool = "move", isPointerDown = false, lastPos = null;
let state = { rotation: 0, flip: false, zoom: 1, x: 0, y: 0, brush: 28 };
let edits = [], redoStack = [];

chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.style.background = "#fff0f0"; });
dropZone.addEventListener("dragleave", () => dropZone.style.background = "");
dropZone.addEventListener("drop", e => { e.preventDefault(); dropZone.style.background = ""; setFile(e.dataTransfer.files[0]); });

function setStatus(text, percent = null) {
  statusEl.textContent = text;
  if (percent !== null) barFill.style.width = percent + "%";
}

async function setFile(file) {
  if (!file || !file.type.startsWith("image/")) return alert("Please image file select karo.");
  selectedFile = file;
  originalImg = await blobToImage(file);
  cutoutImg = null;
  finalBlob = null;
  edits = [];
  redoStack = [];
  resetState();
  disableEditor(true);
  downloadBtn.disabled = true;
  fileInfo.textContent = "";
  fileNameInput.value = (file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_ ]/g, "").trim()) || "product-photo-400x400";
  originalPreview.src = URL.createObjectURL(file);
  originalPreview.style.display = "block";
  processBtn.disabled = false;
  setStatus("Photo ready hai. Ab AI background remove karo.", 5);
  drawWhite();
}

function resetState() {
  state = { rotation: 0, flip: false, zoom: 1, x: 0, y: 0, brush: 28 };
  zoomRange.value = 100; zoomVal.textContent = "100%";
  brushRange.value = 28; brushVal.textContent = "28px";
}

function disableEditor(disabled) {
  [rotLeft, rotRight, flipH, centerBtn, zoomRange, brushRange, undoBtn, redoBtn, clearMaskBtn, resetAll].forEach(el => el.disabled = disabled);
}

function drawWhite() {
  ectx.fillStyle = "#fff"; ectx.fillRect(0,0,600,600);
  fctx.fillStyle = "#fff"; fctx.fillRect(0,0,400,400);
}

processBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  try {
    processBtn.disabled = true; downloadBtn.disabled = true;
    setStatus("AI model load ho raha hai...", 16);
    const removedBlob = await removeBackground(selectedFile, {
      progress: (key, current, total) => {
        const pct = total ? Math.min(62, 16 + Math.round((current / total) * 46)) : 30;
        setStatus("Background remove ho raha hai...", pct);
      }
    });
    cutoutImg = await blobToImage(removedBlob);
    edits = []; redoStack = []; resetState(); disableEditor(false); setTool("move");
    await renderAll();
    setStatus("Done. Product layer ko canvas par drag karke move karo.", 100);
  } catch (err) {
    console.error(err);
    setStatus("Error: Chrome/Edge me internet ke sath try karo.", 0);
    alert("Background remove fail hua. Internet on rakho aur Chrome/Edge browser me try karo.");
  } finally {
    processBtn.disabled = false;
  }
});

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function setTool(t) {
  tool = t;
  [moveMode, eraseMode, restoreMode].forEach(b => b.classList.remove("active"));
  if (t === "move") moveMode.classList.add("active");
  if (t === "erase") eraseMode.classList.add("active");
  if (t === "restore") restoreMode.classList.add("active");
  editCanvas.style.cursor = t === "move" ? "grab" : "crosshair";
}
moveMode.onclick = () => setTool("move");
eraseMode.onclick = () => setTool("erase");
restoreMode.onclick = () => setTool("restore");

function drawLayer(ctx, img) {
  const size = ctx.canvas.width;
  const padding = size === 600 ? 42 : 28;
  const maxW = size - padding * 2, maxH = size - padding * 2;
  const baseScale = Math.min(maxW / img.width, maxH / img.height);
  const scale = baseScale * state.zoom;
  const factor = size / 400;
  const w = img.width * scale, h = img.height * scale;

  ctx.translate(size / 2 + state.x * factor, size / 2 + state.y * factor);
  ctx.rotate(state.rotation * Math.PI / 180);
  ctx.scale(state.flip ? -1 : 1, 1);
  ctx.drawImage(img, -w/2, -h/2, w, h);
}

function makeComposite(canvas, showGrid=false) {
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,c.width,c.height); // fixed stable white bg

  if (cutoutImg) {
    ctx.save(); drawLayer(ctx, cutoutImg); ctx.restore();
  }

  for (const ed of edits) {
    const scale = c.width / 600;
    const x = ed.x * scale, y = ed.y * scale, r = ed.r * scale;
    if (ed.type === "erase") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    } else if (ed.type === "restore" && originalImg) {
      const oc = document.createElement("canvas");
      oc.width = c.width; oc.height = c.height;
      const octx = oc.getContext("2d");
      octx.save(); drawLayer(octx, originalImg); octx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.clip(); ctx.drawImage(oc,0,0); ctx.restore();
    }
  }

  if (showGrid && gridToggle.checked) drawGrid(ctx, c.width);
  return c;
}

function drawGrid(ctx, size) {
  ctx.save();
  ctx.strokeStyle = "rgba(225,19,37,.28)";
  ctx.lineWidth = 1;
  const m = size * 0.07;
  ctx.strokeRect(m, m, size - 2*m, size - 2*m);
  ctx.beginPath();
  ctx.moveTo(size/2, 0); ctx.lineTo(size/2, size);
  ctx.moveTo(0, size/2); ctx.lineTo(size, size/2);
  ctx.stroke();
  ctx.restore();
}

async function renderAll() {
  const ec = makeComposite(editCanvas, true);
  ectx.clearRect(0,0,600,600); ectx.drawImage(ec,0,0);

  const fc = makeComposite(finalCanvas, false);
  fctx.clearRect(0,0,400,400); fctx.drawImage(fc,0,0);

  finalBlob = await canvasToJpegUnderSize(finalCanvas, 190 * 1024);
  fileInfo.textContent = `Ready: 400×400 JPG • ${Math.ceil(finalBlob.size/1024)} KB`;
  downloadBtn.disabled = false;
  updateUndoRedo();
}

async function canvasToJpegUnderSize(canvas, maxBytes) {
  let quality = 0.92;
  let blob = await toBlob(canvas, quality);
  while (blob.size > maxBytes && quality > 0.35) {
    quality -= 0.06;
    blob = await toBlob(canvas, quality);
  }
  return blob;
}
function toBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
}

function getPos(evt) {
  const rect = editCanvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (editCanvas.width / rect.width),
    y: (evt.clientY - rect.top) * (editCanvas.height / rect.height)
  };
}

editCanvas.addEventListener("pointerdown", evt => {
  if (!cutoutImg) return;
  evt.preventDefault();
  isPointerDown = true;
  lastPos = getPos(evt);
  editCanvas.setPointerCapture(evt.pointerId);
  if (tool !== "move") addBrush(evt);
});

editCanvas.addEventListener("pointermove", evt => {
  if (!isPointerDown || !cutoutImg) return;
  evt.preventDefault();
  const pos = getPos(evt);
  if (tool === "move") {
    state.x += (pos.x - lastPos.x) * (400 / 600);
    state.y += (pos.y - lastPos.y) * (400 / 600);
    lastPos = pos;
    renderAll();
  } else {
    addBrush(evt);
  }
});

["pointerup","pointercancel","pointerleave"].forEach(ev => editCanvas.addEventListener(ev, () => {
  isPointerDown = false;
  lastPos = null;
}));

function addBrush(evt) {
  const p = getPos(evt);
  edits.push({ type: tool, x: p.x, y: p.y, r: state.brush });
  redoStack = [];
  renderAll();
}

rotLeft.onclick = () => { state.rotation -= 90; renderAll(); };
rotRight.onclick = () => { state.rotation += 90; renderAll(); };
flipH.onclick = () => { state.flip = !state.flip; renderAll(); };
centerBtn.onclick = () => { state.x = 0; state.y = 0; renderAll(); };
resetAll.onclick = () => { resetState(); edits=[]; redoStack=[]; renderAll(); };
clearMaskBtn.onclick = () => { edits=[]; redoStack=[]; renderAll(); };
undoBtn.onclick = () => { if(edits.length){ redoStack.push(edits.pop()); renderAll(); } };
redoBtn.onclick = () => { if(redoStack.length){ edits.push(redoStack.pop()); renderAll(); } };
gridToggle.onchange = () => { if(cutoutImg) renderAll(); };

zoomRange.oninput = () => {
  state.zoom = Number(zoomRange.value) / 100;
  zoomVal.textContent = zoomRange.value + "%";
  renderAll();
};
brushRange.oninput = () => {
  state.brush = Number(brushRange.value);
  brushVal.textContent = state.brush + "px";
};

function updateUndoRedo() {
  undoBtn.disabled = !cutoutImg || edits.length === 0;
  redoBtn.disabled = !cutoutImg || redoStack.length === 0;
}

function safeFileName(name) {
  let clean = (name || "product-photo-400x400").replace(/\.[^/.]+$/, "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").trim();
  return (clean || "product-photo-400x400") + ".jpg";
}
downloadBtn.onclick = () => {
  if (!finalBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(finalBlob);
  a.download = safeFileName(fileNameInput.value);
  document.body.appendChild(a); a.click(); a.remove();
};

drawWhite();
