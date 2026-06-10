// =====================================================================
//  Herbert Edu — Motor de quiz (fonte única dos minigames)
//
//  Roda uma partida a partir do envelope JSON de perguntas. Não conhece
//  Firestore nem navegação: recebe os dados e entrega a experiência.
//
//    iniciarQuiz({ container, dados, jogoId, aoTerminar })
//
//  - container : elemento onde o jogo é desenhado
//  - dados     : envelope { formato, titulo, tempoPorQuestao?, questoes[] }
//  - jogoId    : id do jogo (chave do "seu melhor" no localStorage)
//  - aoTerminar: callback opcional (resultado) — gancho para ranking futuro
// =====================================================================

const PONTOS_BASE = 100;
const BONUS_VELOCIDADE = 50; // máximo, proporcional ao tempo restante
const BONUS_STREAK = 10; // por acerto seguido, até 5

function escapar(texto = "") {
  return String(texto).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Defesa: só entram questões bem formadas (a publicação já valida, isto é rede).
function questaoValida(q) {
  return q && typeof q.enunciado === "string" && Array.isArray(q.opcoes)
    && q.opcoes.length >= 2 && Number.isInteger(q.correta)
    && q.correta >= 0 && q.correta < q.opcoes.length;
}

// Embaralha um array no lugar (Fisher-Yates) e o devolve.
function embaralhar(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function lerMelhor(chave) {
  try { return Number(localStorage.getItem(chave)) || 0; } catch { return 0; }
}
function gravarMelhor(chave, valor) {
  try { localStorage.setItem(chave, String(valor)); } catch { /* aba privada: ignora */ }
}

export function iniciarQuiz({ container, dados, jogoId, aoTerminar }) {
  const pool = (dados?.questoes || []).filter(questaoValida);
  const tempoTotal = Number(dados?.tempoPorQuestao) > 0 ? Number(dados.tempoPorQuestao) : 20;
  const chaveMelhor = `herbert-jogo-melhor:${jogoId || dados?.titulo || "quiz"}`;

  // Sorteio: se "sortear" for válido e menor que o acervo, cada partida usa uma
  // amostra aleatória desse tamanho (em ordem embaralhada); senão, usa todas as
  // questões na ordem dada.
  const nSortear = Number(dados?.sortear);
  const usaSorteio = Number.isInteger(nSortear) && nSortear > 0 && nSortear < pool.length;
  const tamanhoPartida = usaSorteio ? nSortear : pool.length;

  // 'questoes' é a amostra da partida atual; (re)definida em novaPartida().
  let questoes = pool;

  // Blindagem: embaralha as alternativas e reposiciona o índice da correta.
  // Devolve uma cópia — o acervo (pool) nunca é mutado, então cada partida
  // (e cada "jogar de novo") sorteia uma ordem nova das opções.
  function prepararQuestao(q) {
    const ordem = embaralhar(q.opcoes.map((_, i) => i));
    return {
      ...q,
      opcoes: ordem.map((i) => q.opcoes[i]),
      correta: ordem.indexOf(q.correta),
    };
  }

  const app = document.createElement("div");
  app.className = "quiz-app";
  container.innerHTML = "";
  container.appendChild(app);

  if (!pool.length) {
    app.innerHTML = `<div class="quiz-vazio">Este jogo ainda não tem questões válidas.</div>`;
    return;
  }

  const estado = { i: 0, pontos: 0, acertos: 0, streak: 0, maiorStreak: 0 };
  let timerId = null;
  let tempoRestante = tempoTotal;
  let respondida = false;

  // ---- cronômetro (pausa quando a aba perde foco) ----
  function pararTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function tick() {
    tempoRestante = Math.max(0, tempoRestante - 0.1);
    atualizarRing();
    if (tempoRestante <= 0) { pararTimer(); responder(-1); }
  }
  function iniciarTimer() {
    pararTimer();
    timerId = setInterval(tick, 100);
  }
  function aoMudarVisibilidade() {
    if (document.hidden) pararTimer();
    else if (!respondida && telaAtual === "questao") iniciarTimer();
  }
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  let telaAtual = "abertura";

  // Sorteia a amostra da partida (quando há sorteio), embaralha as alternativas
  // de cada questão e zera o placar.
  function novaPartida() {
    const amostra = usaSorteio ? embaralhar(pool.slice()).slice(0, nSortear) : pool.slice();
    questoes = amostra.map(prepararQuestao);
    estado.i = 0; estado.pontos = 0; estado.acertos = 0; estado.streak = 0; estado.maiorStreak = 0;
    telaQuestao();
  }

  // ---- tela de abertura ----
  function telaAbertura() {
    telaAtual = "abertura";
    pararTimer();
    const melhor = lerMelhor(chaveMelhor);
    app.innerHTML = `
      <section class="quiz-tela quiz-abertura">
        <span class="quiz-eyebrow">Minigame</span>
        <h1 class="quiz-titulo">${escapar(dados?.titulo || "Quiz")}</h1>
        <ul class="quiz-regras">
          <li><b>${tamanhoPartida}</b> questões${usaSorteio ? ` <span class="quiz-sorteio">(sorteadas de ${pool.length})</span>` : ""}</li>
          <li><b>${tempoTotal}s</b> por questão</li>
          <li>Pontos por acerto, velocidade e sequência</li>
        </ul>
        ${melhor ? `<p class="quiz-melhor">🏆 Seu melhor: <b>${melhor}</b></p>` : ""}
        <button class="quiz-btn quiz-btn-primario" id="quiz-comecar">Começar →</button>
      </section>`;
    app.querySelector("#quiz-comecar").addEventListener("click", novaPartida);
  }

  // ---- tela de questão ----
  function telaQuestao() {
    telaAtual = "questao";
    respondida = false;
    tempoRestante = tempoTotal;
    const q = questoes[estado.i];
    const opcoes = q.opcoes.map((op, idx) => `
      <button class="quiz-opcao" data-idx="${idx}">
        <span class="quiz-letra">${String.fromCharCode(65 + idx)}</span>
        <span class="quiz-op-txt">${escapar(op)}</span>
      </button>`).join("");

    app.innerHTML = `
      <section class="quiz-tela quiz-jogo">
        <header class="quiz-hud">
          <span class="quiz-progresso">Questão ${estado.i + 1} / ${questoes.length}</span>
          <div class="quiz-hud-dir">
            <span class="quiz-streak ${estado.streak > 1 ? "ativo" : ""}">🔥 ${estado.streak}</span>
            <span class="quiz-pontos">${estado.pontos} pts</span>
            <span class="quiz-ring" aria-hidden="true">
              <svg viewBox="0 0 60 60"><circle class="trilho" cx="30" cy="30" r="26"/>
                <circle class="arco" cx="30" cy="30" r="26"/></svg>
              <b class="quiz-seg">${Math.ceil(tempoRestante)}</b>
            </span>
          </div>
        </header>
        <p class="quiz-enunciado">${escapar(q.enunciado)}</p>
        <div class="quiz-opcoes">${opcoes}</div>
        <div class="quiz-feedback" id="quiz-feedback" hidden></div>
      </section>`;

    app.querySelectorAll(".quiz-opcao").forEach((btn) => {
      btn.addEventListener("click", () => responder(Number(btn.dataset.idx)));
    });
    atualizarRing();
    iniciarTimer();
  }

  function atualizarRing() {
    const arco = app.querySelector(".quiz-ring .arco");
    const seg = app.querySelector(".quiz-seg");
    if (!arco || !seg) return;
    const C = 2 * Math.PI * 26;
    const frac = Math.max(0, tempoRestante / tempoTotal);
    arco.style.strokeDasharray = `${C}`;
    arco.style.strokeDashoffset = `${C * (1 - frac)}`;
    app.querySelector(".quiz-ring").classList.toggle("baixo", tempoRestante <= 5);
    seg.textContent = Math.ceil(tempoRestante);
  }

  // ---- responder uma questão ----
  function responder(escolhida) {
    if (respondida) return;
    respondida = true;
    pararTimer();
    const q = questoes[estado.i];
    const acertou = escolhida === q.correta;

    let ganho = 0;
    if (acertou) {
      estado.streak += 1;
      estado.maiorStreak = Math.max(estado.maiorStreak, estado.streak);
      estado.acertos += 1;
      const bonusVel = Math.round((tempoRestante / tempoTotal) * BONUS_VELOCIDADE);
      const bonusStk = Math.min(estado.streak, 5) * BONUS_STREAK;
      ganho = PONTOS_BASE + bonusVel + bonusStk;
      estado.pontos += ganho;
    } else {
      estado.streak = 0;
    }

    app.querySelectorAll(".quiz-opcao").forEach((btn) => {
      const idx = Number(btn.dataset.idx);
      btn.disabled = true;
      if (idx === q.correta) btn.classList.add("certa");
      else if (idx === escolhida) btn.classList.add("errada");
    });

    const fb = app.querySelector("#quiz-feedback");
    fb.hidden = false;
    fb.className = `quiz-feedback ${acertou ? "ok" : "nao"}`;
    const cabe = acertou
      ? `<b>Boa! +${ganho}</b>${estado.streak > 1 ? ` · sequência de ${estado.streak} 🔥` : ""}`
      : (escolhida === -1 ? `<b>Tempo!</b>` : `<b>Quase…</b>`);
    fb.innerHTML = `
      <div class="quiz-fb-cabe">${cabe}</div>
      ${q.explicacao ? `<div class="quiz-fb-exp">${escapar(q.explicacao)}</div>` : ""}
      <button class="quiz-btn quiz-btn-primario" id="quiz-proxima">
        ${estado.i + 1 < questoes.length ? "Próxima →" : "Ver resultado →"}
      </button>`;
    const btnProx = fb.querySelector("#quiz-proxima");
    btnProx.addEventListener("click", avancar);
    btnProx.focus();
    const elPontos = app.querySelector(".quiz-pontos");
    if (elPontos) elPontos.textContent = `${estado.pontos} pts`;
  }

  function avancar() {
    if (estado.i + 1 < questoes.length) { estado.i += 1; telaQuestao(); }
    else telaFinal();
  }

  // ---- tela final ----
  function telaFinal() {
    telaAtual = "final";
    pararTimer();
    const melhorAnterior = lerMelhor(chaveMelhor);
    const recorde = estado.pontos > melhorAnterior;
    if (recorde) gravarMelhor(chaveMelhor, estado.pontos);
    const melhor = Math.max(melhorAnterior, estado.pontos);

    const resultado = {
      jogoId: jogoId || null,
      pontos: estado.pontos,
      acertos: estado.acertos,
      total: questoes.length,
      maiorStreak: estado.maiorStreak,
      recorde,
    };

    app.innerHTML = `
      <section class="quiz-tela quiz-final">
        <span class="quiz-eyebrow">${recorde ? "🏆 Novo recorde!" : "Fim de jogo"}</span>
        <div class="quiz-placar">${estado.pontos}<small>pts</small></div>
        <div class="quiz-stats">
          <div><b>${estado.acertos}/${questoes.length}</b><span>acertos</span></div>
          <div><b>${estado.maiorStreak}🔥</b><span>maior sequência</span></div>
          <div><b>${melhor}</b><span>seu melhor</span></div>
        </div>
        <div class="quiz-acoes">
          <button class="quiz-btn quiz-btn-primario" id="quiz-denovo">Jogar de novo</button>
          <a class="quiz-btn" href="/jogos.html">Voltar aos jogos</a>
        </div>
      </section>`;
    app.querySelector("#quiz-denovo").addEventListener("click", novaPartida);

    if (typeof aoTerminar === "function") {
      try { aoTerminar(resultado); } catch (e) { console.error("aoTerminar falhou:", e); }
    }
  }

  // teclado: 1..9 escolhem opção durante a questão
  document.addEventListener("keydown", (e) => {
    if (telaAtual !== "questao" || respondida) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= questoes[estado.i].opcoes.length) {
      responder(n - 1);
    }
  });

  telaAbertura();
}
