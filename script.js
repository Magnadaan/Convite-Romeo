/* ===== CONFIGURAÇÃO DOS TEXTOS ===== */
const CONFIG = {
  nome: "Romeo",
  idade: "1 aninho",
  data: "20 de dezembro",
  horario: "13:00",
  local: "Cherry House - rua Oiapoque nº93",
  foto: "foto-romeo.jpg",
  mapa: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Cherry House, Rua Oiapoque 93"),
  whatsapp: "+5521973387903",
  selo: "Deus é o artista da minha história!",
  legenda: "Você é minha obra de arte mais preciosa!",
  sugestaoPresente: "Roupas: 9m a 12m\nCalçados: 19 a 20"
};
/* ================================== */

const $ = s => document.querySelector(s);
const cores = ["#e5533d","#ffd23a","#4a86d4","#7cb342","#f2994a","#8a6fd1"];

/* ===================================================================
   ÁUDIO via <audio> — funciona em file:// e http(s)://
   Auto-adapta ao tamanho real do MP3:
     • >= 70s      → toca o trecho 38s–70s (32s)
     • 30s–70s     → toca o arquivo INTEIRO (o seu caso: 34s)
     • < 30s       → repete em loop até completar 32s
   Fade-out linear de 2s nos últimos 2s da timeline.
   Fade-in linear de ~1.2s ao começar a música.
   Timeline visual via performance.now() — NUNCA depende do áudio.
   =================================================================== */
console.log('📦 script.js v8 carregado');

let audioEl = null;
let audioPronto = false;
let audioDur = 0;

/* Trecho do arquivo que será reproduzido */
let cropStart = 38;
let cropEnd = 70;

/* Duração total da timeline (= duração do áudio, exceto no modo loop) */
let totalDur = 32;

/* Fade */
const FADE_LEN = 2;
let fadeStart = 30;
let fadeEnd = 32;

let loopAudio = false;
let isMuted = false;
let isPlaying = false;
let syncAnimFrame = null;
let timelineStart = 0;
let timelineIndex = 0;
let fadeMultiplier = 1;
let fadeInMultiplier = 1;
let fadeInTimer = null;
let startTimer = null;

const MUSIC_CROP = { start: 38, end: 70, duration: 32 };

const TIMELINE = [
  { t: 0.0,  fn: () => { cena("c2"); } },
  { t: 4.8,  fn: () => { cena("c3"); } },
  { t: 11.8, fn: () => { cena("c4"); pg(0); } },
  { t: 15.5, fn: () => { if (cenaAtual === "c4") pg(1); } },
  { t: 19.5, fn: () => { if (cenaAtual === "c4") pg(2); } },
  { t: 23.5, fn: () => { if (cenaAtual === "c4") pg(3); } },
  { t: 27.5, fn: () => { if (cenaAtual === "c4") pg(4); } }
];

const btnMute = document.getElementById('toggle-music');

function aplicarVolume() {
  if (!audioEl) return;
  audioEl.muted = isMuted;
  audioEl.volume = Math.max(0, Math.min(1, fadeMultiplier * fadeInMultiplier));
}

function prepararAudio() {
  try {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.src = 'musica-convite.mp3';

    audioEl.addEventListener('loadedmetadata', () => {
      audioDur = audioEl.duration;
      console.log('🎵 Duração do MP3: ' + audioDur.toFixed(2) + 's');

      if (audioDur >= MUSIC_CROP.end) {
        // Música longa: usa o trecho 38s–70s
        cropStart = MUSIC_CROP.start;
        cropEnd = MUSIC_CROP.end;
        totalDur = MUSIC_CROP.duration;
        loopAudio = false;
        console.log('   → Usando trecho ' + cropStart + 's–' + cropEnd + 's (' + totalDur + 's)');
      } else if (audioDur >= 30) {
        // Música entre 30s e 70s: usa TUDO (caso 34s)
        cropStart = 0;
        cropEnd = audioDur;
        totalDur = audioDur;
        loopAudio = false;
        console.log('   → Usando o arquivo INTEIRO (0s a ' + audioDur.toFixed(2) + 's)');
      } else {
        // Muito curta: repete em loop
        cropStart = 0;
        cropEnd = audioDur;
        totalDur = MUSIC_CROP.duration;
        loopAudio = true;
        console.log('   → MP3 muito curto. Repete em loop até ' + totalDur + 's');
      }

      fadeEnd = totalDur;
      fadeStart = Math.max(0, totalDur - FADE_LEN);
      console.log('   → Fade-out: ' + fadeStart.toFixed(2) + 's → ' + fadeEnd.toFixed(2) + 's');

      audioPronto = true;
    });

    audioEl.addEventListener('ended', () => {
      if (loopAudio && isPlaying) {
        audioEl.currentTime = cropStart;
        aplicarVolume();
        audioEl.play().catch(e => console.warn('loop:', e));
      }
    });

    audioEl.addEventListener('error', () => {
      const code = audioEl.error ? audioEl.error.code : '?';
      const nomes = { 1:'ABORTED', 2:'NETWORK', 3:'DECODE', 4:'SRC_NOT_SUPPORTED' };
      console.error('⚠️ Erro no áudio (código ' + code + ' — ' + (nomes[code] || '?') + ')');
      console.warn('   → Verifique se "musica-convite.mp3" está na mesma pasta do index.html');
    });

    audioEl.load();
  } catch (e) {
    console.error('⚠️ Falha ao criar áudio:', e);
  }
}
prepararAudio();

