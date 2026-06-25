// =====================================================================
//  Herbert Edu — Motor "Torre do Logaritmo" (formato torre)
//
//  Jogo arcade contra o tempo: cada carta é uma questão de exponencial
//  ou logaritmo gerada proceduralmente. A cada acerto a torre ganha um
//  andar e dispara pra cima — crescimento exponencial é a recompensa
//  visual. Erro custa tempo e zera o combo. Não conhece Firestore nem
//  navegação: recebe os dados e entrega a experiência.
//
//    iniciarTorre({ container, dados, jogoId, aoTerminar })
//
//  - container : elemento onde o jogo é desenhado
//  - dados     : envelope { formato: "torre", titulo, duracao? }
//  - jogoId    : id do jogo (chave do "seu melhor" no localStorage)
//  - aoTerminar: callback opcional (resultado) — gancho do ranking
// =====================================================================
import "./torre.css";
import { destravarAudio, tocarSom, somLigado, alternarSom } from "./som.js";

// ---------------------------------------------------------------------
// Regras do jogo
// ---------------------------------------------------------------------
const DURACAO_PADRAO = 50;      // s de partida (relógio só desce)
const PENALIDADE_ERRO = 3;      // s descontados por erro
const PONTOS_BASE = 10;         // escala igual à dos outros minigames
const JANELA_RELAMPAGO = 2.5;   // s para responder a carta relâmpago
const CHANCE_ESPECIAL = 0.22;   // chance de carta relâmpago (nível 3+)
const MAX_ANDARES_VISIVEIS = 16;

// Tipos de carta liberados por faixa de combo; a torre acelera e vale
// mais a cada nível, espelhando o "Sinais da Parábola".
const NIVEIS = [
  { streakMin: 0,  mult: 1, janela: 0,   nome: "Fundação",    tipos: ["log", "exp"] },
  { streakMin: 3,  mult: 2, janela: 0,   nome: "Subindo",     tipos: ["log", "exp", "expoente"] },
  { streakMin: 6,  mult: 3, janela: 6,   nome: "Nas alturas", tipos: ["log", "exp", "expoente", "base"], especiais: true },
  { streakMin: 10, mult: 4, janela: 4.5, nome: "Arranha-céu", tipos: ["log", "exp", "expoente", "base", "prop"], especiais: true },
];

