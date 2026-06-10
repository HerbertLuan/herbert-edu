// =====================================================================
//  Herbert Edu — Motor "Sinais da Parábola" (formato sinais)
//
//  Jogo arcade contra o tempo: cada carta mostra uma parábola gerada
//  proceduralmente (SVG) e pede o sinal de a, b, c ou Δ. O aluno
//  arrasta a carta para a esquerda (negativo) ou direita (positivo).
//  Não conhece Firestore nem navegação: recebe os dados e entrega a
//  experiência.
//
//    iniciarSinais({ container, dados, jogoId, aoTerminar })
//
//  - container : elemento onde o jogo é desenhado
//  - dados     : envelope { formato: "sinais", titulo, duracao? }
//  - jogoId    : id do jogo (chave do "seu melhor" no localStorage)
//  - aoTerminar: callback opcional (resultado) — gancho do ranking
// =====================================================================
import "./sinais.css";
import { destravarAudio, tocarSom, somLigado, alternarSom } from "./som.js";

// ---------------------------------------------------------------------
// Regras do jogo
// ---------------------------------------------------------------------
const DURACAO_PADRAO = 45;      // s de partida (relógio só desce)
const PENALIDADE_ERRO = 3;      // s descontados por erro
const PONTOS_BASE = 10;
const JANELA_RELAMPAGO = 1.5;   // s para responder a carta relâmpago
const CHANCE_ESPECIAL = 0.25;   // chance de carta especial (nível 3+)
const CHANCE_MULTIPLA = 0.5;    // chance de carta múltipla (turbo)
const PESOS_ESPECIAIS = [["espelho", 2], ["dupla", 2], ["relampago", 1]];

const NIVEIS = [
  { streakMin: 0,  mult: 1, alvos: ["a", "delta"],           janela: 0, nome: "Aquecendo" },
  { streakMin: 3,  mult: 2, alvos: ["a", "delta", "c"],      janela: 0, nome: "Pegando fogo" },
  { streakMin: 6,  mult: 3, alvos: ["a", "delta", "c", "b"], janela: 3, nome: "Em chamas", especiais: true },
  { streakMin: 10, mult: 4, alvos: ["a", "delta", "c", "b"], janela: 2, nome: "Modo turbo", especiais: true, multiplas: true },
];

const ROTULO = { a: "a", b: "b", c: "c", delta: "Δ" };
const EXPLICA = {
  a: { "1": "concavidade voltada para cima", "-1": "concavidade voltada para baixo" },
  b: { "1": "a parábola cruza o eixo y subindo", "-1": "a parábola cruza o eixo y descendo" },
  c: { "1": "ela corta o eixo y acima da origem", "-1": "ela corta o eixo y abaixo da origem" },
  delta: { "1": "a parábola corta o eixo x em dois pontos", "-1": "a parábola não toca o eixo x" },
};

const REDUZ_MOVIMENTO = typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches;