if (location.protocol === 'file:') {
  console.info('ℹ️ Rodando via file:// — áudio deve funcionar normalmente.');
}

function tocarMusica() {
  if (!audioEl || !audioPronto) {
    console.warn('⏸ Áudio ainda não pronto. A apresentação visual continua sem som.');
    return;
  }
  fadeMultiplier = 1;
  fadeInMultiplier = 0;          // começa em silêncio
  aplicarVolume();

  try { audioEl.currentTime = cropStart; } catch (e) {}
  const p = audioEl.play();

  if (p && p.then) {
    p.then(() => {
      console.log('▶ Áudio tocando de ' + cropStart.toFixed(2) + 's até ' + cropEnd.toFixed(2) + 's');

      // Fade-in em ~1.2s (0.04 × 30 ticks)
      clearInterval(fadeInTimer);
      fadeInTimer = setInterval(() => {
        fadeInMultiplier = Math.min(1, fadeInMultiplier + 0.04);
        aplicarVolume();
        if (fadeInMultiplier >= 1) clearInterval(fadeInTimer);
      }, 40);
    })
    .catch(err => console.error('⚠️ play() falhou:', err.name, '-', err.message));
  }
}

function iniciarTimeline() {
  timelineStart = performance.now();
  timelineIndex = 0;
  fadeMultiplier = 1;
  aplicarVolume();
  isPlaying = true;
  console.log('▶ Timeline iniciada (' + totalDur.toFixed(2) + 's)');
  loopSincronizacao();
}

function loopSincronizacao() {
  if (!isPlaying) return;
  const t = (performance.now() - timelineStart) / 1000;

  while (timelineIndex < TIMELINE.length && t >= TIMELINE[timelineIndex].t) {
    TIMELINE[timelineIndex].fn();
    timelineIndex++;
  }

  // Fade-out linear nos últimos 2s
  if (t >= fadeStart) {
    const p = Math.min(1, (t - fadeStart) / (fadeEnd - fadeStart));
    fadeMultiplier = 1 - p;
    aplicarVolume();
  } else if (fadeMultiplier !== 1) {
    fadeMultiplier = 1;
    aplicarVolume();
  }

  if (audioEl && !audioEl.paused && !loopAudio && audioEl.currentTime >= cropEnd) {
    audioEl.pause();
    console.log('⏸ Áudio pausado (fim do trecho)');
  }

  const pct = Math.min(100, Math.round((t / totalDur) * 100));
  barra.style.width = pct + "%";
  progresso.setAttribute("aria-valuenow", String(pct));

  if (t < totalDur) {
    syncAnimFrame = requestAnimationFrame(loopSincronizacao);
  } else {
    isPlaying = false;
    fadeMultiplier = 0;
    aplicarVolume();
    if (audioEl && !audioEl.paused) audioEl.pause();
    console.log('✓ Timeline finalizada');
  }
}

function pararMusica() {
  isPlaying = false;
  clearInterval(fadeInTimer);
  clearTimeout(startTimer);
  if (syncAnimFrame) cancelAnimationFrame(syncAnimFrame);
  fadeMultiplier = 1;
  fadeInMultiplier = 1;
  if (audioEl) {
    try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) {}
    aplicarVolume();
  }
}

if (btnMute) {
  btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    btnMute.classList.toggle('muted', isMuted);
    aplicarVolume();
    const label = isMuted ? 'Ativar som' : 'Mutar som';
    btnMute.setAttribute('aria-label', label);
    btnMute.title = label;
  });
}

/* ===== INTERFACE E DADOS ===== */
$("#selo").textContent = CONFIG.selo;
$("#legenda").textContent = CONFIG.legenda;
$("#nome").textContent = CONFIG.nome;
$("#idade").textContent = CONFIG.idade;
$("#data").textContent = CONFIG.data + (CONFIG.horario ? " às " + CONFIG.horario : "");
(function () {
  const loc = $("#loc");
  if (CONFIG.mapa) {
    const a = document.createElement("a");
    a.href = CONFIG.mapa; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "📍 " + CONFIG.local;
    loc.appendChild(a);
  } else {
    loc.textContent = CONFIG.local;
  }
})();

