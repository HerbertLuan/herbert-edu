// Vitrine de minigames: lê os temas e os jogos publicados do Firestore
// e monta a lista, agrupada por tema. Alunos só leem.
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db, iniciarAnalytics } from "./firebase.js";

document.getElementById("ano").textContent = new Date().getFullYear();
iniciarAnalytics();

const catalogo = document.getElementById("catalogo");

function escapar(texto = "") {
  return texto.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function estadoDe(jogo) {
  return jogo.estado || (jogo.publicado ? "publicado" : "oculto");
}

const ROTULO_FORMATO = {
  quiz: "Quiz", vf: "Verdadeiro ou falso", grafico: "Qual é o gráfico?",
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

    const secoes = [];
    temasSnap.forEach((doc) => {
      const tema = { id: doc.id, ...doc.data() };
      const jogos = jogosPorTema.get(tema.id) || [];
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

carregar();