function escapar(texto = "") {
  return String(texto).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function lerMelhor(chave) {
  try { return Number(localStorage.getItem(chave)) || 0; } catch { return 0; }
}
function gravarMelhor(chave, valor) {
  try { localStorage.setItem(chave, String(valor)); } catch { /* aba privada: ignora */ }
}

function vibrar(padrao) {
  if (REDUZ_MOVIMENTO) return;
  try { navigator.vibrate?.(padrao); } catch { /* iOS/desktop: ignora */ }
}

// ---------------------------------------------------------------------
// Geração procedural
//
// Amostragem por forma de vértice: sorteia a, xv, yv e deriva
// b = −2a·xv, c = yv + a·xv². Controla o enquadramento direto e torna
// o sinal de Δ trivial: Δ = −4a·yv (positivo quando a e yv têm sinais
// opostos). Rejection sampling até os limiares de clareza valerem.
// ---------------------------------------------------------------------
const QUADRO = 6;        // janela lógica: x, y ∈ [−6, 6]
const SVG_TAM = 300;
const MAX_TENTATIVAS = 40;

function aleatorio(min, max) { return min + Math.random() * (max - min); }
function sinalAleatorio() { return Math.random() < 0.5 ? -1 : 1; }
function sorteio(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function sortearPonderado(pesos) {
  const total = pesos.reduce((s, [, p]) => s + p, 0);
  let r = Math.random() * total;
  for (const [item, p] of pesos) { r -= p; if (r <= 0) return item; }
  return pesos[0][0];
}

function amostrar() {
  const a = sinalAleatorio() * aleatorio(0.3, 1.2);
  const xv = sinalAleatorio() * aleatorio(0.3, 3.5);
  const yv = sinalAleatorio() * aleatorio(0.8, 4);
  return { a, b: -2 * a * xv, c: yv + a * xv * xv, xv, yv };
}

// Sinais dos quatro valores que o jogo pergunta (±1).
function sinaisDe({ a, b, c, yv }) {
  return {
    a: Math.sign(a),
    b: Math.sign(b),
    c: Math.sign(c),
    delta: a * yv < 0 ? 1 : -1, // Δ = −4a·yv
  };
}

// Limiares que tornam cada sinal pedido inequívoco no desenho.
function coefsValidos(coefs, alvos) {
  const { a, c, xv, yv } = coefs;
  if (Math.abs(a) < 0.3) return false;
  if (Math.abs(xv) < 0.3) return false;                       // b nunca ~0
  if (Math.abs(yv) < 0.8) return false;                       // Δ longe de 0
  if (Math.abs(c) < (alvos.includes("c") ? 1.5 : 0.4)) return false;
  if (Math.abs(c) > 5) return false;                          // intercepto no quadro
  if (alvos.includes("b") && Math.abs(xv) < 1.5) return false;
  if (alvos.includes("delta")) {
    if (a * yv < 0) {
      const r = Math.sqrt(-yv / a);                           // meia-distância das raízes
      if (2 * r < 2) return false;                            // raízes bem separadas
      if (Math.abs(xv) + r > 5.5) return false;               // raízes no quadro
    } else if (Math.abs(yv) < 1) {
      return false;                                           // claramente sem tocar o eixo x
    }
  }
  return true;
}

// Caso padrão seguro (passa em todos os limiares de qualquer alvo);
// espelhado quando é preciso forçar o sinal contrário.
function casoSeguro(sinalForcado, alvo) {
  let coefs = { a: 1, b: 4, c: 2, xv: -2, yv: -2 };
  if (sinalForcado && sinaisDe(coefs)[alvo] !== sinalForcado) {
    coefs = { a: -1, b: -4, c: -2, xv: -2, yv: 2 };           // espelho vertical: inverte todos os sinais
  }
  return coefs;
}

// Sorteia coeficientes em que todos os "alvos" são legíveis; quando
// "sinalForcado" vem do balanceamento, o primeiro alvo precisa ter
// aquele sinal.
function gerarCoeficientes(alvos, sinalForcado = 0) {
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    const coefs = amostrar();
    if (!coefsValidos(coefs, alvos)) continue;
    if (sinalForcado && sinaisDe(coefs)[alvos[0]] !== sinalForcado) continue;
    return coefs;
  }
  return casoSeguro(sinalForcado, alvos[0]);
}

// ---------------------------------------------------------------------
// Desenho SVG
// ---------------------------------------------------------------------
const COR_SOLIDA = "#2563EB";
const COR_TRACEJADA = "#DB2777";

function svgGrafico(curvas) {
  const px = (x) => ((x + QUADRO) / (2 * QUADRO)) * SVG_TAM;
  const py = (y) => ((QUADRO - y) / (2 * QUADRO)) * SVG_TAM;

  let marcas = "";
  for (let t = -QUADRO + 1; t < QUADRO; t++) {
    if (t === 0) continue;
    marcas += `<line x1="${px(t)}" y1="${py(0) - 3}" x2="${px(t)}" y2="${py(0) + 3}" class="sin-marca"/>`;
    marcas += `<line x1="${px(0) - 3}" y1="${py(t)}" x2="${px(0) + 3}" y2="${py(t)}" class="sin-marca"/>`;
  }
  const eixos = `
    <line x1="0" y1="${py(0)}" x2="${SVG_TAM}" y2="${py(0)}" class="sin-eixo"/>
    <line x1="${px(0)}" y1="0" x2="${px(0)}" y2="${SVG_TAM}" class="sin-eixo"/>
    ${marcas}
    <text x="${SVG_TAM - 12}" y="${py(0) - 7}" class="sin-eixo-rotulo">x</text>
    <text x="${px(0) + 7}" y="13" class="sin-eixo-rotulo">y</text>`;

  const caminhos = curvas.map((cv) => {
    let d = "";
    for (let x = -QUADRO; x <= QUADRO + 1e-9; x += 0.25) {
      const y = cv.a * x * x + cv.b * x + cv.c;
      d += `${d ? "L" : "M"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
    }
    const cor = cv.cor || COR_SOLIDA;
    return `<path d="${d}" class="sin-curva${cv.tracejada ? " tracejada" : ""}" style="stroke:${cor}"/>`;
  }).join("");

  return `<svg viewBox="0 0 ${SVG_TAM} ${SVG_TAM}" class="sin-grafico" aria-hidden="true">${eixos}${caminhos}</svg>`;
}

// ---------------------------------------------------------------------
// Gerador de cartas (com memória para balancear as respostas)
//
// Exportado também para inspeção em dev: no console,
//   const g = (await import("/src/lib/sinais.js")).criarGerador();
//   g.proximaCarta(3)  // carta do nível 4 (índice 3)
// ---------------------------------------------------------------------
export function criarGerador() {
  const historico = []; // sinais (±1) das respostas pedidas, na ordem

  // Após 3 respostas iguais seguidas, força o sinal contrário no
  // próximo sorteio — o aluno não "surfa" arrastando sempre pro mesmo lado.
  function sinalForcado() {
    const n = historico.length;
    if (n >= 3 && historico[n - 1] === historico[n - 2] && historico[n - 2] === historico[n - 3]) {
      return -historico[n - 1];
    }
    return 0;
  }

  function sortearTipo(nivel) {
    if (nivel.especiais && Math.random() < CHANCE_ESPECIAL) {
      return sortearPonderado(PESOS_ESPECIAIS);
    }
    if (nivel.multiplas && Math.random() < CHANCE_MULTIPLA) return "multipla";
    return "normal";
  }

  function cartaSimples(nivel, tipo) {
    const alvos = tipo === "multipla"
      ? embaralharAlvos(nivel.alvos).slice(0, Math.random() < 0.5 ? 2 : 3)
      : [sorteio(nivel.alvos)];
    const coefs = gerarCoeficientes(alvos, sinalForcado());
    const respostas = sinaisDe(coefs);
    alvos.forEach((alvo) => historico.push(respostas[alvo]));
    return {
      tipo, alvos, respostas,
      svg: svgGrafico([{ ...coefs, cor: COR_SOLIDA }]),
    };
  }

  function cartaDupla(nivel) {
    const alvo = sorteio(nivel.alvos);
    const cAlvo = gerarCoeficientes([alvo], sinalForcado());
    let cOutra = null;
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      const tent = amostrar();
      if (coefsValidos(tent, []) && curvasDistintas(cAlvo, tent)) { cOutra = tent; break; }
    }
    if (!cOutra) cOutra = { ...casoSeguro(0, "a"), a: -cAlvo.a, xv: -cAlvo.xv };

    const qualCurva = Math.random() < 0.5 ? "solida" : "tracejada";
    const curvaAlvo = { ...cAlvo, cor: qualCurva === "solida" ? COR_SOLIDA : COR_TRACEJADA, tracejada: qualCurva === "tracejada" };
    const curvaOutra = { ...cOutra, cor: qualCurva === "solida" ? COR_TRACEJADA : COR_SOLIDA, tracejada: qualCurva === "solida" };

    const respostas = sinaisDe(cAlvo);
    historico.push(respostas[alvo]);
    return {
      tipo: "dupla", alvos: [alvo], respostas, qualCurva,
      svg: svgGrafico([curvaOutra, curvaAlvo]), // a curva do alvo por cima
    };
  }

  function proximaCarta(nivelIdx) {
    const nivel = NIVEIS[nivelIdx] || NIVEIS[0];
    const tipo = sortearTipo(nivel);
    return tipo === "dupla" ? cartaDupla(nivel) : cartaSimples(nivel, tipo);
  }

  return { proximaCarta };
}

function embaralharAlvos(alvos) {
  const arr = alvos.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Curvas visualmente separáveis: concavidades opostas ou vértices afastados.
function curvasDistintas(c1, c2) {
  return Math.sign(c1.a) !== Math.sign(c2.a) || Math.abs(c1.xv - c2.xv) >= 2.5;
}

// ---------------------------------------------------------------------
// Motor da partida
// ---------------------------------------------------------------------
export function iniciarSinais({ container, dados, jogoId, aoTerminar }) {
  const duracao = Number(dados?.duracao) > 0 ? Number(dados.duracao) : DURACAO_PADRAO;
  const titulo = dados?.titulo || "Sinais da Parábola";
  const chaveMelhor = `herbert-jogo-melhor:${jogoId || titulo}`;

  const app = document.createElement("div");
  app.className = "sin-app";
  container.innerHTML = "";
  container.appendChild(app);

  const estado = {
    tempo: duracao, pontos: 0, streak: 0, maiorStreak: 0, acertos: 0, erros: 0,
    porAlvo: { a: { ok: 0, total: 0 }, b: { ok: 0, total: 0 }, c: { ok: 0, total: 0 }, delta: { ok: 0, total: 0 } },
    carta: null, alvoIdx: 0, janelaTotal: 0, janelaRestante: 0,
  };
  let gerador = null;
  let telaAtual = "abertura";
  let respondendo = false;   // trava de entrada entre uma resposta e a próxima carta
  let timerId = null;
  let proxTimer = null;      // timeout da troca de carta
  let toastTimer = null;

  function nivelIdxDe(streak) {
    let idx = 0;
    NIVEIS.forEach((nv, i) => { if (streak >= nv.streakMin) idx = i; });
    return idx;
  }
  const nivelAtual = () => NIVEIS[nivelIdxDe(estado.streak)];

  // ---- cronômetro único: relógio global + janela da carta ----
  function pararTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function iniciarTimer() { pararTimer(); timerId = setInterval(tick, 100); }
  function tick() {
    estado.tempo = Math.max(0, estado.tempo - 0.1);
    atualizarRelogio();
    if (estado.tempo <= 0) { fimDeJogo(); return; }
    if (estado.janelaTotal > 0 && !respondendo) {
      estado.janelaRestante -= 0.1;
      atualizarJanela();
      if (estado.janelaRestante <= 0) responderTimeout();
    }
  }
  function aoMudarVisibilidade() {
    if (document.hidden) pararTimer();
    else if (telaAtual === "jogo") iniciarTimer();
  }
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  // ---- teclado: ← negativo · positivo → (lados físicos, como o arrasto) ----
  document.addEventListener("keydown", (e) => {
    if (telaAtual !== "jogo" || respondendo) return;
    if (e.key === "ArrowLeft") responder(-1);
    else if (e.key === "ArrowRight") responder(1);
  });

  // =====================================================================
  // Tela de abertura
  // =====================================================================
  function telaAbertura() {
    telaAtual = "abertura";
    pararTimer();
    const melhor = lerMelhor(chaveMelhor);
    app.innerHTML = `
      <section class="sin-tela sin-abertura">
        <span class="sin-eyebrow">Minigame</span>
        <h1 class="sin-titulo">${escapar(titulo)}</h1>
        <ul class="sin-regras">
          <li>⬅️ arraste pra <b>esquerda</b> se o sinal for <b>negativo</b></li>
          <li>➡️ pra <b>direita</b> se for <b>positivo</b></li>
          <li>⏱ <b>${duracao}s</b> corridos · erro custa <b>${PENALIDADE_ERRO}s</b></li>
          <li>🔥 combos <b>multiplicam</b> os pontos e aceleram o jogo</li>
        </ul>
        ${melhor ? `<p class="sin-melhor">🏆 Seu melhor: <b>${melhor}</b></p>` : ""}
        <button class="sin-btn sin-btn-primario" id="sin-comecar">Começar →</button>
        ${botaoSomHtml(true)}
      </section>`;
    app.querySelector("#sin-comecar").addEventListener("click", novaPartida);
    ligarBotaoSom();
  }

  // =====================================================================
  // Partida
  // =====================================================================
  // Botão 🔊/🔇 — estado global persistido, compartilhado pelos minigames.
  // "canto" = posição absoluta no topo (abertura/final); sem canto, vive no HUD.
  function botaoSomHtml(canto = false) {
    return `<button class="sin-som${canto ? " sin-som-canto" : ""}" type="button"
      aria-label="Ligar ou desligar o som">${somLigado() ? "🔊" : "🔇"}</button>`;
  }
  function ligarBotaoSom() {
    app.querySelectorAll(".sin-som").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.textContent = alternarSom() ? "🔊" : "🔇";
        destravarAudio(); // ligar o som é um gesto: aproveita pra destravar
      });
    });
  }

  function novaPartida() {
    destravarAudio(); // sempre chega aqui por clique (Começar / Jogar de novo)
    gerador = criarGerador();
    estado.tempo = duracao;
    estado.pontos = 0; estado.streak = 0; estado.maiorStreak = 0;
    estado.acertos = 0; estado.erros = 0;
    for (const alvo of Object.keys(estado.porAlvo)) estado.porAlvo[alvo] = { ok: 0, total: 0 };
    telaAtual = "jogo";
    respondendo = false;

    app.innerHTML = `
      <section class="sin-tela sin-jogo">
        <div class="sin-fundo nivel-1" aria-hidden="true"></div>
        <header class="sin-hud">
          <div class="sin-relogio">
            <b class="sin-seg">${duracao}</b>
            <div class="sin-rel-barra"><i style="width:100%"></i></div>
          </div>
          <div class="sin-combo nivel-1">
            <span class="sin-mult">×1</span>
            <span class="sin-nivel-nome">${NIVEIS[0].nome}</span>
          </div>
          <span class="sin-pontos">0 pts</span>
          ${botaoSomHtml()}
        </header>
        <div class="sin-arena">
          <span class="sin-lado esq"></span>
          <div class="sin-carta-area"></div>
          <span class="sin-lado dir"></span>
        </div>
        <div class="sin-botoes">
          <button class="sin-btn-lado" data-lado="-1"></button>
          <button class="sin-btn-lado" data-lado="1"></button>
        </div>
        <div class="sin-toast" hidden></div>
      </section>`;

    app.querySelectorAll(".sin-btn-lado").forEach((btn) => {
      btn.addEventListener("click", () => responder(Number(btn.dataset.lado)));
    });
    ligarBotaoSom();

    montarNovaCarta();
    iniciarTimer();
  }

  function montarNovaCarta() {
    if (telaAtual !== "jogo") return;
    const nivelIdx = nivelIdxDe(estado.streak);
    const nivel = NIVEIS[nivelIdx];
    estado.carta = gerador.proximaCarta(nivelIdx);
    estado.alvoIdx = 0;
    estado.janelaTotal = estado.carta.tipo === "relampago" ? JANELA_RELAMPAGO : nivel.janela;
    estado.janelaRestante = estado.janelaTotal;
    renderCarta();
    respondendo = false;
  }

  function renderCarta() {
    const carta = estado.carta;
    const area = app.querySelector(".sin-carta-area");
    area.innerHTML = `
      <div class="sin-carta tipo-${carta.tipo}">
        ${bannerDe(carta)}
        ${carta.alvos.length > 1 ? `<div class="sin-chips">${chipsHtml()}</div>` : ""}
        <p class="sin-pergunta">${perguntaHtml()}</p>
        ${carta.svg}
        <div class="sin-janela" ${estado.janelaTotal > 0 ? "" : "hidden"}><i style="width:100%"></i></div>
      </div>`;
    ligarArrasto(area.querySelector(".sin-carta"));
    atualizarLados();
  }

  function bannerDe(carta) {
    if (carta.tipo === "espelho") return `<div class="sin-carta-banner">🔄 MODO ESPELHO — lados invertidos!</div>`;
    if (carta.tipo === "dupla") return `<div class="sin-carta-banner">〰️ DUPLA — olhe a curva certa!</div>`;
    if (carta.tipo === "relampago") return `<div class="sin-carta-banner">⚡ RELÂMPAGO — vale ×2!</div>`;
    return "";
  }

  function chipsHtml() {
    return estado.carta.alvos.map((alvo, i) =>
      `<span class="sin-chip${i === estado.alvoIdx ? " atual" : ""}${i < estado.alvoIdx ? " feita" : ""}">${ROTULO[alvo]}</span>`
    ).join("");
  }

  function perguntaHtml() {
    const carta = estado.carta;
    const alvo = carta.alvos[estado.alvoIdx];
    let extra = "";
    if (carta.tipo === "dupla") {
      const nome = carta.qualCurva === "solida" ? "sólida" : "tracejada";
      extra = ` da <span class="sin-curva-ref ${carta.qualCurva}">${nome}</span>`;
    }
    return `Qual o sinal de <b class="sin-alvo">${ROTULO[alvo]}</b>${extra}?`;
  }

  // Rótulos das laterais e dos botões; no espelho, trocados de lado.
  function atualizarLados() {
    const espelho = estado.carta?.tipo === "espelho";
    const esq = espelho ? "positivo +" : "− negativo";
    const dir = espelho ? "− negativo" : "positivo +";
    const ladoEsq = app.querySelector(".sin-lado.esq");
    const ladoDir = app.querySelector(".sin-lado.dir");
    const [btnEsq, btnDir] = app.querySelectorAll(".sin-btn-lado");
    if (!ladoEsq) return;
    ladoEsq.textContent = esq; ladoDir.textContent = dir;
    btnEsq.textContent = esq; btnDir.textContent = dir;
    [ladoEsq, ladoDir, btnEsq, btnDir].forEach((el) => el.classList.toggle("invertido", espelho));
  }

  // ---- HUD ----
  function atualizarRelogio() {
    const seg = app.querySelector(".sin-seg");
    const barra = app.querySelector(".sin-rel-barra i");
    if (!seg || !barra) return;
    seg.textContent = Math.ceil(estado.tempo);
    barra.style.width = `${(estado.tempo / duracao) * 100}%`;
    app.querySelector(".sin-relogio").classList.toggle("baixo", estado.tempo <= 10);
  }

  function atualizarJanela() {
    const barra = app.querySelector(".sin-janela i");
    if (!barra || estado.janelaTotal <= 0) return;
    barra.style.width = `${Math.max(0, (estado.janelaRestante / estado.janelaTotal)) * 100}%`;
  }

  function atualizarPlacar() {
    const el = app.querySelector(".sin-pontos");
    if (el) el.textContent = `${estado.pontos} pts`;
    const combo = app.querySelector(".sin-combo");
    if (!combo) return;
    const idx = nivelIdxDe(estado.streak);
    combo.className = `sin-combo nivel-${idx + 1}`;
    combo.querySelector(".sin-mult").textContent = `×${NIVEIS[idx].mult}`;
    combo.querySelector(".sin-nivel-nome").textContent = NIVEIS[idx].nome;
    const fundo = app.querySelector(".sin-fundo");
    if (fundo) fundo.className = `sin-fundo nivel-${idx + 1}`;
  }

  // ---- arrasto da carta ----
  function ligarArrasto(cartaEl) {
    let ativo = false, x0 = 0, y0 = 0, dx = 0, dy = 0;
    const limiar = () => cartaEl.offsetWidth * 0.35;

    cartaEl.addEventListener("pointerdown", (e) => {
      if (respondendo || telaAtual !== "jogo") return;
      ativo = true; x0 = e.clientX; y0 = e.clientY; dx = 0; dy = 0;
      try { cartaEl.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
      cartaEl.classList.add("arrastando");
    });
    cartaEl.addEventListener("pointermove", (e) => {
      if (!ativo) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (!REDUZ_MOVIMENTO) {
        cartaEl.style.transform = `translate(${dx}px, ${dy * 0.15}px) rotate(${dx / 18}deg)`;
      }
      reagirLados(dx / limiar());
    });
    function soltar(e) {
      if (!ativo) return;
      ativo = false;
      cartaEl.classList.remove("arrastando");
      reagirLados(0);
      if (e.type !== "pointercancel" && Math.abs(dx) > limiar()) {
        responder(dx > 0 ? 1 : -1);
      } else {
        cartaEl.style.transform = "";
      }
    }
    cartaEl.addEventListener("pointerup", soltar);
    cartaEl.addEventListener("pointercancel", soltar);
  }

  // Destaque progressivo do lado pra onde a carta vai (frac: −1..1 ≈ limiar).
  function reagirLados(frac) {
    const esq = app.querySelector(".sin-lado.esq");
    const dir = app.querySelector(".sin-lado.dir");
    if (!esq || !dir) return;
    esq.classList.toggle("quente", frac < -1);
    dir.classList.toggle("quente", frac > 1);
    esq.style.opacity = frac < 0 ? String(Math.min(1, 0.55 - frac * 0.45)) : "0.55";
    dir.style.opacity = frac > 0 ? String(Math.min(1, 0.55 + frac * 0.45)) : "0.55";
  }

  // ---- responder ----
  // "lado" é o gesto físico: −1 esquerda, +1 direita. No modo espelho a
  // resposta semântica é o oposto do gesto.
  function responder(lado) {
    if (respondendo || telaAtual !== "jogo") return;
    respondendo = true;
    const carta = estado.carta;
    const alvo = carta.alvos[estado.alvoIdx];
    const gabarito = carta.respostas[alvo];
    const resposta = carta.tipo === "espelho" ? -lado : lado;
    estado.porAlvo[alvo].total += 1;

    if (resposta === gabarito) acertou(lado, alvo);
    else errou(lado, alvo, gabarito);
  }

  function responderTimeout() {
    if (respondendo || telaAtual !== "jogo") return;
    respondendo = true;
    const alvo = estado.carta.alvos[estado.alvoIdx];
    estado.porAlvo[alvo].total += 1;
    errou(0, alvo, estado.carta.respostas[alvo], true);
  }

  function acertou(lado, alvo) {
    const nivelAntes = nivelIdxDe(estado.streak);
    const ganho = PONTOS_BASE * NIVEIS[nivelAntes].mult * (estado.carta.tipo === "relampago" ? 2 : 1);
    estado.pontos += ganho;
    estado.acertos += 1;
    estado.streak += 1;
    estado.maiorStreak = Math.max(estado.maiorStreak, estado.streak);
    estado.porAlvo[alvo].ok += 1;
    const nivelDepois = nivelIdxDe(estado.streak);

    tocarSom("acerto", { streak: estado.streak });
    vibrar(30);
    flutuarPontos(`+${ganho}`);
    atualizarPlacar();
    if (nivelDepois > nivelAntes) anunciarCombo(NIVEIS[nivelDepois]);

    const cartaEl = app.querySelector(".sin-carta");

    // carta múltipla com alvos restantes: o gráfico fica, o alvo avança
    if (estado.alvoIdx + 1 < estado.carta.alvos.length) {
      estado.alvoIdx += 1;
      estado.janelaRestante = estado.janelaTotal;
      atualizarJanela();
      cartaEl.classList.add("acerto-parcial");
      const chips = app.querySelector(".sin-chips");
      if (chips) chips.innerHTML = chipsHtml();
      app.querySelector(".sin-pergunta").innerHTML = perguntaHtml();
      setTimeout(() => cartaEl.classList.remove("acerto-parcial"), 250);
      respondendo = false;
      return;
    }

    cartaEl.classList.add("acerto", lado >= 0 ? "voa-dir" : "voa-esq");
    proxTimer = setTimeout(montarNovaCarta, REDUZ_MOVIMENTO ? 60 : 280);
  }

  function errou(lado, alvo, gabarito, porTempo = false) {
    estado.erros += 1;
    estado.streak = 0;
    estado.tempo = Math.max(0, estado.tempo - PENALIDADE_ERRO);
    tocarSom("erro");
    vibrar(90);
    atualizarPlacar();
    atualizarRelogio();
    app.querySelector(".sin-relogio")?.classList.add("penal");
    setTimeout(() => app.querySelector(".sin-relogio")?.classList.remove("penal"), 500);
    app.querySelector(".sin-jogo")?.classList.add("flash-erro");
    setTimeout(() => app.querySelector(".sin-jogo")?.classList.remove("flash-erro"), 450);

    mostrarToast(fraseDoErro(alvo, gabarito, lado, porTempo));

    const cartaEl = app.querySelector(".sin-carta");
    cartaEl.classList.add("erro");
    proxTimer = setTimeout(montarNovaCarta, REDUZ_MOVIMENTO ? 120 : 420);
  }

  function fraseDoErro(alvo, gabarito, lado, porTempo) {
    const carta = estado.carta;
    if (porTempo) {
      return carta.tipo === "relampago"
        ? "⚡ A relâmpago expirou — ela dura só um piscar!"
        : "⏱ A janela da carta esgotou — responda mais rápido!";
    }
    const sinal = gabarito > 0 ? "positivo" : "negativo";
    let prefixo = "";
    if (carta.tipo === "espelho" && lado === gabarito) {
      prefixo = "🔄 Era modo espelho — os lados estavam invertidos! ";
    }
    if (carta.tipo === "dupla") {
      prefixo += `Na curva ${carta.qualCurva === "solida" ? "sólida" : "tracejada"}: `;
    }
    return `${prefixo}${ROTULO[alvo]} era ${sinal} — ${EXPLICA[alvo][String(gabarito)]}.`;
  }

  function mostrarToast(texto) {
    const toast = app.querySelector(".sin-toast");
    if (!toast) return;
    toast.textContent = texto;
    toast.hidden = false;
    toast.classList.remove("some");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add("some");
      setTimeout(() => { toast.hidden = true; }, 300);
    }, 1900);
  }

  function flutuarPontos(texto) {
    if (REDUZ_MOVIMENTO) return;
    const area = app.querySelector(".sin-carta-area");
    if (!area) return;
    const el = document.createElement("span");
    el.className = "sin-flutua";
    el.textContent = texto;
    area.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function anunciarCombo(nivel) {
    const jogo = app.querySelector(".sin-jogo");
    if (!jogo) return;
    const banner = document.createElement("div");
    banner.className = "sin-banner";
    banner.innerHTML = `COMBO <b>×${nivel.mult}</b><small>${nivel.nome}</small>`;
    jogo.appendChild(banner);
    tocarSom("combo");
    vibrar([40, 40, 40]);
    setTimeout(() => banner.remove(), REDUZ_MOVIMENTO ? 700 : 950);
  }

  // =====================================================================
  // Tela final
  // =====================================================================
  function fimDeJogo() {
    telaAtual = "final";
    pararTimer();
    clearTimeout(proxTimer);
    clearTimeout(toastTimer);

    const melhorAnterior = lerMelhor(chaveMelhor);
    const recorde = estado.pontos > melhorAnterior;
    if (recorde) gravarMelhor(chaveMelhor, estado.pontos);
    const melhor = Math.max(melhorAnterior, estado.pontos);
    tocarSom(recorde ? "recorde" : "fim");

    const acuracia = Object.entries(estado.porAlvo)
      .filter(([, v]) => v.total > 0)
      .map(([alvo, v]) => `
        <div class="sin-acu-linha">
          <span class="sin-acu-alvo">${ROTULO[alvo]}</span>
          <div class="sin-acu-barra"><i style="width:${Math.round((v.ok / v.total) * 100)}%"></i></div>
          <span class="sin-acu-num">${v.ok}/${v.total}</span>
        </div>`).join("");

    app.innerHTML = `
      <section class="sin-tela sin-final">
        <span class="sin-eyebrow">${recorde ? "🏆 Novo recorde!" : "Fim de jogo"}</span>
        <div class="sin-placar"><b id="sin-placar-n">0</b><small>pts</small></div>
        <div class="sin-stats">
          <div><b>${estado.acertos}</b><span>acertos</span></div>
          <div><b>${estado.erros}</b><span>erros</span></div>
          <div><b>${estado.maiorStreak}🔥</b><span>maior combo</span></div>
          <div><b>${melhor}</b><span>seu melhor</span></div>
        </div>
        ${acuracia ? `<div class="sin-acuracia"><p class="sin-acu-titulo">Acertos por sinal</p>${acuracia}</div>` : ""}
        <div class="sin-acoes">
          <button class="sin-btn sin-btn-primario" id="sin-denovo">Jogar de novo</button>
          <a class="sin-btn" href="/jogos.html">Voltar aos jogos</a>
        </div>
        ${botaoSomHtml(true)}
      </section>`;
    app.querySelector("#sin-denovo").addEventListener("click", novaPartida);
    ligarBotaoSom();
    animarPlacar(estado.pontos);

    const resultado = {
      jogoId: jogoId || null,
      pontos: estado.pontos,
      acertos: estado.acertos,
      erros: estado.erros,
      total: estado.acertos + estado.erros,
      maiorStreak: estado.maiorStreak,
      acuraciaPorAlvo: estado.porAlvo,
      recorde,
    };
    if (typeof aoTerminar === "function") {
      try { aoTerminar(resultado); } catch (e) { console.error("aoTerminar falhou:", e); }
    }
  }

  function animarPlacar(alvoFinal) {
    const el = app.querySelector("#sin-placar-n");
    if (!el) return;
    if (REDUZ_MOVIMENTO || alvoFinal === 0) { el.textContent = alvoFinal; return; }
    const inicio = performance.now();
    const dur = 750;
    function quadro(agora) {
      const f = Math.min(1, (agora - inicio) / dur);
      el.textContent = Math.round(alvoFinal * (1 - Math.pow(1 - f, 3)));
      if (f < 1) requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);
  }

  telaAbertura();
}
