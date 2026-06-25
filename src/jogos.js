// Vitrine de minigames: lê os temas e os jogos publicados do Firestore
// e monta a lista, agrupada por tema. Alunos só leem.
// Também hospeda o card de login (nome+senha) e o ranking geral.
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db, iniciarAnalytics } from "./firebase.js";
import {
  sessaoAtual, sair, existeJogador, cadastrar, entrar,
  validarNome, topRanking, posicaoDe, totalDoJogador,
} from "./lib/jogadores.js";

document.getElementById("ano").textContent = new Date().getFullYear();
iniciarAnalytics();

const catalogo = document.getElementById("catalogo");
const elLogin = document.getElementById("login-jogador");
const elRanking = document.getElementById("ranking");

function escapar(texto = "") {
  return texto.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function estadoDe(jogo) {
  return jogo.estado || (jogo.publicado ? "publicado" : "oculto");
}

const ROTULO_FORMATO = {
  quiz: "Quiz", sinais: "Sinais da Parábola", torre: "Torre do Logaritmo",
  vf: "Verdadeiro ou falso", grafico: "Qual é o gráfico?",
  pareamento: "Pareamento", erro: "Caça ao erro",
};

function lerMelhor(id) {
  try { return Number(localStorage.getItem(`herbert-jogo-melhor:${id}`)) || 0; } catch { return 0; }
}

function cardJogo(jogo) {
  if (estadoDe(jogo) === "preparacao") {
    return `
      <div class="aula-card preparando" aria-disabled="true">
        <span class="aula-tag prep">Em preparação</span>
        <div class="aula-titulo">${escapar(jogo.titulo)}</div>
        <div class="aula-descricao">${escapar(jogo.descricao || "")}</div>
        <div class="prep-dots"><span></span><span></span><span></span></div>
        <div class="aula-abrir prep-txt">Chegando em breve…</div>
      </div>`;
  }
  const rotulo = ROTULO_FORMATO[jogo.formato] || "Jogo";
  const melhor = lerMelhor(jogo.id);
  const melhorLinha = melhor ? `<div class="aula-melhor">🏆 Seu melhor: ${melhor}</div>` : "";
  return `
    <a class="aula-card" href="/jogo.html?id=${encodeURIComponent(jogo.id)}">
      <span class="aula-tag jogo">${escapar(rotulo)}</span>
      <div class="aula-titulo">${escapar(jogo.titulo)}</div>
      <div class="aula-descricao">${escapar(jogo.descricao || "")}</div>
      ${melhorLinha}
      <div class="aula-abrir">Jogar →</div>
    </a>`;
}

function secaoTema(tema, jogos) {
  const cor = tema.cor || "var(--accent)";
  const cards = jogos.map(cardJogo).join("");
  return `
    <section class="tema">
      <div class="tema-cabecalho">
        <span class="tema-bolinha" style="background:${escapar(cor)}"></span>
        <div>
          <div class="tema-titulo">${escapar(tema.titulo)}</div>
          ${tema.descricao ? `<div class="tema-descricao">${escapar(tema.descricao)}</div>` : ""}
        </div>
      </div>
      <div class="aulas-grade">${cards}</div>
    </section>`;
}

async function carregar() {
  try {
    const temasSnap = await getDocs(query(collection(db, "temas"), orderBy("ordem")));
    // Lê por 'ordem' (índice automático) e filtra no cliente — evita índice composto.
    const jogosSnap = await getDocs(query(collection(db, "jogos"), orderBy("ordem")));

    const jogosPorTema = new Map();
    jogosSnap.forEach((doc) => {
      const jogo = { id: doc.id, ...doc.data() };
      if (estadoDe(jogo) === "oculto") return; // mostra publicados e em preparação
      if (!jogosPorTema.has(jogo.temaId)) jogosPorTema.set(jogo.temaId, []);
      jogosPorTema.get(jogo.temaId).push(jogo);
    });

    // Publicados primeiro, "em preparação" depois — mantém a ordem relativa
    // dentro de cada grupo (já vem ordenado por 'ordem').
    const PESO_ESTADO = { publicado: 0, preparacao: 1 };
    const secoes = [];
    temasSnap.forEach((doc) => {
      const tema = { id: doc.id, ...doc.data() };
      const jogos = (jogosPorTema.get(tema.id) || [])
        .slice()
        .sort((a, b) => (PESO_ESTADO[estadoDe(a)] ?? 0) - (PESO_ESTADO[estadoDe(b)] ?? 0));
      if (jogos.length) secoes.push(secaoTema(tema, jogos));
    });

    if (!secoes.length) {
      catalogo.innerHTML = `
        <div class="estado">
          <span class="emoji">🎮</span>
          Nenhum jogo publicado ainda. Em breve os primeiros desafios!
        </div>`;
      return;
    }

    catalogo.innerHTML = secoes.join("");
  } catch (erro) {
    console.error(erro);
    catalogo.innerHTML = `
      <div class="estado">
        <span class="emoji">⚠️</span>
        Não foi possível carregar os jogos agora. Tente novamente em instantes.
      </div>`;
  }
}

// =====================================================================
//  Login do jogador (card no topo)
//
//  Estado local: "passo" conduz a UI sem framework.
//    logado            -> chip "Olá, X · sair"
//    nome              -> só o input de nome
//    criar | entrar    -> nome fixo + campo de senha (criar conta / entrar)
// =====================================================================
const login = { passo: "nome", nome: "", erro: "", ocupado: false };

function renderLogin() {
  const sessao = sessaoAtual();
  if (sessao) {
    elLogin.innerHTML = `
      <div class="login-card logado">
        <span class="login-ola">👋 Olá, <b>${escapar(sessao.nome)}</b></span>
        <button class="login-sair" id="login-sair">sair</button>
      </div>`;
    elLogin.querySelector("#login-sair").addEventListener("click", () => {
      sair();
      login.passo = "nome"; login.nome = ""; login.erro = "";
      renderLogin();
      renderRanking();
    });
    return;
  }

  const erroHtml = login.erro
    ? `<div class="login-erro">${escapar(login.erro)}</div>` : "";

  if (login.passo === "nome") {
    elLogin.innerHTML = `
      <form class="login-card" id="login-form" novalidate>
        <div class="login-eyebrow">Entre pra disputar o ranking</div>
        <div class="login-linha">
          <input class="login-input" id="login-nome" type="text"
            placeholder="Seu nome" autocomplete="off" maxlength="24"
            value="${escapar(login.nome)}" />
          <button class="login-btn" id="login-continuar" ${login.ocupado ? "disabled" : ""}>
            ${login.ocupado ? "…" : "Continuar"}
          </button>
        </div>
        ${erroHtml}
      </form>`;
    const form = elLogin.querySelector("#login-form");
    form.addEventListener("submit", (e) => { e.preventDefault(); irParaSenha(); });
    elLogin.querySelector("#login-nome").focus();
    return;
  }

  // passo === "criar" | "entrar"
  const criando = login.passo === "criar";
  elLogin.innerHTML = `
    <form class="login-card" id="login-form" novalidate>
      <div class="login-eyebrow">
        ${criando ? "Novo por aqui — crie uma senha" : `Bem-vindo de volta, ${escapar(login.nome)}`}
      </div>
      <div class="login-linha">
        <input class="login-input" id="login-senha" type="password"
          placeholder="${criando ? "Crie uma senha" : "Sua senha"}"
          autocomplete="${criando ? "new-password" : "current-password"}" />
        <button class="login-btn" id="login-acao" ${login.ocupado ? "disabled" : ""}>
          ${login.ocupado ? "…" : (criando ? "Criar conta" : "Entrar")}
        </button>
      </div>
      ${erroHtml}
      <button type="button" class="login-trocar" id="login-trocar">← trocar nome</button>
    </form>`;
  const form = elLogin.querySelector("#login-form");
  form.addEventListener("submit", (e) => { e.preventDefault(); enviarSenha(); });
  elLogin.querySelector("#login-trocar").addEventListener("click", () => {
    login.passo = "nome"; login.erro = ""; renderLogin();
  });
  elLogin.querySelector("#login-senha").focus();
}

async function irParaSenha() {
  const nome = elLogin.querySelector("#login-nome").value;
  const val = validarNome(nome);
  if (!val.ok) { login.erro = val.motivo; renderLogin(); return; }
  login.nome = nome.trim();
  login.erro = "";
  login.ocupado = true; renderLogin();
  try {
    const existe = await existeJogador(login.nome);
    login.passo = existe ? "entrar" : "criar";
  } catch (e) {
    console.error(e);
    login.erro = "Falha de conexão. Tente de novo.";
  } finally {
    login.ocupado = false;
    renderLogin();
  }
}

async function enviarSenha() {
  const senha = elLogin.querySelector("#login-senha").value;
  if (!senha) { login.erro = "Digite a senha."; renderLogin(); return; }
  login.erro = "";
  login.ocupado = true; renderLogin();
  try {
    if (login.passo === "criar") await cadastrar(login.nome, senha);
    else await entrar(login.nome, senha);
    login.ocupado = false;
    renderLogin();
    renderRanking();
  } catch (e) {
    login.ocupado = false;
    login.erro = e.message || "Não foi possível continuar.";
    renderLogin();
  }
}

// =====================================================================
//  Ranking geral (pódio top 3 + lista). Soma do melhor de cada jogo.
// =====================================================================
const MEDALHAS = ["🥇", "🥈", "🥉"];

function cardPodio(j, posicao, ehEu) {
  return `
    <div class="podio-lugar lugar-${posicao + 1} ${ehEu ? "eu" : ""}">
      <span class="podio-medalha">${MEDALHAS[posicao]}</span>
      <span class="podio-nome">${escapar(j.nome)}</span>
      <span class="podio-pts">${j.total} pts</span>
    </div>`;
}

function linhaLista(j, posicao, ehEu) {
  return `
    <li class="rank-linha ${ehEu ? "rank-eu" : ""}">
      <span class="rank-pos">${posicao + 1}º</span>
      <span class="rank-nome">${escapar(j.nome)}</span>
      <span class="rank-pts">${j.total} pts</span>
    </li>`;
}

async function renderRanking() {
  elRanking.innerHTML = `
    <section class="ranking">
      <h2 class="ranking-titulo">🏆 Ranking geral</h2>
      <div class="ranking-carregando">Carregando…</div>
    </section>`;

  let lista;
  try {
    lista = await topRanking(12);
  } catch (e) {
    console.error(e);
    elRanking.innerHTML = "";
    return; // ranking é secundário: some em silêncio se falhar
  }

  if (!lista.length) {
    elRanking.innerHTML = `
      <section class="ranking">
        <h2 class="ranking-titulo">🏆 Ranking geral</h2>
        <p class="ranking-vazio">Ninguém pontuou ainda. Seja o primeiro! 🎮</p>
      </section>`;
    return;
  }

  const sessao = sessaoAtual();
  const meuSlug = sessao?.slug || null;
  const podio = lista.slice(0, 3);
  const resto = lista.slice(3);

  const podioHtml = `
    <div class="podio">
      ${podio.map((j, i) => cardPodio(j, i, j.slug === meuSlug)).join("")}
    </div>`;

  const listaHtml = resto.length
    ? `<ol class="rank-lista">${resto.map((j, i) => linhaLista(j, i + 3, j.slug === meuSlug)).join("")}</ol>`
    : "";

  elRanking.innerHTML = `
    <section class="ranking">
      <h2 class="ranking-titulo">🏆 Ranking geral</h2>
      ${podioHtml}
      ${listaHtml}
      <div class="ranking-eu" id="ranking-eu"></div>
    </section>`;

  // Aluno logado fora do top 12: mostra a posição dele embaixo.
  if (meuSlug && !lista.some((j) => j.slug === meuSlug)) {
    try {
      const meuTotal = await totalDoJogador(meuSlug);
      if (meuTotal != null) {
        const pos = await posicaoDe(meuTotal);
        const alvo = elRanking.querySelector("#ranking-eu");
        if (alvo) {
          alvo.innerHTML = `
            <div class="rank-minha-pos">
              Sua posição: <b>${pos}º</b> · ${meuTotal} pts
            </div>`;
        }
      }
    } catch (e) {
      console.error(e); // posição é um extra — falhar aqui não quebra o ranking
    }
  }
}

carregar();
renderLogin();
renderRanking();
