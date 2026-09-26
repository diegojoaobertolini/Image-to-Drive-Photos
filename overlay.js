/**
 * Content Script para seleção interativa de área da tela
 */
(() => {
  // Evita múltiplas instâncias do overlay
  const existingOverlay = document.getElementById("__img_capture_overlay__");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Cria o elemento principal do overlay
  const overlay = document.createElement("div");
  overlay.id = "__img_capture_overlay__";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "2147483647",
    cursor: "crosshair",
    userSelect: "none",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    boxSizing: "border-box"
  });

  // Dica visual no topo
  const tooltip = document.createElement("div");
  tooltip.textContent = "Clique e arraste para selecionar a área (ESC para cancelar)";
  Object.assign(tooltip.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#1a73e8",
    color: "#ffffff",
    padding: "8px 18px",
    borderRadius: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: "14px",
    fontWeight: "500",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
    pointerEvents: "none",
    zIndex: "2147483648"
  });
  overlay.appendChild(tooltip);

  // Retângulo de seleção
  const selectionBox = document.createElement("div");
  Object.assign(selectionBox.style, {
    position: "fixed",
    border: "2px solid #1a73e8",
    backgroundColor: "transparent",
    boxShadow: "0 0 0 99999px rgba(0, 0, 0, 0.35)",
    display: "none",
    pointerEvents: "none",
    zIndex: "2147483647"
  });
  overlay.appendChild(selectionBox);

  document.documentElement.appendChild(overlay);

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function onMouseDown(e) {
    if (e.button !== 0) return; // Apenas botão esquerdo
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    currentX = e.clientX;
    currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    cleanup();

    // Requer área mínima de 10x10 px para evitar cliques acidentais
    if (width >= 10 && height >= 10) {
      const area = {
        x: left,
        y: top,
        width: width,
        height: height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };

      const targetService = window.__img_target_service__ || "drive";

      // Aguarda 2 quadros de animação + timeout para garantir que o navegador repintou a tela limpa
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: "area_selected",
              area: area,
              targetService: targetService
            });
          }, 50);
        });
      });
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
    }
  }

  function cleanup() {
    overlay.style.display = "none";
    overlay.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("keydown", onKeyDown);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  overlay.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);
})();
