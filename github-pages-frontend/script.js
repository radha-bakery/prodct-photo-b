const $ = id => document.getElementById(id);

const fileInput = $("file"), pick = $("pick"), processBtn = $("process"), downloadBtn = $("download");
const original = $("original"), result = $("result"), statusEl = $("status"), info = $("info");
const apiUrl = $("apiUrl"), mode = $("mode"), enhance = $("enhance"), shadow = $("shadow"), fname = $("fname");
const brightness = $("brightness"), contrast = $("contrast"), saturation = $("saturation"), sharpen = $("sharpen");
const brv = $("brv"), cov = $("cov"), sav = $("sav"), shv = $("shv");

let selectedFile = null;
let resultBlob = null;

pick.onclick = () => fileInput.click();
fileInput.onchange = () => loadFile(fileInput.files[0]);

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return alert("Image select karo.");
  selectedFile = file;
  resultBlob = null;
  processBtn.disabled = false;
  downloadBtn.disabled = true;
  original.src = URL.createObjectURL(file);
  original.style.display = "block";
  result.style.display = "none";
  fname.value = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_ ]/g, "") || "product-photo-400x400";
  statusEl.textContent = "Photo ready hai. AI Process dabao.";
}

[brightness, contrast, saturation, sharpen].forEach(x => x.oninput = () => {
  brv.textContent = brightness.value + "%";
  cov.textContent = contrast.value + "%";
  sav.textContent = saturation.value + "%";
  shv.textContent = sharpen.value;
});

processBtn.onclick = async () => {
  if (!selectedFile) return;
  const url = apiUrl.value.trim();
  if (!url) return alert("Hugging Face Space API URL paste karo.");

  try {
    processBtn.disabled = true;
    downloadBtn.disabled = true;
    statusEl.textContent = "AI processing... first time backend wake hone me time lag sakta hai.";

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("mode", mode.value);
    fd.append("enhance", enhance.checked ? "true" : "false");
    fd.append("shadow", shadow.checked ? "true" : "false");
    fd.append("brightness", brightness.value);
    fd.append("contrast", contrast.value);
    fd.append("saturation", saturation.value);
    fd.append("sharpen", sharpen.value);

    const res = await fetch(url, { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());

    resultBlob = await res.blob();
    result.src = URL.createObjectURL(resultBlob);
    result.style.display = "block";
    info.textContent = `Ready: ${(resultBlob.size / 1024).toFixed(1)} KB`;
    downloadBtn.disabled = false;
    statusEl.textContent = "Done. JPG download kar sakte ho.";
  } catch (err) {
    console.error(err);
    alert("Process fail hua. Space URL, backend status, internet check karo.");
    statusEl.textContent = "Error: backend/API issue.";
  } finally {
    processBtn.disabled = false;
  }
};

downloadBtn.onclick = () => {
  if (!resultBlob) return;
  const a = document.createElement("a");
  const name = (fname.value || "product-photo-400x400").replace(/\.[^/.]+$/, "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-") || "product-photo-400x400";
  a.href = URL.createObjectURL(resultBlob);
  a.download = name + ".jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
};