// Visualizador de aula: carrega a aula pelo ?id=, busca o arquivo no Firestore
// e exibe em um iframe isolado (preserva estilos/scripts próprios da aula).
import { doc, getDoc } from "firebase/firestore";
import { db, iniciarAnalytics } from "./firebase.js";

iniciarAnalytics();

const params = new URLSearchParams(location.search);
const id = params.get("id");

const elTitulo = document.getElementById("titulo");
const elQuadro = document.getElementById("quadro");
const elCarregando = document.getElementById("carregando");
const btnApresentar = document.getElementById("apresentar");

btnApresentar.addEventListener("click", () => {
  const alvo = elQuadro;
  if (alvo.requestFullscreen) alvo.requestFullscreen();
  else if (alvo.webkitRequestFullscreen) alvo.webkitRequestFullscreen();
});

async function carregar() {
  if (!id) {
    elTitulo.textContent = "Aula não encontrada";
    elCarregando.textContent = "Link inválido — falta o identificador da aula.";
    return;
  }
  try {
    const snap = await getDoc(doc(db, "aulas", id));
    const dados = snap.exists() ? snap.data() : null;
    const estado = dados && (dados.estado || (dados.publicado ? "publicado" : "oculto"));
    if (!dados || estado !== "publicado") {
      elTitulo.textContent = "Aula indisponível";
      elCarregando.textContent = estado === "preparacao"
        ? "Esta aula ainda está em preparação. Em breve!"
        : "Esta aula não está publicada.";
      return;
    }
    const aula = snap.data();
    elTitulo.textContent = aula.titulo || "Aula";
    document.title = `${aula.titulo || "Aula"} · Herbert Edu`;
    elQuadro.addEventListener("load", () => { elCarregando.style.display = "none"; });
    elQuadro.src = aula.arquivoUrl;
  } catch (erro) {
    console.error(erro);
    elTitulo.textContent = "Erro";
    elCarregando.textContent = "Não foi possível carregar a aula agora.";
  }
}

carregar();
