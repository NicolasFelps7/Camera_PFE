// =====================================================
//  Capturador Analítico
//  - context.filter   → efeito visual na foto
//  - context.fillText → nome do aluno + data/hora
//  - track.stop()     → desliga o hardware da câmera
// =====================================================

const video       = document.getElementById("video");
const canvas      = document.getElementById("canvas");
const context     = canvas.getContext("2d");

const btnPower    = document.getElementById("btnPower");
const powerLabel  = document.getElementById("powerLabel");
const btnCapture  = document.getElementById("btnCapture");
const btnDownload = document.getElementById("btnDownload");

const nameInput   = document.getElementById("studentName");
const viewfinder  = document.getElementById("viewfinder");
const hudTop      = document.getElementById("hudTop");
const hudBottom   = document.getElementById("hudBottom");
const hudName     = document.getElementById("hudName");
const hudFilter   = document.getElementById("hudFilter");
const clock       = document.getElementById("clock");
const statusBox   = document.getElementById("status");
const statusText  = document.getElementById("statusText");
const photoFrame  = document.querySelector(".photo-frame");
const gallery     = document.getElementById("gallery");
const countLabel  = document.getElementById("count");
const toast       = document.getElementById("toast");

let stream = null;       // guarda o MediaStream para poder desligá-lo depois
let clockTimer = null;
let toastTimer = null;
let starting = false;
let photos = [];         // histórico da sessão

/* ---------- Utilidades ---------- */

function getSelectedInput() {
  return document.querySelector('input[name="filter"]:checked');
}
const getSelectedFilter = () => getSelectedInput().value;

function formatNow() {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).replace(",", " às");
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3200);
}

function setStatus(state, text) {
  statusBox.dataset.state = state;
  statusText.textContent = text;
}

// Atualiza todo o visual conforme a câmera esteja ligada ou não.
function setCameraUI(isOn) {
  btnPower.dataset.state = isOn ? "on" : "off";
  btnPower.setAttribute("aria-pressed", String(isOn));
  powerLabel.textContent = isOn ? "Desligar câmera" : "Ligar câmera";

  btnCapture.disabled = !isOn;
  hudTop.hidden = !isOn;
  hudBottom.hidden = !isOn;
  viewfinder.classList.toggle("live", isOn);
}

function updateHud() {
  hudName.textContent = nameInput.value.trim() || "Aluno não informado";
  hudFilter.textContent = getSelectedInput().dataset.label;
}

function startClock() {
  const tick = () => (clock.textContent = formatNow());
  tick();
  clockTimer = setInterval(tick, 1000);
}

/* ---------- Ligar a câmera ---------- */

async function startCamera() {
  if (starting) return;
  starting = true;
  btnPower.disabled = true;
  setStatus("off", "Iniciando câmera…");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    video.style.filter = getSelectedFilter(); // pré-visualiza o filtro escolhido
    updateHud();
    setCameraUI(true);
    setStatus("on", "Câmera ligada");
    startClock();
  } catch (err) {
    console.error(err);
    setCameraUI(false);
    setStatus("error", "Sem acesso à câmera");
    showToast(
      err.name === "NotAllowedError"
        ? "Permissão negada. Libere o acesso à câmera no navegador."
        : "Não foi possível abrir a câmera neste dispositivo."
    );
  } finally {
    starting = false;
    btnPower.disabled = false;
  }
}

/* ---------- Desligar a câmera ---------- */

function stopCamera() {
  if (!stream) return;

  // Percorre cada track do stream e encerra: libera o hardware.
  stream.getTracks().forEach((track) => track.stop());

  stream = null;
  video.srcObject = null;
  clearInterval(clockTimer);

  setCameraUI(false);
  setStatus("off", "Câmera desligada");
}

// Um único botão: se há stream, desliga; se não há, liga.
function togglePower() {
  if (stream) stopCamera();
  else startCamera();
}

/* ---------- Capturar a foto ---------- */

