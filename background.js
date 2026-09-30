/**
 * Background Service Worker - Image to Google Drive & Google Photos
 * Manifest V3
 */

const MENU_DRIVE_IMG = "save-image-to-drive";
const MENU_PHOTOS_IMG = "save-image-to-photos";

const MENU_SCREENSHOT_PARENT = "capture-screen-parent";
const MENU_SCREENSHOT_DRIVE = "capture-screen-drive";
const MENU_SCREENSHOT_PHOTOS = "capture-screen-photos";

const MENU_PAGE_TO_PDF = "save-page-as-pdf-drive";

// Registra as opções no menu de contexto ao instalar/atualizar a extensão
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // 1. Menus de contexto para imagens
    chrome.contextMenus.create({
      id: MENU_DRIVE_IMG,
      title: "Salvar no Drive",
      contexts: ["image"]
    });

    chrome.contextMenus.create({
      id: MENU_PHOTOS_IMG,
      title: "Salvar no Fotos",
      contexts: ["image"]
    });

    // 2. Menus de contexto para captura de tela (em qualquer lugar da página)
    chrome.contextMenus.create({
      id: MENU_SCREENSHOT_PARENT,
      title: "Capturar área",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: MENU_SCREENSHOT_DRIVE,
      parentId: MENU_SCREENSHOT_PARENT,
      title: "Drive",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: MENU_SCREENSHOT_PHOTOS,
      parentId: MENU_SCREENSHOT_PARENT,
      title: "Fotos",
      contexts: ["page"]
    });

    // 3. Menu de contexto para salvar página inteira como PDF no Google Drive
    chrome.contextMenus.create({
      id: MENU_PAGE_TO_PDF,
      title: "Salvar como PDF",
      contexts: ["page"]
    });

    console.log("[Extension] Menus de contexto registrados com sucesso.");
  });
});

// Listener para cliques nos menus de contexto
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // A) Clique em imagem existente
  if (info.menuItemId === MENU_DRIVE_IMG || info.menuItemId === MENU_PHOTOS_IMG) {
    const imageUrl = info.srcUrl;
    if (!imageUrl) {
      showNotification("Erro", "Nenhuma imagem identificada.", true);
      return;
    }
    const service = info.menuItemId === MENU_DRIVE_IMG ? "drive" : "photos";
    await handleImageSave(imageUrl, service, info.pageUrl || tab?.url);
    return;
  }

  // B) Clique em captura de tela
  if (info.menuItemId === MENU_SCREENSHOT_DRIVE || info.menuItemId === MENU_SCREENSHOT_PHOTOS) {
    const service = info.menuItemId === MENU_SCREENSHOT_DRIVE ? "drive" : "photos";
    await triggerAreaSelection(tab, service);
    return;
  }

  // C) Clique em transformar página em PDF
  if (info.menuItemId === MENU_PAGE_TO_PDF) {
    await handlePageToPdf(tab);
  }
});

// Listener para mensagens vindas do content script (overlay de seleção)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "area_selected") {
    handleAreaCapture(message.area, message.targetService, sender.tab);
  }
});

/**
 * Dispara notificações nativas usando chrome.notifications
 */
function showNotification(title, message, isError = false) {
  const options = {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message,
    priority: isError ? 2 : 1
  };
  chrome.notifications.create(`notify_${Date.now()}`, options, (id) => {
    if (chrome.runtime.lastError) {
      console.error("[Notification Error]", chrome.runtime.lastError.message);
    }
  });
}

/**
 * Injeta o script de seleção na aba ativa
 */
