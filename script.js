import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.0/+esm";

const fileInput = document.getElementById("fileInput");
const chooseBtn = document.getElementById("chooseBtn");
const processBtn = document.getElementById("processBtn");
const downloadBtn = document.getElementById("downloadBtn");
const originalPreview = document.getElementById("originalPreview");
const finalCanvas = document.getElementById("finalCanvas");
const statusEl = document.getElementById("status");
const fileInfo = document.getElementById("fileInfo");
const dropZone = document.getElementById("dropZone");
const barFill = document.getElementById("barFill");

let selectedFile = null;
let finalBlob = null;

chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.background = "#fff0f0";
});
dropZone.addEventListener("dragleave", () => {
  dropZone.style.background = "";
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.background = "";
  setFile(e.dataTransfer.files[0]);
});

function setStatus(text, percent = null) {
  statusEl.textContent = text;
  if (percent !== null) barFill.style.width = percent + "%";
}

function setFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please image file select karo.");
    return;
  }
  selectedFile = file;
  finalBlob = null;
  downloadBtn.disabled = true;
  fileInfo.textContent = "";
  originalPreview.src = URL.createObjectURL(file);
  originalPreview.style.display = "block";
  processBtn.disabled = false;
  setStatus("Photo ready hai. Ab process karo.", 5);
  clearCanvas();
}

function clearCanvas() {
  const ctx = finalCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 400, 400);
}

processBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  try {
    processBtn.disabled = true;
    downloadBtn.disabled = true;
    setStatus("AI model load ho raha hai... first time thoda time lagega.", 18);

    const removedBlob = await removeBackground(selectedFile, {
      progress: (key, current, total) => {
        const pct = total ? Math.min(60, 18 + Math.round((current / total) * 42)) : 30;
        setStatus("Background remove ho raha hai...", pct);
      }
    });

    setStatus("White background aur 400×400 resize ho raha hai...", 72);
    const img = await blobToImage(removedBlob);
    drawProductImage(img);

    setStatus("JPG compress ho raha hai 190KB ke andar...", 84);
    finalBlob = await canvasToJpegUnderSize(finalCanvas, 190 * 1024);

    const kb = Math.ceil(finalBlob.size / 1024);
    fileInfo.textContent = `Ready: 400×400 JPG • ${kb} KB`;
    downloadBtn.disabled = false;
    setStatus("Done. JPG download kar sakte ho.", 100);
  } catch (err) {
    console.error(err);
    setStatus("Error: Browser/model load issue. Chrome update karke internet ke sath try karo.", 0);
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

function drawProductImage(img) {
  const ctx = finalCanvas.getContext("2d");
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 400, 400);

  const padding = 28;
  const maxW = 400 - padding * 2;
  const maxH = 400 - padding * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const x = Math.round((400 - w) / 2);
  const y = Math.round((400 - h) / 2);

  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
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
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

downloadBtn.addEventListener("click", () => {
  if (!finalBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(finalBlob);
  a.download = "product-photo-400x400.jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
});
clearCanvas();
