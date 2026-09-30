/**
 * Gerenciador de configurações da extensão Image to Drive
 */

const DEFAULT_SETTINGS = {
  conversionMode: "convert_modern", // "convert_modern", "always_png", "always_jpg", "none"
  targetFormat: "image/jpeg",       // "image/jpeg", "image/png"
  jpegQuality: 0.92,
  stripExif: true,
  filenameTemplate: "{data}_{hora}_{dominio}"
};

document.addEventListener("DOMContentLoaded", async () => {
  const conversionModeEl = document.getElementById("conversionMode");
  const targetFormatEl = document.getElementById("targetFormat");
  const targetFormatContainer = document.getElementById("targetFormatContainer");
  const qualityContainer = document.getElementById("qualityContainer");
  const jpegQualityEl = document.getElementById("jpegQuality");
  const qualityValueEl = document.getElementById("qualityValue");
  const stripExifEl = document.getElementById("stripExif");
  const filenameTemplateEl = document.getElementById("filenameTemplate");
  const previewFilenameEl = document.getElementById("previewFilename");
  const saveBtn = document.getElementById("saveBtn");
  const saveToast = document.getElementById("saveToast");
  const chips = document.querySelectorAll(".chip");

  // Carregar configurações
  const settings = await loadSettings();

  conversionModeEl.value = settings.conversionMode;
  targetFormatEl.value = settings.targetFormat;
  jpegQualityEl.value = Math.round(settings.jpegQuality * 100);
  qualityValueEl.textContent = `${jpegQualityEl.value}%`;
  stripExifEl.checked = Boolean(settings.stripExif);
  filenameTemplateEl.value = settings.filenameTemplate || DEFAULT_SETTINGS.filenameTemplate;

  updateVisibility();
  updatePreview();

  // Listeners de alteração
  conversionModeEl.addEventListener("change", () => {
    updateVisibility();
    updatePreview();
  });

  targetFormatEl.addEventListener("change", () => {
    updateVisibility();
    updatePreview();
  });

  jpegQualityEl.addEventListener("input", () => {
    qualityValueEl.textContent = `${jpegQualityEl.value}%`;
  });

  filenameTemplateEl.addEventListener("input", updatePreview);

  // Inserção de variáveis ao clicar nos chips
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const varName = chip.getAttribute("data-var");
      insertAtCursor(filenameTemplateEl, varName);
      updatePreview();
    });
  });

  // Salvar configurações
  saveBtn.addEventListener("click", async () => {
    const updated = {
      conversionMode: conversionModeEl.value,
      targetFormat: targetFormatEl.value,
      jpegQuality: parseInt(jpegQualityEl.value, 10) / 100,
      stripExif: stripExifEl.checked,
      filenameTemplate: filenameTemplateEl.value.trim() || DEFAULT_SETTINGS.filenameTemplate
    };

    await saveSettings(updated);

    saveToast.style.display = "block";
    setTimeout(() => {
      saveToast.style.display = "none";
    }, 2000);
  });

  function updateVisibility() {
    const mode = conversionModeEl.value;
    const targetFormat = targetFormatEl.value;

    // Mostrar seletor de target format apenas quando convert_modern for selecionado
    targetFormatContainer.style.display = (mode === "convert_modern") ? "block" : "none";

    // Mostrar controle de qualidade JPEG quando a saída for JPEG
    const isJpegOutput = (mode === "always_jpg") || 
      (mode === "convert_modern" && targetFormat === "image/jpeg");

    qualityContainer.style.display = isJpegOutput ? "block" : "none";
  }

  function updatePreview() {
    const template = filenameTemplateEl.value.trim() || DEFAULT_SETTINGS.filenameTemplate;
    const mode = conversionModeEl.value;
    const target = targetFormatEl.value;

    let ext = "jpg";
    if (mode === "always_png" || (mode === "convert_modern" && target === "image/png")) {
      ext = "png";
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const sampleVars = {
      data: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      hora: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      dominio: "wikipedia_org",
      nome_original: "foto_cachorro",
      timestamp: String(now.getTime()),
      extensao: ext
    };

    let result = template;
    for (const [k, v] of Object.entries(sampleVars)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, "gi"), v);
    }
    result = result.replace(/\{[a-zA-Z0-9_]+\}/g, "");
    result = result.replace(/[\/\\?%*:|\x22<>]/g, "_");
    result = result.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");

    if (!result) result = `imagem_${sampleVars.timestamp}`;
    previewFilenameEl.textContent = `${result}.${ext}`;
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    const val = input.value;
    input.value = val.substring(0, start) + text + val.substring(end);
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus();
  }
});

function loadSettings() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        resolve(items || DEFAULT_SETTINGS);
      });
    } else {
      resolve(DEFAULT_SETTINGS);
    }
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(settings, resolve);
    } else {
      resolve();
    }
  });
}