const REDUZ_MOVIMENTO = typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function intervalo(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function sorteio(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function embaralhar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

// Notação matemática (conteúdo interno, sem entrada do usuário).
const sub = (n) => `<sub>${n}</sub>`;
const pot = (b, k) => `${b}<sup>${k}</sup>`;

// ---------------------------------------------------------------------
// Geração procedural
//
// Bases pequenas e expoentes em faixas que mantêm os valores legíveis
// (nada de 2^10). Cada gerador devolve a carta pronta: enunciado (HTML),
// 4 opções embaralhadas, índice da correta e uma explicação curta.
// ---------------------------------------------------------------------
const BASES = [2, 3, 5, 10];
const FAIXA_EXP = { 2: [2, 6], 3: [2, 4], 5: [2, 3], 10: [2, 4] };

function potencia(b, k) { return Math.round(Math.pow(b, k)); }

// Monta as opções: junta a correta com distratores plausíveis, remove
// repetidos e completa até 4. Devolve as opções como texto e o índice
// da correta após embaralhar.
function montarOpcoes(correta, candidatos) {
  const vistos = new Set([correta]);
  const distratores = [];
  for (const c of embaralhar(candidatos)) {
    if (distratores.length >= 3) break;
    if (Number.isFinite(c) && c >= 0 && !vistos.has(c)) {
      vistos.add(c);
      distratores.push(c);
    }
  }
  let extra = correta + 1;
  while (distratores.length < 3) {
    if (!vistos.has(extra)) { vistos.add(extra); distratores.push(extra); }
    extra += 1;
  }
  const nums = embaralhar([correta, ...distratores]);
  return { opcoes: nums.map(String), correta: nums.indexOf(correta) };
}

// log_b(b^k) = k  → avaliar logaritmo
function cartaLog() {
  const b = sorteio(BASES);
  const [lo, hi] = FAIXA_EXP[b];
  const k = intervalo(lo, hi);
  const v = potencia(b, k);
  const { opcoes, correta } = montarOpcoes(k, [k - 1, k + 1, k - 2, k + 2, b, v, k + 3]);
  return {
    tipo: "log",
    enunciado: `log${sub(b)} ${v} = ?`,
    opcoes, correta,
    explicacao: `${pot(b, k)} = ${v}, então log${sub(b)} ${v} = ${k}.`,
  };
}

// b^k = ?  → avaliar potência
function cartaExp() {
  const b = sorteio(BASES);
  const [lo, hi] = FAIXA_EXP[b];
  const k = intervalo(lo, hi);
  const v = potencia(b, k);
  const { opcoes, correta } = montarOpcoes(v, [
    b * k, potencia(b, k - 1), potencia(b, k + 1), v - b, v + b, k * k, b + k,
  ]);
  return {
    tipo: "exp",
    enunciado: `${pot(b, k)} = ?`,
    opcoes, correta,
    explicacao: `${b} multiplicado por si mesmo ${k} vezes dá ${v}.`,
  };
}

// b^? = v  → achar o expoente
function cartaExpoente() {
  const b = sorteio(BASES);
  const [lo, hi] = FAIXA_EXP[b];
  const k = intervalo(lo, hi);
  const v = potencia(b, k);
  const { opcoes, correta } = montarOpcoes(k, [k - 1, k + 1, k - 2, k + 2, b, k + 3]);
  return {
    tipo: "expoente",
    enunciado: `${b}<sup>?</sup> = ${v}`,
    opcoes, correta,
    explicacao: `${pot(b, k)} = ${v}, logo o expoente é ${k}.`,
  };
}

// ?^k = v  → achar a base
function cartaBase() {
  const b = sorteio(BASES);
  const [lo, hi] = FAIXA_EXP[b];
  const k = intervalo(lo, Math.min(hi, 3)); // expoente baixo: raiz fica intuitiva
  const v = potencia(b, k);
  const { opcoes, correta } = montarOpcoes(b, [2, 3, 4, 5, 6, 10].filter((x) => x !== b));
  return {
    tipo: "base",
    enunciado: `?<sup>${k}</sup> = ${v}`,
    opcoes, correta,
    explicacao: `${pot(b, k)} = ${v}, então a base é ${b}.`,
  };
}

// Propriedades imediatas do log (log_b 1, log_b b, log decimal).
function cartaProp() {
  const r = Math.random();
  const b = sorteio(BASES);
  if (r < 0.34) {
    const { opcoes, correta } = montarOpcoes(0, [1, b, 2, b - 1]);
    return {
      tipo: "prop",
      enunciado: `log${sub(b)} 1 = ?`,
      opcoes, correta,
      explicacao: `O log de 1 é sempre 0, porque ${pot(b, 0)} = 1.`,
    };
  }
  if (r < 0.67) {
    const { opcoes, correta } = montarOpcoes(1, [0, b, 2, b + 1]);
    return {
      tipo: "prop",
      enunciado: `log${sub(b)} ${b} = ?`,
      opcoes, correta,
      explicacao: `O log da própria base é 1, porque ${pot(b, 1)} = ${b}.`,
    };
  }
  const k = intervalo(2, 4);
  const v = potencia(10, k);
  const { opcoes, correta } = montarOpcoes(k, [k - 1, k + 1, v, k + 2]);
  return {
    tipo: "prop",
    enunciado: `log ${v} = ?`,
    opcoes, correta,
    explicacao: `Sem base escrita, o log é na base 10: ${pot(10, k)} = ${v}.`,
  };
}

const GERADORES = {
  log: cartaLog, exp: cartaExp, expoente: cartaExpoente, base: cartaBase, prop: cartaProp,
};

// Gerador da partida: sorteia o tipo dentro do nível, evita repetir o
// mesmo enunciado em sequência e marca cartas relâmpago (×2, com prazo).
//
// Exposto para inspeção em dev:
//   const g = (await import("/src/lib/torre.js")).criarGerador();
//   g.proximaCarta(3)  // carta do nível 4 (índice 3)
export function criarGerador() {
  let ultimo = "";
  function proximaCarta(nivelIdx) {
    const nivel = NIVEIS[nivelIdx] || NIVEIS[0];
    const relampago = !!nivel.especiais && Math.random() < CHANCE_ESPECIAL;
    let carta;
    for (let i = 0; i < 6; i++) {
      carta = GERADORES[sorteio(nivel.tipos)]();
      if (carta.enunciado !== ultimo) break;
    }
    ultimo = carta.enunciado;
    carta.relampago = relampago;
    return carta;
  }
  return { proximaCarta };
}

// ---------------------------------------------------------------------
// Motor da partida
// ---------------------------------------------------------------------
export function iniciarTorre({ container, dados, jogoId, aoTerminar }) {
  const duracao = Number(dados?.duracao) > 0 ? Number(dados.duracao) : DURACAO_PADRAO;
  const titulo = dados?.titulo || "Torre do Logaritmo";
  const chaveMelhor = `herbert-jogo-melhor:${jogoId || titulo}`;

  const app = document.createElement("div");
  app.className = "tor-app";
  container.innerHTML = "";
  container.appendChild(app);

  const estado = {
    tempo: duracao, pontos: 0, streak: 0, maiorStreak: 0,
    acertos: 0, erros: 0, andares: 0,
    carta: null, janelaTotal: 0, janelaRestante: 0,
  };
  let gerador = null;
  let telaAtual = "abertura";
  let respondendo = false;   // trava de entrada entre responder e a próxima carta
  let timerId = null;
  let proxTimer = null;
  let toastTimer = null;

  function nivelIdxDe(streak) {
    let idx = 0;
    NIVEIS.forEach((nv, i) => { if (streak >= nv.streakMin) idx = i; });
    return idx;
  }

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

  // ---- teclado: 1..4 escolhem a opção ----
  document.addEventListener("keydown", (e) => {
    if (telaAtual !== "jogo" || respondendo || !estado.carta) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= estado.carta.opcoes.length) responder(n - 1);
  });

  // ---- botão de som (estado global, compartilhado pelos minigames) ----
  function botaoSomHtml(canto = false) {
    return `<button class="tor-som${canto ? " tor-som-canto" : ""}" type="button"
      aria-label="Ligar ou desligar o som">${somLigado() ? "🔊" : "🔇"}</button>`;
  }
  function ligarBotaoSom() {
    app.querySelectorAll(".tor-som").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.textContent = alternarSom() ? "🔊" : "🔇";
        destravarAudio();
      });
    });
  }

  // =====================================================================
  // Tela de abertura
  // =====================================================================
  function telaAbertura() {
    telaAtual = "abertura";
    pararTimer();
    const melhor = lerMelhor(chaveMelhor);
    app.innerHTML = `
      <section class="tor-tela tor-abertura">
        <span class="tor-eyebrow">Minigame</span>
        <h1 class="tor-titulo">${titulo}</h1>
        <ul class="tor-regras">
          <li>🧮 resolva <b>exponenciais e logaritmos</b> contra o relógio</li>
          <li>🏙 cada acerto <b>levanta um andar</b> da sua torre</li>
          <li>⏱ <b>${duracao}s</b> corridos · erro custa <b>${PENALIDADE_ERRO}s</b></li>
          <li>🔥 combos <b>multiplicam</b> os pontos e aceleram o jogo</li>
        </ul>
        ${melhor ? `<p class="tor-melhor">🏆 Seu melhor: <b>${melhor}</b></p>` : ""}
        <button class="tor-btn tor-btn-primario" id="tor-comecar">Começar →</button>
        ${botaoSomHtml(true)}
      </section>`;
    app.querySelector("#tor-comecar").addEventListener("click", novaPartida);
    ligarBotaoSom();
  }

  // =====================================================================
  // Partida
  // =====================================================================
  function novaPartida() {
    destravarAudio(); // sempre chega aqui por clique (Começar / Jogar de novo)
    gerador = criarGerador();
    estado.tempo = duracao;
    estado.pontos = 0; estado.streak = 0; estado.maiorStreak = 0;
    estado.acertos = 0; estado.erros = 0; estado.andares = 0;
    telaAtual = "jogo";
    respondendo = false;

    app.innerHTML = `
      <section class="tor-tela tor-jogo">
        <div class="tor-fundo nivel-1" aria-hidden="true"></div>
        <header class="tor-hud">
          <div class="tor-relogio">
            <b class="tor-seg">${duracao}</b>
            <div class="tor-rel-barra"><i style="width:100%"></i></div>
          </div>
          <div class="tor-combo nivel-1">
            <span class="tor-mult">×1</span>
            <span class="tor-nivel-nome">${NIVEIS[0].nome}</span>
          </div>
          <span class="tor-pontos">0 pts</span>
          ${botaoSomHtml()}
        </header>
        <div class="tor-arena">
          <aside class="tor-torre" aria-hidden="true">
            <div class="tor-contador">🏙 <b>0</b> <span>andares</span></div>
            <div class="tor-mastro balanco-0">
              <div class="tor-predio">
                <div class="tor-base"></div>
                <div class="tor-topo"></div>
              </div>
            </div>
          </aside>
          <div class="tor-carta-area"></div>
        </div>
        <div class="tor-toast" hidden></div>
      </section>`;

    ligarBotaoSom();
    montarNovaCarta();
    iniciarTimer();
  }

  function montarNovaCarta() {
    if (telaAtual !== "jogo") return;
    const nivelIdx = nivelIdxDe(estado.streak);
    const nivel = NIVEIS[nivelIdx];
    estado.carta = gerador.proximaCarta(nivelIdx);
    estado.janelaTotal = estado.carta.relampago ? JANELA_RELAMPAGO : nivel.janela;
    estado.janelaRestante = estado.janelaTotal;
    renderCarta();
    respondendo = false;
  }

  function renderCarta() {
    const carta = estado.carta;
    const area = app.querySelector(".tor-carta-area");
    const opcoes = carta.opcoes.map((op, idx) => `
      <button class="tor-opcao" data-idx="${idx}">
        <span class="tor-letra">${idx + 1}</span>
        <span class="tor-op-txt">${op}</span>
      </button>`).join("");
    area.innerHTML = `
      <div class="tor-carta tipo-${carta.tipo}${carta.relampago ? " relampago" : ""}">
        ${carta.relampago ? `<div class="tor-carta-banner">⚡ RELÂMPAGO — vale ×2!</div>` : ""}
        <p class="tor-pergunta">${carta.enunciado}</p>
        <div class="tor-opcoes">${opcoes}</div>
        <div class="tor-janela" ${estado.janelaTotal > 0 ? "" : "hidden"}><i style="width:100%"></i></div>
      </div>`;
    area.querySelectorAll(".tor-opcao").forEach((btn) => {
      btn.addEventListener("click", () => responder(Number(btn.dataset.idx)));
    });
    atualizarJanela();
  }

  // ---- HUD ----
  function atualizarRelogio() {
    const seg = app.querySelector(".tor-seg");
    const barra = app.querySelector(".tor-rel-barra i");
    if (!seg || !barra) return;
    seg.textContent = Math.ceil(estado.tempo);
    barra.style.width = `${(estado.tempo / duracao) * 100}%`;
    app.querySelector(".tor-relogio").classList.toggle("baixo", estado.tempo <= 10);
  }

  function atualizarJanela() {
    const barra = app.querySelector(".tor-janela i");
    if (!barra || estado.janelaTotal <= 0) return;
    barra.style.width = `${Math.max(0, estado.janelaRestante / estado.janelaTotal) * 100}%`;
  }

  function atualizarPlacar() {
    const el = app.querySelector(".tor-pontos");
    if (el) el.textContent = `${estado.pontos} pts`;
    const combo = app.querySelector(".tor-combo");
    if (!combo) return;
    const idx = nivelIdxDe(estado.streak);
    combo.className = `tor-combo nivel-${idx + 1}`;
    combo.querySelector(".tor-mult").textContent = `×${NIVEIS[idx].mult}`;
    combo.querySelector(".tor-nivel-nome").textContent = NIVEIS[idx].nome;
    const fundo = app.querySelector(".tor-fundo");
    if (fundo) fundo.className = `tor-fundo nivel-${idx + 1}`;
  }

  // Levanta um andar: insere um bloco logo abaixo do telhado, encolhe os
  // andares para caberem (a torre fica cada vez mais alta e esguia) e
  // intensifica o balanço — quanto mais alto, mais tensa fica a subida.
  function crescerTorre() {
    estado.andares += 1;
    const contador = app.querySelector(".tor-contador b");
    if (contador) contador.textContent = estado.andares;
    const predio = app.querySelector(".tor-predio");
    if (!predio) return;
    const topo = predio.querySelector(".tor-topo");
    const nivelIdx = nivelIdxDe(estado.streak);
    const andar = document.createElement("div");
    andar.className = `tor-andar n${nivelIdx + 1}`
      + (estado.andares % 2 === 0 ? " alt" : "")
      + (REDUZ_MOVIMENTO ? "" : " nova");
    predio.insertBefore(andar, topo); // column-reverse: entra no topo, sob o telhado
    // Mantém o DOM enxuto: descarta o andar mais antigo (logo acima da base).
    const andares = predio.querySelectorAll(".tor-andar");
    if (andares.length > MAX_ANDARES_VISIVEIS) andares[0].remove();
    ajustarAltura(predio);
    ajustarBalanco();
    sacudirTorre("tremor");
  }

  // Encolhe os andares conforme a torre sobe, para a torre inteira caber
  // no quadro e parecer cada vez mais alta.
  function ajustarAltura(predio) {
    const n = predio.querySelectorAll(".tor-andar").length || 1;
    const h = Math.max(11, Math.min(22, Math.floor(300 / n)));
    predio.style.setProperty("--andar-h", `${h}px`);
  }

  // Quanto mais alta a torre, mais ela balança — tensão crescente.
  function ajustarBalanco() {
    const mastro = app.querySelector(".tor-mastro");
    if (!mastro) return;
    const a = estado.andares;
    const nivel = a >= 25 ? 4 : a >= 16 ? 3 : a >= 9 ? 2 : a >= 4 ? 1 : 0;
    mastro.className = `tor-mastro balanco-${nivel}`;
  }

  // Sacode a torre: tremor leve no impacto do andar, tranco forte no erro.
  function sacudirTorre(classe) {
    if (REDUZ_MOVIMENTO) return;
    const predio = app.querySelector(".tor-predio");
    if (!predio) return;
    predio.classList.remove("tremor", "tremor-forte");
    void predio.offsetWidth; // reinicia a animação
    predio.classList.add(classe);
  }

  // ---- responder ----
  function responder(idx) {
    if (respondendo || telaAtual !== "jogo") return;
    respondendo = true;
    if (estado.janelaTotal > 0) estado.janelaRestante = estado.janelaTotal; // congela a janela
    const carta = estado.carta;
    if (idx === carta.correta) acertou(idx);
    else errou(idx);
  }

  function responderTimeout() {
    if (respondendo || telaAtual !== "jogo") return;
    respondendo = true;
    errou(-1, true);
  }

  function marcarOpcoes(escolhida, correta) {
    app.querySelectorAll(".tor-opcao").forEach((btn) => {
      const i = Number(btn.dataset.idx);
      btn.disabled = true;
      if (i === correta) btn.classList.add("certa");
      else if (i === escolhida) btn.classList.add("errada");
    });
  }

  function acertou(idx) {
    const nivelAntes = nivelIdxDe(estado.streak);
    const ganho = PONTOS_BASE * NIVEIS[nivelAntes].mult * (estado.carta.relampago ? 2 : 1);
    estado.pontos += ganho;
    estado.acertos += 1;
    estado.streak += 1;
    estado.maiorStreak = Math.max(estado.maiorStreak, estado.streak);
    const nivelDepois = nivelIdxDe(estado.streak);

    marcarOpcoes(idx, estado.carta.correta);
    tocarSom("acerto", { streak: estado.streak });
    vibrar(30);
    crescerTorre();
    flutuarPontos(`+${ganho}`);
    atualizarPlacar();
    if (nivelDepois > nivelAntes) anunciarCombo(NIVEIS[nivelDepois]);

    proxTimer = setTimeout(montarNovaCarta, REDUZ_MOVIMENTO ? 90 : 360);
  }

  function errou(idx, porTempo = false) {
    estado.erros += 1;
    estado.streak = 0;
    estado.tempo = Math.max(0, estado.tempo - PENALIDADE_ERRO);

    marcarOpcoes(idx, estado.carta.correta);
    tocarSom("erro");
    vibrar(90);
    atualizarPlacar();
    atualizarRelogio();
    app.querySelector(".tor-relogio")?.classList.add("penal");
    setTimeout(() => app.querySelector(".tor-relogio")?.classList.remove("penal"), 500);
    app.querySelector(".tor-jogo")?.classList.add("flash-erro");
    setTimeout(() => app.querySelector(".tor-jogo")?.classList.remove("flash-erro"), 450);
    sacudirTorre("tremor-forte");

    const prefixo = porTempo ? "⏱ Tempo! " : "";
    mostrarToast(`${prefixo}${estado.carta.explicacao}`);

    proxTimer = setTimeout(montarNovaCarta, REDUZ_MOVIMENTO ? 140 : 560);
  }

  function mostrarToast(texto) {
    const toast = app.querySelector(".tor-toast");
    if (!toast) return;
    toast.innerHTML = texto;
    toast.hidden = false;
    toast.classList.remove("some");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add("some");
      setTimeout(() => { toast.hidden = true; }, 300);
    }, 2200);
  }

  function flutuarPontos(texto) {
    if (REDUZ_MOVIMENTO) return;
    const area = app.querySelector(".tor-carta-area");
    if (!area) return;
    const el = document.createElement("span");
    el.className = "tor-flutua";
    el.textContent = texto;
    area.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function anunciarCombo(nivel) {
    const jogo = app.querySelector(".tor-jogo");
    if (!jogo) return;
    const banner = document.createElement("div");
    banner.className = "tor-banner";
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

    app.innerHTML = `
      <section class="tor-tela tor-final">
        <span class="tor-eyebrow">${recorde ? "🏆 Novo recorde!" : "Fim de jogo"}</span>
        <div class="tor-placar"><b id="tor-placar-n">0</b><small>pts</small></div>
        <p class="tor-altura">🏙 Você ergueu uma torre de <b>${estado.andares}</b> andares!</p>
        <div class="tor-stats">
          <div><b>${estado.acertos}</b><span>acertos</span></div>
          <div><b>${estado.erros}</b><span>erros</span></div>
          <div><b>${estado.maiorStreak}🔥</b><span>maior combo</span></div>
          <div><b>${melhor}</b><span>seu melhor</span></div>
        </div>
        <div class="tor-acoes">
          <button class="tor-btn tor-btn-primario" id="tor-denovo">Jogar de novo</button>
          <a class="tor-btn" href="/jogos.html">Voltar aos jogos</a>
        </div>
        ${botaoSomHtml(true)}
      </section>`;
    app.querySelector("#tor-denovo").addEventListener("click", novaPartida);
    ligarBotaoSom();
    animarPlacar(estado.pontos);

    const resultado = {
      jogoId: jogoId || null,
      pontos: estado.pontos,
      acertos: estado.acertos,
      erros: estado.erros,
      total: estado.acertos + estado.erros,
      andares: estado.andares,
      maiorStreak: estado.maiorStreak,
      recorde,
    };
    if (typeof aoTerminar === "function") {
      try { aoTerminar(resultado); } catch (e) { console.error("aoTerminar falhou:", e); }
    }
  }

  function animarPlacar(alvoFinal) {
    const el = app.querySelector("#tor-placar-n");
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