if ($("#sugestaoPresente")) {
  $("#sugestaoPresente").textContent = CONFIG.sugestaoPresente || "";
}

if (CONFIG.foto) {
  const i = new Image();
  i.decoding = "async"; i.loading = "eager"; i.fetchPriority = "high";
  i.src = CONFIG.foto; i.alt = "Foto de " + CONFIG.nome;
  i.onerror = () => { $("#foto").textContent = "🎨"; };
  $("#foto").appendChild(i);
}

const msg = "🎨 *O Maior Pintor do Mundo!*\nVou comemorar o aniversário do " + CONFIG.nome + "! Confirmo minha presença.";
$("#zap").href = CONFIG.whatsapp
  ? "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(msg)
  : "https://wa.me/?text=" + encodeURIComponent(msg);

function letras(t, off) {
  return [...t].map((c, i) =>
    c === " " ? " " : '<span class="l" style="--i:' + (i + off) + '">' + c + '</span>'
  ).join("");
}
$("#logo").innerHTML =
  '<span>O MAIOR</span><span class="g">' +
  [..."PINTOR"].map((c, i) => '<em style="font-style:normal;color:' + cores[i % 6] + '">' + c + '</em>').join("") +
  '</span><span class="m">do Mundo</span>';
$("#tela").innerHTML =
  '<div>' + letras("O maior", 0) + '</div>' +
  '<b>' + [..."PINTOR"].map((c, i) => '<span class="l" style="--i:' + (i + 7) + ';color:' + cores[i % 6] + '">' + c + '</span>').join("") + '</b>' +
  '<div>' + letras("do mundo pintou", 13) + '</div>' +
  '<small>você e eu! ♥</small>';

/* ===== NAVEGAÇÃO E CENAS ===== */
const cenas = ["c1", "c2", "c3", "c4"];
const pgs = [...document.querySelectorAll(".pg")];
const progresso = $("#progresso");
const barra = progresso.querySelector("span");

let cenaAtual = "c1", paginaAtual = -1;

function cena(id) {
  cenaAtual = id;
  cenas.forEach(c => $("#" + c).classList.toggle("on", c === id));
  $("#pular").hidden = id === "c1" || id === "c4";
}

function pg(n) {
  paginaAtual = n;
  pgs.forEach((p, i) => p.classList.toggle("on", i === n));
}

function abrir() {
  const e = $("#env");
  if (e.classList.contains("abre")) return;

  if (navigator.vibrate) navigator.vibrate(12);

  // Desbloqueia o áudio dentro do gesto do usuário (exigido pelo iOS/Safari)
  if (audioEl) {
    audioEl.muted = true;
    const u = audioEl.play();
    if (u && u.then) {
      u.then(() => { audioEl.pause(); audioEl.currentTime = 0; aplicarVolume(); })
       .catch(() => { aplicarVolume(); });
    }
  }

  e.classList.add("abre");
  $("#dica").style.display = "none";

  for (let i = 0; i < 22; i++) {
    const g = document.createElement("i");
    const a = Math.random() * 6.28;
    const d = 120 + Math.random() * 220;
    g.className = "gota";
    g.style.cssText = "--c:" + cores[i % 6] + ";--s:" + (14 + Math.random() * 30) +
                      "px;--x:" + Math.cos(a) * d + "px;--y:" + Math.sin(a) * d + "px";
    $("#c1").appendChild(g);
    requestAnimationFrame(() => g.classList.add("vai"));
  }

  if (btnMute) btnMute.classList.add('show');

  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    iniciarTimeline();
    tocarMusica();
  }, 3000);
}

function fim() {
  pararMusica();
  cena("c4");
  pg(4);
  barra.style.width = "100%";
}

function avancar() {
  if (cenaAtual === "c2") { cena("c3"); return; }
  if (cenaAtual === "c3") { cena("c4"); pg(0); return; }
  if (cenaAtual === "c4" && paginaAtual < 4) { pg(paginaAtual + 1); }
}

$("#env").addEventListener("click", abrir);
$("#pular").addEventListener("click", fim);
$("#rever").addEventListener("click", () => {
  pararMusica();
  paginaAtual = -1;
  $("#env").classList.remove("abre");
  $("#dica").style.display = "";
  document.querySelectorAll("#c1 .gota").forEach(g => g.remove());
  pg(-1);
  cena("c1");
  barra.style.width = "0%";
});

$("#c2").addEventListener("click", avancar);
$("#c3").addEventListener("click", avancar);
$("#c4").addEventListener("click", e => {
  if (e.target.closest("a,button")) return;
  avancar();
});