async function triggerAreaSelection(tab, targetService) {
  if (!tab?.id) {
    showNotification("Erro", "Não foi possível identificar a aba ativa.", true);
    return;
  }

  // Bloqueia preventivamente tentativas de injeção em abas internas do navegador
  const isInternalPage = !tab.url || 
    tab.url.startsWith("chrome://") || 
    tab.url.startsWith("chrome-extension://") || 
    tab.url.startsWith("edge://") || 
    tab.url.startsWith("about:") || 
    tab.url.startsWith("view-source:");

  if (isInternalPage) {
    showNotification("Aviso", "O Chrome não permite capturar telas em páginas internas do sistema.", true);
    return;
  }

  try {
    // 1. Armazena o serviço de destino na aba
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (service) => { window.__img_target_service__ = service; },
      args: [targetService]
    });

    // 2. Injeta o overlay de seleção
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["overlay.js"]
    });
  } catch (err) {
    console.warn("[Screenshot] Não foi possível injetar overlay:", err.message);
    showNotification("Erro na Captura", "Não é permitido capturar telas nesta página.", true);
  }
}

/**
 * Processa a captura da aba visível, recorta a área selecionada e envia para a nuvem
 */
async function handleAreaCapture(area, targetService, tab) {
  const serviceName = targetService === "photos" ? "Google Fotos" : "Google Drive";

  try {
    // Garante que o navegador completou o ciclo de repintura sem o overlay
    await new Promise((resolve) => setTimeout(resolve, 60));

    // 1. Captura a viewport atual da aba
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

    // 2. Converte a captura para Bitmap
    const response = await fetch(dataUrl);
    const fullBlob = await response.blob();
    const bitmap = await createImageBitmap(fullBlob);

    // 3. Calcula as proporções entre o bitmap capturado e a viewport do navegador
    const scaleX = bitmap.width / area.viewportWidth;
    const scaleY = bitmap.height / area.viewportHeight;

    const cropX = Math.round(area.x * scaleX);
    const cropY = Math.round(area.y * scaleY);
    const cropW = Math.round(area.width * scaleX);
    const cropH = Math.round(area.height * scaleY);

    if (cropW <= 0 || cropH <= 0) {
      throw new Error("Área selecionada inválida.");
    }

    // 4. Recorta a imagem usando OffscreenCanvas no Service Worker
    const canvas = new OffscreenCanvas(cropW, cropH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const croppedBlob = await canvas.convertToBlob({ type: "image/png" });

    // 5. Gerar nome de arquivo via template
    const settings = await getSettings();
    const filename = buildFilenameFromTemplate(settings.filenameTemplate, "image/png", null, tab?.url, "screenshot");

    // 6. Obter token e enviar
    const token = await getAuthToken();

    if (targetService === "photos") {
      await uploadToPhotos(token, croppedBlob, filename, "image/png");
    } else {
      await uploadToDrive(token, croppedBlob, filename, "image/png");
    }

    // 7. Notificação única de sucesso
    showNotification("Upload Concluído!", `Captura salva no ${serviceName} com sucesso!`);
    console.log(`[Screenshot] Captura '${filename}' enviada para o ${serviceName}.`);

  } catch (error) {
    console.error("[Screenshot Error]", error);
    if (error.message && (error.message.includes("401") || error.message.includes("403"))) {
      await clearAuthToken();
    }
    showNotification("Erro na Captura", error.message || "Falha ao processar a captura.", true);
  }
}

/**
 * Fluxo de salvar imagem existente a partir de sua URL
 */
async function handleImageSave(imageUrl, targetService, pageUrl) {
  const serviceName = targetService === "photos" ? "Google Fotos" : "Google Drive";

  try {
    // 1. Obter Token OAuth2
    const token = await getAuthToken();

    // 2. Fazer download da imagem
    const { blob, mimeType: initialMime } = await fetchImageBlob(imageUrl);

    // 3. Obter configurações do usuário
    const settings = await getSettings();

    // 4. Processar imagem (conversão de formatos modernos .webp/.avif e remoção de EXIF)
    const { blob: finalBlob, mimeType: finalMime } = await processImageBlob(blob, initialMime, settings);

    // 5. Gerar nome do arquivo aplicando o template
    const filename = buildFilenameFromTemplate(settings.filenameTemplate, finalMime, imageUrl, pageUrl, "imagem");

    // 6. Upload para o serviço selecionado
    if (targetService === "photos") {
      await uploadToPhotos(token, finalBlob, filename, finalMime);
    } else {
      await uploadToDrive(token, finalBlob, filename, finalMime);
    }

    // 7. Notificação única de sucesso
    showNotification("Upload Concluído!", `Imagem salva no ${serviceName} com sucesso!`);
    console.log(`[Image] Imagem '${filename}' enviada com sucesso para o ${serviceName}.`);

  } catch (error) {
    console.error(`[${serviceName}] Erro:`, error);
    if (error.message && (error.message.includes("401") || error.message.includes("403"))) {
      await clearAuthToken();
    }
    showNotification("Erro no Upload", error.message || "Falha ao enviar a imagem.", true);
  }
}


/**
 * Obtém o token de acesso OAuth2 usando chrome.identity
 */
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(`Falha na autenticação: ${chrome.runtime.lastError.message}`));
      }
      if (!token) {
        return reject(new Error("Falha na autenticação: nenhum token recebido."));
      }
      resolve(token);
    });
  });
}

