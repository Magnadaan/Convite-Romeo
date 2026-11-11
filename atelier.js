/* ===== ATELIÊ – tela única, zoom por pinça e vários desenhos ===== */
(function () {
  'use strict';

  /* ---------- LISTA DE DESENHOS PARA COLORIR ----------
     Para adicionar mais: suba a imagem (fundo branco, contorno preto) no GitHub
     e inclua uma linha nova aqui, por exemplo:
       , { arquivo: 'desenho-2.png', nome: 'Arca de Noé' }                      */
  const DESENHOS = [
    { arquivo: 'desenho-colorir.png', nome: 'Jesus pintando o mundo' }
  ];

  const CORES = [
    '#e5533d', '#f2994a', '#ffd23a', '#a5d64c', '#3f9b4b', '#4ecdc4', '#45b7d1', '#2f6fd0',
    '#8a6fd1', '#fd79a8', '#f5c6a5', '#c68642', '#8d5524', '#8e9aa0', '#2d3436', '#ffffff'
  ];

  const MAX_LADO = 800;
  const MAX_UNDO = 10;
  const ZOOM_MAX = 8;
  const LEGADO = 'atelie_desenho_obra_v6';
  const KEY_ULTIMO = 'atelie_ultimo_desenho';
  const chave = i => 'atelie_obra_v7_' + i;

  const $ = id => document.getElementById(id);
  const overlay = $('atelieOverlay');
  const stage = $('stage');
  const board = $('board');
  const paintCanvas = $('paintCanvas');
  const lineCanvas = $('lineCanvas');
  const ctxPaint = paintCanvas.getContext('2d', { willReadFrequently: true });
  const ctxLine = lineCanvas.getContext('2d', { willReadFrequently: true });
  const brushSizeInput = $('brushSize');

  /* ---------- estado ---------- */
  let ferramenta = 'brush';
  let ferrAnterior = 'brush';
  let corAtual = CORES[0];
  let brushSize = 8;
  let modoMover = false;

  let idxAtual = 0;
  let maskData = null;
  let ateliePronto = false;
  let atelieIniciado = false;

  let undoStack = [];
  let redoStack = [];

  // vista (zoom e deslocamento)
  const view = { s: 1, tx: 0, ty: 0 };
  let sw = 0, sh = 0, bw = 0, bh = 0;

  // ponteiros
  const ptrs = new Map();
  let gesto = null;
  let tap = null;
  let ignorar = false;
  let drawing = false, drawId = null, strokeT0 = 0;
  let lastX = 0, lastY = 0;
  let panLast = null;

  /* ---------- avisos ---------- */
  let toastT = null;
  function showToast(msg, cor) {
    let t = $('atlToast');
    if (!t) { t = document.createElement('div'); t.id = 'atlToast'; overlay.appendChild(t); }
    t.textContent = msg;
    t.style.background = cor || '';
    t.classList.add('vis');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('vis'), 2600);
  }

  /* ---------- armazenamento ---------- */
  function lerSalvo(i) {
    try {
      return localStorage.getItem(chave(i)) || (i === 0 ? localStorage.getItem(LEGADO) : null);
    } catch (_) { return null; }
  }

  let persistTimer = null;
  function persistirAgora() {
    clearTimeout(persistTimer);
    if (!ateliePronto) return;
    try { localStorage.setItem(chave(idxAtual), paintCanvas.toDataURL()); } catch (_) {}
  }
  function persistir() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistirAgora, 500);
  }

  /* ---------- vista: ajuste, zoom e deslocamento ---------- */
  function aplicarView() {
    const W = bw * view.s, H = bh * view.s;
    view.tx = W <= sw ? (sw - W) / 2 : Math.min(0, Math.max(sw - W, view.tx));
    view.ty = H <= sh ? (sh - H) / 2 : Math.min(0, Math.max(sh - H, view.ty));
    board.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.s + ')';
  }

  function ajustarBoard(resetar) {
    sw = stage.clientWidth; sh = stage.clientHeight;
    if (!sw || !sh || !paintCanvas.width) return;
    const f = Math.min((sw - 16) / paintCanvas.width, (sh - 16) / paintCanvas.height);
    bw = paintCanvas.width * f;
    bh = paintCanvas.height * f;
    board.style.width = bw + 'px';
    board.style.height = bh + 'px';
    if (resetar) view.s = 1;
    if (view.s === 1) { view.tx = (sw - bw) / 2; view.ty = (sh - bh) / 2; }
    aplicarView();
  }

  function zoomEm(fator, cx, cy) {
    const ns = Math.min(ZOOM_MAX, Math.max(1, view.s * fator));
    if (ns === view.s) return;
    const r = ns / view.s;
    view.tx = cx - (cx - view.tx) * r;
    view.ty = cy - (cy - view.ty) * r;
    view.s = ns;
    aplicarView();
  }

  /* ---------- carregar desenho ---------- */
  function carregarDesenho(idx) {
    persistirAgora();
    idxAtual = idx;
    ateliePronto = false;
    maskData = null;
    undoStack = []; redoStack = [];
    updateHist();
    try { localStorage.setItem(KEY_ULTIMO, String(idx)); } catch (_) {}

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const escala = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * escala);
      const h = Math.round(img.naturalHeight * escala);
      paintCanvas.width = w; paintCanvas.height = h;
      lineCanvas.width = w; lineCanvas.height = h;

      ctxLine.clearRect(0, 0, w, h);
      ctxLine.drawImage(img, 0, 0, w, h);

      let imgData = null;
      try {
        imgData = ctxLine.getImageData(0, 0, w, h);
      } catch (e) {
        console.error('CORS ou erro de leitura do canvas.', e);
        showToast('⚠️ Abra o projeto via servidor para o balde funcionar.', '#c0392b');
      }

      if (imgData) {
        const data = imgData.data;
        maskData = new Uint8Array(w * h);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          const pix = i / 4;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum >= 210 || a < 25) {
            data[i + 3] = 0;
            maskData[pix] = 0;
          } else if (lum < 128) {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            maskData[pix] = 1;
          } else {
            const alpha = Math.min(200, Math.round(((210 - lum) / 82) * 255));
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = alpha;
            maskData[pix] = lum < 170 ? 1 : 0;
          }
        }
        ctxLine.putImageData(imgData, 0, 0);
      }

      ctxPaint.fillStyle = '#ffffff';
      ctxPaint.fillRect(0, 0, w, h);

      const fim = () => {
        ateliePronto = true;
        ajustarBoard(true);
      };
      const salvo = lerSalvo(idx);
      if (salvo) {
        const s = new Image();
        s.onload = () => { ctxPaint.drawImage(s, 0, 0, w, h); fim(); };
        s.onerror = fim;
        s.src = salvo;
      } else {
        fim();
      }
    };
    img.onerror = () => showToast('❌ Imagem "' + DESENHOS[idx].arquivo + '" não encontrada.', '#c0392b');
    img.src = DESENHOS[idx].arquivo;
  }

  /* ---------- histórico ---------- */
  function updateHist() {
    $('undoBtn').disabled = undoStack.length === 0;
    $('redoBtn').disabled = redoStack.length === 0;
  }

  function saveState() {
    try {
      undoStack.push(ctxPaint.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
    } catch (_) {}
    updateHist();
    persistir();
  }

  function undo() {
    if (!undoStack.length) return;
    const st = undoStack.pop();
    redoStack.push(ctxPaint.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    ctxPaint.putImageData(st, 0, 0);
    updateHist(); persistir();
  }

  function redo() {
    if (!redoStack.length) return;
    const st = redoStack.pop();
    undoStack.push(ctxPaint.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    ctxPaint.putImageData(st, 0, 0);
    updateHist(); persistir();
  }

  function limpar() {
    if (!ateliePronto) return;
    saveState();
    ctxPaint.fillStyle = '#ffffff';
    ctxPaint.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    persistir();
    showToast('Desenho limpo. Toque em desfazer para voltar.');
  }

  /* ---------- balde de tinta ---------- */
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
        if (n >= 0 && n < w * h && maskData[n] === 0) { startPos = n; found = true; break; }
      }
      if (!found) return;
    }

    const startIdx = startPos * 4;
    const tR = data[startIdx], tG = data[startIdx + 1], tB = data[startIdx + 2], tA = data[startIdx + 3];
    if (tR === fillR && tG === fillG && tB === fillB && tA === 255) return;

    const tol = 60;
    const seen = new Uint8Array(w * h);
    const stack = [startPos];

    while (stack.length) {
      const pos = stack.pop();
      if (seen[pos]) continue;
      seen[pos] = 1;
      if (maskData[pos] === 1) continue;

      const x = pos % w, y = (pos / w) | 0, idx = pos * 4;
      if (Math.abs(data[idx] - tR) > tol || Math.abs(data[idx + 1] - tG) > tol ||
          Math.abs(data[idx + 2] - tB) > tol || Math.abs(data[idx + 3] - tA) > tol) continue;

      data[idx] = fillR; data[idx + 1] = fillG; data[idx + 2] = fillB; data[idx + 3] = 255;

      if (x > 0) stack.push(pos - 1);
      if (x < w - 1) stack.push(pos + 1);
      if (y > 0) stack.push(pos - w);
      if (y < h - 1) stack.push(pos + w);
    }
    ctxPaint.putImageData(imageData, 0, 0);
  }

  /* ---------- cor ---------- */
  const hex2 = v => v.toString(16).padStart(2, '0');

  function setCor(hex) {
    corAtual = hex;
    $('corAtual').style.backgroundColor = hex;
    document.querySelectorAll('#paleta .atlSw').forEach(s =>
      s.classList.toggle('ativa', s.dataset.color.toLowerCase() === hex.toLowerCase()));
    const inp = $('corCustom');
    if (inp && /^#[0-9a-f]{6}$/i.test(hex)) inp.value = hex;
  }

  function pegarCor(x, y) {
    try {
      const d = ctxPaint.getImageData(x, y, 1, 1).data;
      setCor('#' + hex2(d[0]) + hex2(d[1]) + hex2(d[2]));
      showToast('Cor capturada!');
    } catch (_) {}
    setFerramenta(ferrAnterior === 'picker' ? 'brush' : ferrAnterior);
  }

  /* ---------- ferramentas ---------- */
  function setModoMover(on) {
    modoMover = on;
    $('moverBtn').classList.toggle('ativa', on);
    stage.classList.toggle('mover', on);
  }

  function setFerramenta(f) {
    if (f !== ferramenta && ferramenta !== 'picker') ferrAnterior = ferramenta;
    ferramenta = f;
    document.querySelectorAll('.atlTool[data-tool]').forEach(b =>
      b.classList.toggle('ativa', b.dataset.tool === f));
    const usaTamanho = f === 'brush' || f === 'eraser';
    brushSizeInput.disabled = !usaTamanho;
    $('atlSize').classList.toggle('off', !usaTamanho);
    setModoMover(false);
  }

  /* ---------- coordenadas ---------- */
  function getPos(e) {
    const rect = paintCanvas.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left) * (paintCanvas.width / rect.width)),
      y: Math.floor((e.clientY - rect.top) * (paintCanvas.height / rect.height))
    };
  }
  function posStage(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const dentro = p => p.x >= 0 && p.x < paintCanvas.width && p.y >= 0 && p.y < paintCanvas.height;

  /* ---------- traço ---------- */
  function iniciarTraco(e) {
    const { x, y } = getPos(e);
    drawing = true; drawId = e.pointerId; strokeT0 = Date.now();
    lastX = x; lastY = y;
    saveState();
    ctxPaint.beginPath();
    ctxPaint.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctxPaint.fillStyle = ferramenta === 'eraser' ? '#ffffff' : corAtual;
    ctxPaint.fill();
  }

  function continuarTraco(e) {
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    ctxPaint.strokeStyle = ferramenta === 'eraser' ? '#ffffff' : corAtual;
    ctxPaint.lineWidth = brushSize;
    ctxPaint.lineCap = 'round';
    ctxPaint.lineJoin = 'round';
    for (const ev of evs) {
      const { x, y } = getPos(ev);
      ctxPaint.beginPath();
      ctxPaint.moveTo(lastX, lastY);
      ctxPaint.lineTo(x, y);
      ctxPaint.stroke();
      lastX = x; lastY = y;
    }
  }

  function pararTraco() {
    if (!drawing) return;
    drawing = false;
    persistir();
  }

  // um segundo dedo logo no início = era uma pinça, não um traço: desfaz o pontinho
  function cancelarTraco() {
    if (!drawing) return;
    drawing = false;
    if (Date.now() - strokeT0 < 300) {
      const st = undoStack.pop();
      if (st) ctxPaint.putImageData(st, 0, 0);
      updateHist();
    }
    persistir();
  }

  /* ---------- gestos no palco ---------- */
  const doisPontos = () => { const a = [...ptrs.values()]; return [a[0], a[1]]; };

  function iniciarPinca() {
    const [a, b] = doisPontos();
    gesto = {
      d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2,
      s0: view.s, tx0: view.tx, ty0: view.ty
    };
  }

  function atualizarPinca() {
    const [a, b] = doisPontos();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ns = Math.min(ZOOM_MAX, Math.max(1, gesto.s0 * d / gesto.d0));
    view.tx = mx - ((gesto.mx0 - gesto.tx0) / gesto.s0) * ns;
    view.ty = my - ((gesto.my0 - gesto.ty0) / gesto.s0) * ns;
    view.s = ns;
    aplicarView();
  }

  function executarToque(t) {
    const p = getPos({ clientX: t.cx, clientY: t.cy });
    if (!dentro(p)) return;
    if (ferramenta === 'bucket') {
      saveState();
      floodFill(p.x, p.y, corAtual);
      persistir();
    } else if (ferramenta === 'picker') {
      pegarCor(p.x, p.y);
    }
  }

  stage.addEventListener('pointerdown', e => {
    if (!ateliePronto) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    const p = posStage(e);
    ptrs.set(e.pointerId, p);

    if (ptrs.size === 2) {
      cancelarTraco();
      tap = null; panLast = null; ignorar = true;
      iniciarPinca();
      return;
    }
    if (ptrs.size > 2 || ignorar) return;

    if (modoMover) { panLast = { x: p.x, y: p.y }; return; }
    if (ferramenta === 'brush' || ferramenta === 'eraser') {
      iniciarTraco(e);
    } else {
      tap = { id: e.pointerId, x: p.x, y: p.y, t: Date.now(), cx: e.clientX, cy: e.clientY };
    }
  });

  stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = posStage(e);
    ptrs.set(e.pointerId, p);

    if (ptrs.size >= 2 && gesto) { atualizarPinca(); return; }
    if (ignorar) return;

    if (tap && tap.id === e.pointerId && Math.hypot(p.x - tap.x, p.y - tap.y) > 10) tap = null;

    if (panLast && modoMover) {
      view.tx += p.x - panLast.x;
      view.ty += p.y - panLast.y;
      panLast = { x: p.x, y: p.y };
      aplicarView();
      return;
    }
    if (drawing && e.pointerId === drawId) continuarTraco(e);
  });

  function fimPonteiro(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (drawing && e.pointerId === drawId) pararTraco();
    if (tap && tap.id === e.pointerId) {
      if (e.type === 'pointerup' && !ignorar && Date.now() - tap.t < 600) executarToque(tap);
      tap = null;
    }
    if (ptrs.size < 2) gesto = null;
    if (ptrs.size === 0) { ignorar = false; panLast = null; }
  }
  stage.addEventListener('pointerup', fimPonteiro);
  stage.addEventListener('pointercancel', fimPonteiro);

  // roda do mouse (computador)
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const p = posStage(e);
    zoomEm(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
  }, { passive: false });

  /* ---------- salvar ---------- */
  function savePNG() {
    if (!ateliePronto) return;
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
      showToast('Obra salva!');
    }, 'image/png');
  }

  /* ---------- galeria ---------- */
  function montarGaleria() {
    const g = $('galeriaLista');
    g.innerHTML = '';
    DESENHOS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'atlThumb' + (i === idxAtual ? ' ativa' : '');

      const box = document.createElement('span');
      box.className = 'atlThumbImg';
      const salvo = i === idxAtual && ateliePronto ? paintCanvas.toDataURL() : lerSalvo(i);
      if (salvo) box.style.backgroundImage = 'url(' + salvo + ')';
      const im = document.createElement('img');
      im.src = d.arquivo; im.alt = '';
      box.appendChild(im);

      const nm = document.createElement('span');
      nm.className = 'atlThumbNome';
      nm.textContent = d.nome;

      b.appendChild(box); b.appendChild(nm);
      b.addEventListener('click', () => {
        $('galeria').classList.remove('aberto');
        if (i !== idxAtual) carregarDesenho(i);
      });
      g.appendChild(b);
    });
  }

  /* ---------- montagem da interface ---------- */
  function montarPaleta() {
    const pal = $('paleta');
    pal.innerHTML = '';
    CORES.forEach(c => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'atlSw';
      sw.style.backgroundColor = c;
      sw.dataset.color = c;
      sw.setAttribute('aria-label', 'Cor ' + c);
      sw.addEventListener('click', () => {
        setCor(c);
        if (ferramenta === 'eraser' || ferramenta === 'picker') setFerramenta('brush');
      });
      pal.appendChild(sw);
    });
    setCor(corAtual);
  }

  function abrirAtelie() {
    overlay.classList.add('aberto');
    overlay.setAttribute('aria-hidden', 'false');
    if (!atelieIniciado) {
      atelieIniciado = true;
      montarPaleta();
      setFerramenta('brush');
      $('galeriaBtn').hidden = DESENHOS.length < 2;
      let ultimo = 0;
      try { ultimo = parseInt(localStorage.getItem(KEY_ULTIMO), 10) || 0; } catch (_) {}
      if (ultimo < 0 || ultimo >= DESENHOS.length) ultimo = 0;
      carregarDesenho(ultimo);
    } else {
      ajustarBoard(false);
    }
  }

  function fecharAtelie() {
    persistirAgora();
    cancelarTraco();
    ptrs.clear(); gesto = null; tap = null; ignorar = false; panLast = null;
    document.querySelectorAll('.atlModal').forEach(m => m.classList.remove('aberto'));
    overlay.classList.remove('aberto');
    overlay.setAttribute('aria-hidden', 'true');
  }

  /* ---------- eventos dos botões ---------- */
  document.querySelectorAll('.atlTool[data-tool]').forEach(b =>
    b.addEventListener('click', () => setFerramenta(b.dataset.tool)));

  $('corCustom').addEventListener('input', e => {
    setCor(e.target.value);
    if (ferramenta === 'eraser' || ferramenta === 'picker') setFerramenta('brush');
  });

  brushSizeInput.addEventListener('input', e => { brushSize = parseInt(e.target.value, 10); });

  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('clearBtn').addEventListener('click', limpar);
  $('saveBtn').addEventListener('click', savePNG);
  $('galeriaBtn').addEventListener('click', () => { montarGaleria(); $('galeria').classList.add('aberto'); });
  $('galeriaFechar').addEventListener('click', () => $('galeria').classList.remove('aberto'));

  $('finishBtn').addEventListener('click', () => $('mensagemFinal').classList.add('aberto'));
  $('finalSalvar').addEventListener('click', savePNG);
  $('finalContinuar').addEventListener('click', () => $('mensagemFinal').classList.remove('aberto'));
  $('finalConvite').addEventListener('click', fecharAtelie);

  $('zoomIn').addEventListener('click', () => zoomEm(1.5, sw / 2, sh / 2));
  $('zoomOut').addEventListener('click', () => zoomEm(1 / 1.5, sw / 2, sh / 2));
  $('zoomReset').addEventListener('click', () => { view.s = 1; ajustarBoard(true); });
  $('moverBtn').addEventListener('click', () => setModoMover(!modoMover));

  $('fecharAtelie').addEventListener('click', fecharAtelie);
  $('atelie').addEventListener('click', e => { e.preventDefault(); abrirAtelie(); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !overlay.classList.contains('aberto')) return;
    const aberto = overlay.querySelector('.atlModal.aberto');
    if (aberto) aberto.classList.remove('aberto'); else fecharAtelie();
  });

  if (window.ResizeObserver) {
    new ResizeObserver(() => { if (overlay.classList.contains('aberto')) ajustarBoard(false); }).observe(stage);
  } else {
    window.addEventListener('resize', () => { if (overlay.classList.contains('aberto')) ajustarBoard(false); });
  }
})();
