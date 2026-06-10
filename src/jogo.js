// Player de minigame: lê o jogo pelo ?id=, busca o doc no Firestore,
// baixa o JSON de perguntas do Storage e entrega ao motor de quiz.
import { doc, getDoc } from "firebase/firestore";
import { db, iniciarAnalytics } from "./firebase.js";
import { iniciarQuiz } from "./lib/quiz.js";

iniciarAnalytics();

const params = new URLSearchParams(location.search);
const id = params.get("id");
const palco = document.getElementById("palco");

function estado(emoji, texto, comVoltar = true) {
  palco.innerHTML = `
    <div class="estado">
      <span class="emoji">${emoji}</span>
      ${texto}
      ${comVoltar ? '<div style="margin-top:14px"><a href="/jogos.html">← Voltar aos jogos</a></div>' : ""}
    </div>`;
}

function estadoDe(dados) {
  return dados.estado || (dados.publicado ? "publicado" : "oculto");
}

async function carregar() {
  if (!id) {
    estado("🔗", "Link inválido — falta o identificador do jogo.");
    return;
  }
  let dados;
  try {
    const snap = await getDoc(doc(db, "jogos", id));
    dados = snap.exists() ? snap.data() : null;
  } catch (erro) {
    console.error(erro);
    estado("⚠️", "Não foi possível carregar o jogo agora. Tente novamente em instantes.");
    return;
  }

  if (!dados) {
    estado("🕹️", "Jogo não encontrado.");
    return;
  }
  const est = estadoDe(dados);
  if (est !== "publicado") {
    estado("🛠️", est === "preparacao"
      ? "Este jogo ainda está em preparação. Em breve!"
      : "Este jogo não está disponível.");
    return;
  }

  document.title = `${dados.titulo || "Minigame"} · Herbert Edu`;

  // baixa o envelope de perguntas
  let perguntas;
  try {
    const resp = await fetch(dados.perguntasUrl, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    perguntas = await resp.json();
  } catch (erro) {
    console.error("Falha ao baixar/parsear perguntas:", erro);
    estado("⚠️", "Não foi possível carregar as perguntas deste jogo.");
    return;
  }

  iniciarQuiz({
    container: palco,
    dados: perguntas,
    jogoId: id,
    // Gancho para o futuro ranking — por ora, só registra no console.
    aoTerminar: (resultado) => console.debug("Resultado:", resultado),
  });
}

carregar();
