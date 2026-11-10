/* ===== ATELIÊ – PINTURA (OTIMIZADO PARA SMARTPHONES) ===== */
(function () {
  const overlay = document.getElementById('atelieOverlay');
  const paintCanvas = document.getElementById('paintCanvas');
  const lineCanvas = document.getElementById('lineCanvas');
  const ctxPaint = paintCanvas.getContext('2d');
  const ctxLine = lineCanvas.getContext('2d');
  const brushSizeInput = document.getElementById('brushSize');
  const paletaDiv = document.getElementById('paleta');
  const mensagemFinal = document.getElementById('mensagemFinal');

  let currentTool = 'brush';
  let currentColor = '#e5533d';
  let brushSize = 8;
  let drawing = false;
  let lastX = 0, lastY = 0;
  let undoStack = [];
  let redoStack = [];
  const maxUndo = 10;

  let maskData = null;
  let atelieIniciado = false;
  let ateliePronto = false;

  const STORAGE_KEY = 'atelie_desenho_obra_v6';

  const atelierCores = [
    '#e5533d', '#ffd23a', '#4a86d4', '#7cb342', '#f2994a', '#8a6fd1',
    '#ff8c42', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dfe6e9', '#636e72', '#2d3436', '#fd79a8'
  ];

  function showToast(msg, cor) {
    const existing = document.getElementById('atelieToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'atelieToast';
    toast.textContent = msg;
    toast.style.cssText = [
      'position:fixed',
      'bottom:22px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:' + (cor || '#b4531c'),
      'color:#fff',
      'padding:10px 20px',
      'border-radius:999px',
      'font-family:var(--mao, cursive)',
      'font-size:1.1rem',
      'z-index:2000',
      'box-shadow:0 6px 18px rgba(0,0,0,.35)',
      'max-width:90vw',
      'text-align:center',
      'pointer-events:none',
      'transition:opacity .3s'
    ].join(';');

    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 3500);
    setTimeout(() => toast.remove(), 3900);
  }

  function carregarDesenhoBase(onReady) {
    maskData = null;
    ateliePronto = false;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'desenho-colorir.png';

    img.onload = () => {
      const maxLado = 800;
      const escala = Math.min(
        1,
        maxLado / Math.max(img.naturalWidth, img.naturalHeight)
      );

      const w = Math.round(img.naturalWidth * escala);
      const h = Math.round(img.naturalHeight * escala);

      paintCanvas.width = w;
      paintCanvas.height = h;
      lineCanvas.width = w;
      lineCanvas.height = h;

      const wrapper = document.querySelector('.canvasWrapper');
      if (wrapper) {
        wrapper.style.aspectRatio = w + ' / ' + h;
      }

      ctxLine.clearRect(0, 0, w, h);
      ctxLine.drawImage(img, 0, 0, w, h);

      let imgData;
      try {
        imgData = ctxLine.getImageData(0, 0, w, h);
      } catch (e) {
        console.error('CORS ou erro de leitura do canvas.', e);
        showToast('⚠️ Abra o projeto via servidor local para o balde funcionar.', '#c0392b');
        if (onReady) onReady();
        return;
      }

      const data = imgData.data;
      maskData = new Uint8Array(w * h);

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const pixIndex = i / 4;

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum >= 210 || a < 25) {
          data[i + 3] = 0;
          maskData[pixIndex] = 0;
        } else if (lum < 128) {
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
          maskData[pixIndex] = 1;
        } else {
          const alpha = Math.min(200, Math.round(((210 - lum) / 82) * 255));
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = alpha;
          maskData[pixIndex] = lum < 170 ? 1 : 0;
        }
      }

      ctxLine.putImageData(imgData, 0, 0);
      if (onReady) onReady();
    };

    img.onerror = () => {
      showToast('❌ Imagem "desenho-colorir.png" não encontrada.', '#c0392b');
      if (onReady) onReady();
    };
  }

  let persistTimer = null;
  function persistirDesenho() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, paintCanvas.toDataURL()); } catch (_) {}
    }, 500);
  }

  function carregarDesenhoSalvo(onDone) {
    const dataUrl = localStorage.getItem(STORAGE_KEY);
    if (!dataUrl) { if (onDone) onDone(); return; }

    const img = new Image();
    img.onload = () => {
      ctxPaint.drawImage(img, 0, 0, paintCanvas.width, paintCanvas.height);
      if (onDone) onDone();
    };
    img.onerror = () => { if (onDone) onDone(); };
    img.src = dataUrl;
  }

  function initAtelie() {
    paletaDiv.innerHTML = '';
    atelierCores.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (c === currentColor ? ' active' : '');
      sw.style.backgroundColor = c;
      sw.dataset.color = c;
      sw.addEventListener('click', () => {
        currentColor = c;
        document.querySelectorAll('#paleta .swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      });
      paletaDiv.appendChild(sw);
    });

    undoStack = []; redoStack = [];
    updateToolUI();

    carregarDesenhoBase(() => {
      ctxPaint.fillStyle = '#ffffff';
      ctxPaint.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
      carregarDesenhoSalvo(() => {
        ateliePronto = true;
        showToast('Escolha uma cor e toque no balde 🪣', '#1f6fd1');
      });
    });
  }

  function updateToolUI() {
    document.getElementById('toolBrush').classList.toggle('active', currentTool === 'brush');
    document.getElementById('toolEraser').classList.toggle('active', currentTool === 'eraser');
    document.getElementById('toolBucket').classList.toggle('active', currentTool === 'bucket');
  }

  function saveState() {
    try {
      undoStack.push(ctxPaint.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
      if (undoStack.length > maxUndo) undoStack.shift();
      redoStack = [];
    } catch (_) {}
    persistirDesenho();
  }

  function undo() {
    if (undoStack.length === 0) return;
    const state = undoStack.pop();
    redoStack.push(ctxPaint.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    ctxPaint.putImageData(state, 0, 0);
    persistirDesenho();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const state = redoStack.pop();
    undoStack.push(ctxPaint.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    ctxPaint.putImageData(state, 0, 0);
    persistirDesenho();
  }

  function clearCanvas() {
    saveState();
    ctxPaint.fillStyle = '#ffffff';
    ctxPaint.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    persistirDesenho();
  }

  function floodFill(startX, startY, fillHex) {
    if (!maskData) return;
    const w = paintCanvas.width, h = paintCanvas.height;
    let imageData;
    try { imageData = ctxPaint.getImageData(0, 0, w, h); } catch (e) { return; }

    const data = imageData.data;
    const fillR = parseInt(fillHex.slice(1, 3), 16);
    const fillG = parseInt(fillHex.slice(3, 5), 16);
    const fillB = parseInt(fillHex.slice(5, 7), 16);

    let startPos = startY * w + startX;
    if (maskData[startPos] === 1) {
      const neighbors = [startPos - 1, startPos + 1, startPos - w, startPos + w];
      let found = false;
      for (const n of neighbors) {
        if (n >= 0 && n < w * h && maskData[n] === 0) {
          startPos = n; startX = n % w; startY = Math.floor(n / w);
          found = true; break;
        }
      }
      if (!found) return;
    }

    const startIdx = startPos * 4;
    const targetR = data[startIdx], targetG = data[startIdx + 1], targetB = data[startIdx + 2], targetA = data[startIdx + 3];

    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === 255) return;

    const tol = 60;
    function matches(r, g, b, a) {
      return Math.abs(r - targetR) <= tol && Math.abs(g - targetG) <= tol &&
             Math.abs(b - targetB) <= tol && Math.abs(a - targetA) <= tol;
    }

    const seen = new Uint8Array(w * h);
    const stack = [startPos];

    while (stack.length) {
      const pos = stack.pop();
      if (seen[pos]) continue;
      seen[pos] = 1;
      if (maskData[pos] === 1) continue;

      const x = pos % w, y = (pos / w) | 0, idx = pos * 4;
      if (!matches(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) continue;

      data[idx] = fillR; data[idx + 1] = fillG; data[idx + 2] = fillB; data[idx + 3] = 255;

      if (x > 0) stack.push(pos - 1);
      if (x < w - 1) stack.push(pos + 1);
      if (y > 0) stack.push(pos - w);
      if (y < h - 1) stack.push(pos + w);
    }
    ctxPaint.putImageData(imageData, 0, 0);
  }

  /* Coordenadas precisas de toque/mouse */
  function getPos(e) {
    const rect = paintCanvas.getBoundingClientRect();
    const scaleX = paintCanvas.width / rect.width;
    const scaleY = paintCanvas.height / rect.height;

    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }

    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY)
    };
  }

  function startDrawing(e) {
    if (e.cancelable) e.preventDefault();
    if (!ateliePronto) return;
    if (e.isPrimary === false) return;
    try { paintCanvas.setPointerCapture(e.pointerId); } catch (_) {}

    const { x, y } = getPos(e);

    if (currentTool === 'bucket') {
      if (x >= 0 && x < paintCanvas.width && y >= 0 && y < paintCanvas.height) {
        saveState();
        floodFill(x, y, currentColor);
        persistirDesenho();
      }
      return;
    }

    drawing = true;
    lastX = x; lastY = y;
    saveState();

    ctxPaint.beginPath();
    ctxPaint.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctxPaint.fillStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    ctxPaint.fill();
  }

  function draw(e) {
    if (!drawing) return;
    if (e.cancelable) e.preventDefault();

    const events = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];

    ctxPaint.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    ctxPaint.lineWidth = brushSize;
    ctxPaint.lineCap = 'round';
    ctxPaint.lineJoin = 'round';

    for (const ev of events) {
      const { x, y } = getPos(ev);
      ctxPaint.beginPath();
      ctxPaint.moveTo(lastX, lastY);
      ctxPaint.lineTo(x, y);
      ctxPaint.stroke();
      lastX = x; lastY = y;
    }
  }

  function stopDrawing(e) {
    if (drawing) {
      drawing = false;
      persistirDesenho();
    }
  }

  function savePNG() {
    const temp = document.createElement('canvas');
    temp.width = paintCanvas.width;
    temp.height = paintCanvas.height;
    const tctx = temp.getContext('2d');
    tctx.drawImage(paintCanvas, 0, 0);
    tctx.drawImage(lineCanvas, 0, 0);

    temp.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'obra-colorida.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Minha obra de arte' }).catch(() => {});
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'obra-colorida.png';
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  document.getElementById('toolBrush').addEventListener('click', () => { currentTool = 'brush'; updateToolUI(); });
  document.getElementById('toolEraser').addEventListener('click', () => { currentTool = 'eraser'; updateToolUI(); });
  document.getElementById('toolBucket').addEventListener('click', () => { currentTool = 'bucket'; updateToolUI(); });
  brushSizeInput.addEventListener('input', (e) => { brushSize = parseInt(e.target.value, 10); });

  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('clearBtn').addEventListener('click', clearCanvas);
  document.getElementById('saveBtn').addEventListener('click', savePNG);
  document.getElementById('finishBtn').addEventListener('click', () => { mensagemFinal.classList.add('visivel'); });

  document.getElementById('fecharAtelie').addEventListener('click', () => {
    overlay.classList.remove('aberto');
    overlay.setAttribute('aria-hidden', 'true');
    drawing = false;
  });

  document.getElementById('atelie').addEventListener('click', (e) => {
    e.preventDefault();
    overlay.classList.add('aberto');
    overlay.setAttribute('aria-hidden', 'false');
    if (!atelieIniciado) { initAtelie(); atelieIniciado = true; }
  });

  /* Pointer Events (mouse, toque e caneta) */
  paintCanvas.addEventListener('pointerdown', startDrawing);
  paintCanvas.addEventListener('pointermove', draw);
  paintCanvas.addEventListener('pointerup', stopDrawing);
  paintCanvas.addEventListener('pointercancel', stopDrawing);

})();