/**
 * Remove o token do cache local para forçar nova autorização se necessário
 */
function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.log("[Auth] Cache do token removido.");
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Baixa o blob da imagem a partir da URL
 */
async function fetchImageBlob(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Status HTTP ${response.status} (${response.statusText})`);
    }
    const blob = await response.blob();
    const mimeType = blob.type || "image/png";
    return { blob, mimeType };
  } catch (err) {
    throw new Error(`Falha ao obter imagem da URL: ${err.message}`);
  }
}

/**
 * Gera um nome para o arquivo com base no timestamp local e extensão
 */
function generateFilename(mimeType, url, prefix = "image") {
  const mimeToExt = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/x-icon": "ico"
  };

  let ext = mimeToExt[mimeType];
  if (!ext && url) {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        ext = match[1].toLowerCase();
      }
    } catch (_) {}
  }
  if (!ext) {
    ext = "png";
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `${prefix}_${timestamp}.${ext}`;
}

/**
 * Realiza o upload multipart para a API v3 do Google Drive
 */
async function uploadToDrive(token, blob, filename, mimeType) {
  const metadata = {
    name: filename,
    mimeType: mimeType
  };

  const boundary = "-------ImageToDriveBoundary" + Math.random().toString(36).substring(2);
  const delimiter = `--${boundary}\r\n`;
  const middleDelimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    middleDelimiter,
    `Content-Type: ${mimeType}\r\n\r\n`,
    blob,
    closeDelimiter
  ], { type: `multipart/related; boundary=${boundary}` });

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na API do Google Drive (HTTP ${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Realiza o upload para a Google Photos Library API
 */
async function uploadToPhotos(token, blob, filename, mimeType) {
  // Passo 1: Enviar os bytes brutos para o endpoint de uploads e obter o uploadToken
  const uploadResponse = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": mimeType,
      "X-Goog-Upload-Protocol": "raw"
    },
    body: blob
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Falha no upload para o Google Fotos (HTTP ${uploadResponse.status}): ${errorText}`);
  }

  const uploadToken = await uploadResponse.text();

  // Passo 2: Criar o item de mídia na biblioteca do Google Fotos
  const createResponse = await fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      newMediaItems: [
        {
          description: filename,
          simpleMediaItem: {
            fileName: filename,
            uploadToken: uploadToken
          }
        }
      ]
    })
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Falha ao registrar item no Google Fotos (HTTP ${createResponse.status}): ${errorText}`);
  }

  const result = await createResponse.json();
  const itemResult = result.newMediaItemResults?.[0];
  if (itemResult?.status?.message && itemResult.status.message !== "Success") {
    throw new Error(`Google Fotos rejeitou o item: ${itemResult.status.message}`);
  }

  return result;
}

/**
 * Converte a página inteira da aba ativa em PDF e envia para o Google Drive
 */
async function handlePageToPdf(tab) {
  if (!tab?.id) {
    showNotification("Erro", "Não foi possível identificar a aba ativa.", true);
    return;
  }

  // Bloqueia preventivamente páginas internas protegidas do Chrome
  const isInternalPage = !tab.url || 
    tab.url.startsWith("chrome://") || 
    tab.url.startsWith("chrome-extension://") || 
    tab.url.startsWith("edge://") || 
    tab.url.startsWith("about:") || 
    tab.url.startsWith("view-source:");

  if (isInternalPage) {
    showNotification("Aviso", "O Chrome não permite converter páginas internas do sistema.", true);
    return;
  }

  try {
    // 1. Gera o PDF nativo da página inteira
    const pdfBlob = await generatePdfFromTab(tab.id);

    // 2. Cria um nome limpo baseado no título da página
    const pageTitle = (tab.title || "pagina")
      .replace(/[\/\\?%*:|\x22<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 60);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `${pageTitle}_${timestamp}.pdf`;

    // 3. Obter token e enviar para o Google Drive
    const token = await getAuthToken();
    await uploadToDrive(token, pdfBlob, filename, "application/pdf");

    // 4. Notificação única de conclusão
    showNotification("Upload Concluído!", `Página salva como PDF no Google Drive!`);
    console.log(`[PDF] Página '${filename}' enviada com sucesso para o Google Drive.`);

  } catch (error) {
    console.error("[PDF Error]", error);
    if (error.message && (error.message.includes("401") || error.message.includes("403"))) {
      await clearAuthToken();
    }
    showNotification("Erro ao Gerar PDF", error.message || "Falha ao converter página em PDF.", true);
  }
}

/**
 * Utiliza o Chrome DevTools Protocol (Page.printToPDF) para gerar PDF vetorial de alta qualidade
 */
function generatePdfFromTab(tabId) {
  return new Promise((resolve, reject) => {
    const target = { tabId };

    chrome.debugger.attach(target, "1.3", () => {
      if (chrome.runtime.lastError) {
        return reject(new Error(`Falha ao conectar depurador: ${chrome.runtime.lastError.message}`));
      }

      chrome.debugger.sendCommand(
        target,
        "Page.printToPDF",
        {
          printBackground: true,
          preferCSSPageSize: true
        },
        (result) => {
          const sendError = chrome.runtime.lastError;
          // Desconecta o depurador imediatamente para fechar a barra de aviso do Chrome
          chrome.debugger.detach(target, () => {});

          if (sendError) {
            return reject(new Error(`Erro ao gerar PDF: ${sendError.message}`));
          }
          if (!result || !result.data) {
            return reject(new Error("Nenhum dado retornado na geração do PDF."));
          }

          try {
            const byteCharacters = atob(result.data);
            const byteNumbers = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([byteNumbers], { type: "application/pdf" });
            resolve(blob);
          } catch (convErr) {
            reject(new Error("Falha ao processar dados binários do PDF."));
          }
        }
      );
    });
  });
}

/**
 * Configurações padrão da extensão
 */
const DEFAULT_SETTINGS = {
  conversionMode: "convert_modern", // "convert_modern", "always_png", "always_jpg", "none"
  targetFormat: "image/jpeg",       // "image/jpeg", "image/png"
  jpegQuality: 0.92,
  stripExif: true,
  filenameTemplate: "{data}_{hora}_{dominio}"
};

/**
 * Carrega as preferências do usuário no chrome.storage.sync
 */
function getSettings() {
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

/**
 * Converte formatos de imagem (ex: .webp, .avif -> .jpg/.png) e remove metadados EXIF
 */
async function processImageBlob(blob, initialMime, settings = DEFAULT_SETTINGS) {
  const isModern = initialMime === "image/webp" || initialMime === "image/avif";
  let shouldConvert = false;
  let targetMime = initialMime;

  if (settings.conversionMode === "always_png") {
    targetMime = "image/png";
    shouldConvert = initialMime !== "image/png" || Boolean(settings.stripExif);
  } else if (settings.conversionMode === "always_jpg") {
    targetMime = "image/jpeg";
    shouldConvert = initialMime !== "image/jpeg" || Boolean(settings.stripExif);
  } else if (settings.conversionMode === "convert_modern") {
    if (isModern) {
      targetMime = settings.targetFormat || "image/jpeg";
      shouldConvert = true;
    } else if (settings.stripExif) {
      shouldConvert = true;
    }
  } else if (settings.stripExif) {
    shouldConvert = true;
  }

  // Não necessita processamento nem conversão
  if (!shouldConvert) {
    return { blob, mimeType: initialMime };
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");

    // Preenche com branco ao converter para JPEG para evitar fundo preto em canais alfa transparentes
    if (targetMime === "image/jpeg" || targetMime === "image/jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }

    ctx.drawImage(bitmap, 0, 0);

    const convertOptions = { type: targetMime };
    if (targetMime === "image/jpeg" || targetMime === "image/jpg") {
      convertOptions.quality = typeof settings.jpegQuality === "number" ? settings.jpegQuality : 0.92;
    }

    const convertedBlob = await canvas.convertToBlob(convertOptions);
    return { blob: convertedBlob, mimeType: targetMime };
  } catch (err) {
    console.warn("[ProcessImage] Falha ao processar canvas/bitmap. Mantendo blob original:", err);
    return { blob, mimeType: initialMime };
  }
}

/**
 * Constrói o nome do arquivo aplicando as variáveis ao template configurado
 */
function buildFilenameFromTemplate(template, mimeType, sourceUrl, pageUrl, defaultPrefix = "imagem") {
  const mimeToExt = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "application/pdf": "pdf"
  };

  let ext = mimeToExt[mimeType];
  if (!ext && sourceUrl) {
    try {
      const pathname = new URL(sourceUrl).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        ext = match[1].toLowerCase();
      }
    } catch (_) {}
  }
  if (!ext) {
    ext = "png";
  }

  // Extrair domínio (prioriza pageUrl, depois sourceUrl)
  let domain = "web";
  for (const candidateUrl of [pageUrl, sourceUrl]) {
    if (candidateUrl && typeof candidateUrl === "string" && candidateUrl.startsWith("http")) {
      try {
        const u = new URL(candidateUrl);
        domain = u.hostname.replace(/^www\./, "");
        if (domain) break;
      } catch (_) {}
    }
  }

  // Extrair nome original
  let originalName = defaultPrefix;
  if (sourceUrl && typeof sourceUrl === "string" && !sourceUrl.startsWith("data:") && !sourceUrl.startsWith("blob:")) {
    try {
      const pathname = new URL(sourceUrl).pathname;
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const last = decodeURIComponent(segments[segments.length - 1]);
        const cleanLast = last.replace(/\.[a-zA-Z0-9]+$/, "").trim();
        if (cleanLast) {
          originalName = cleanLast;
        }
      }
    } catch (_) {}
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dataStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const horaStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const timestampStr = String(now.getTime());

  const vars = {
    data: dataStr,
    hora: horaStr,
    dominio: domain,
    nome_original: originalName,
    timestamp: timestampStr,
    extensao: ext
  };

  let result = (template && typeof template === "string" && template.trim()) 
    ? template.trim() 
    : "{data}_{hora}_{dominio}";

  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "gi"), v || "");
  }

  // Remove placeholders desconhecidos
  result = result.replace(/\{[a-zA-Z0-9_]+\}/g, "");
  // Sanitiza caracteres proibidos em sistemas de arquivo
  result = result.replace(/[\/\\?%*:|\x22<>]/g, "_");
  // Substitui espaços por underscores e colapsa múltiplos underscores
  result = result.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  if (!result) {
    result = `${defaultPrefix}_${timestampStr}`;
  }

  return `${result}.${ext}`;
}