function capturePhoto() {
  const student = nameInput.value.trim();
  if (!student) {
    nameInput.classList.remove("invalid");
    void nameInput.offsetWidth;            // reinicia a animação
    nameInput.classList.add("invalid");
    nameInput.focus();
    showToast("Digite o nome do aluno antes de capturar.");
    return;
  }

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    showToast("A câmera ainda está iniciando. Tente de novo.");
    return;
  }

  canvas.width = w;
  canvas.height = h;

  // 1) FILTRO VISUAL: precisa ser definido ANTES do drawImage.
  context.filter = getSelectedFilter();
  context.drawImage(video, 0, 0, w, h);

  // 2) Remove o filtro para que o texto saia com as cores originais.
  context.filter = "none";

  // 3) DADOS DINÂMICOS: faixa escura para dar contraste ao texto.
  const bar = Math.round(h * 0.17);
  const grad = context.createLinearGradient(0, h - bar, 0, h);
  grad.addColorStop(0, "rgba(8, 14, 28, 0)");
  grad.addColorStop(1, "rgba(8, 14, 28, 0.85)");
  context.fillStyle = grad;
  context.fillRect(0, h - bar, w, bar);

  const margin = Math.round(w * 0.03);
  const nameSize = Math.max(18, Math.round(w * 0.034));
  const dateSize = Math.max(14, Math.round(w * 0.022));

  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(0, 0, 0, 0.6)";
  context.shadowBlur = 6;

  context.fillStyle = "#ffffff";
  context.font = `700 ${nameSize}px "Bricolage Grotesque", "Segoe UI", sans-serif`;
  context.fillText(student, margin, h - margin - dateSize - 8);

  context.fillStyle = "#dbe4f5";
  context.font = `500 ${dateSize}px "Instrument Sans", "Segoe UI", sans-serif`;
  context.fillText(formatNow(), margin, h - margin);

  context.shadowBlur = 0;

  photoFrame.classList.add("has-photo");
  btnDownload.disabled = false;
  addToGallery(student);
}

/* ---------- Histórico e download ---------- */

function addToGallery(student) {
  const dataUrl = canvas.toDataURL("image/png");
  photos.push({ dataUrl, student });

  const index = photos.length - 1;
  const li = document.createElement("li");
  const btn = document.createElement("button");
  const img = document.createElement("img");

  img.src = dataUrl;
  img.alt = `Foto ${photos.length} de ${student}`;
  btn.type = "button";
  btn.title = `Ver foto ${photos.length}`;
  btn.appendChild(img);
  btn.addEventListener("click", () => showPhoto(index, btn));

  li.appendChild(btn);
  gallery.prepend(li);

  countLabel.textContent = `${photos.length} ${photos.length === 1 ? "foto" : "fotos"}`;
  markCurrent(btn);
}

function markCurrent(activeBtn) {
  gallery.querySelectorAll("button").forEach((b) => b.removeAttribute("aria-current"));
  activeBtn.setAttribute("aria-current", "true");
}

function showPhoto(index, btn) {
  const image = new Image();
  image.onload = () => {
    canvas.width = image.width;
    canvas.height = image.height;
    context.filter = "none";
    context.drawImage(image, 0, 0);
  };
  image.src = photos[index].dataUrl;
  markCurrent(btn);
}

function downloadPhoto() {
  const link = document.createElement("a");
  link.download = `captura-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/* ---------- Eventos ---------- */

btnPower.addEventListener("click", togglePower);
btnCapture.addEventListener("click", capturePhoto);
btnDownload.addEventListener("click", downloadPhoto);

document.getElementById("filters").addEventListener("change", () => {
  video.style.filter = getSelectedFilter();
  updateHud();
});

nameInput.addEventListener("input", () => {
  nameInput.classList.remove("invalid");
  updateHud();
});

// Boa prática: se a aba for fechada ou recarregada, solta a câmera também.
window.addEventListener("beforeunload", stopCamera);

// Aviso caso o navegador não suporte context.filter (ex.: Safari antigo).
if (!("filter" in context)) {
  showToast("Seu navegador não suporta context.filter. Use Chrome, Edge ou Firefox.");
}
