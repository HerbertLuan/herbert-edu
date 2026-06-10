// Home: lê os temas (agrupadores) e as aulas publicadas do Firestore
// e monta o catálogo. Alunos só leem; nada de escrita aqui.
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import QRCode from "qrcode";
import { db, iniciarAnalytics } from "./firebase.js";

document.getElementById("ano").textContent = new Date().getFullYear();
iniciarAnalytics();

/* ---------- QR code do site ---------- */
const URL_SITE = "https://herbert-edu.web.app/";
const btnQr = document.getElementById("btn-qr");
const modalQr = document.getElementById("qr-modal");
const fecharQr = document.getElementById("qr-fechar");

QRCode.toCanvas(URL_SITE, { width: 280, margin: 1, color: { dark: "#16223A", light: "#FFFFFF" } })
  .then((canvas) => document.getElementById("qr-img").appendChild(canvas))
  .catch((e) => console.error("Falha ao gerar QR:", e));

const abrir = () => modalQr.removeAttribute("hidden");
const fechar = () => modalQr.setAttribute("hidden", "");
btnQr.addEventListener("click", abrir);
fecharQr.addEventListener("click", fechar);
modalQr.addEventListener("click", (e) => { if (e.target === modalQr) fechar(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });

const catalogo = document.getElementById("catalogo");

function escapar(texto = "") {
  return texto.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// estado: "publicado" | "preparacao" | "oculto" (com retrocompatibilidade)
function estadoDe(aula) {
  return aula.estado || (aula.publicado ? "publicado" : "oculto");
}
function dataBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function cardAula(aula) {
  // Card "em preparação": não clicável, com animação leve de construção.
  if (estadoDe(aula) === "preparacao") {
    return `
      <div class="aula-card preparando" aria-disabled="true">
        <span class="aula-tag prep">Em preparação</span>
        <div class="aula-titulo">${escapar(aula.titulo)}</div>
        <div class="aula-descricao">${escapar(aula.descricao || "")}</div>
        <div class="prep-dots"><span></span><span></span><span></span></div>
        <div class="aula-abrir prep-txt">Chegando em breve…</div>
      </div>`;
  }

  const ehPdf = aula.tipo === "pdf";
  const tag = ehPdf ? '<span class="aula-tag pdf">PDF</span>' : '<span class="aula-tag">Aula interativa</span>';
  // PDF abre direto pelo arquivo; aula HTML abre no visualizador isolado.
  const href = ehPdf ? aula.arquivoUrl : `/aula.html?id=${encodeURIComponent(aula.id)}`;
  const alvo = ehPdf ? ' target="_blank" rel="noopener"' : "";
  const data = aula.data ? `<div class="aula-data">📅 Aula de ${dataBR(aula.data)}</div>` : "";
  return `
    <a class="aula-card" href="${href}"${alvo}>
      ${tag}
      <div class="aula-titulo">${escapar(aula.titulo)}</div>
      <div class="aula-descricao">${escapar(aula.descricao || "")}</div>
      ${data}
      <div class="aula-abrir">${ehPdf ? "Abrir PDF →" : "Abrir aula →"}</div>
    </a>`;
}

function secaoTema(tema, aulas) {
  const cor = tema.cor || "var(--accent)";
  const cards = aulas.map(cardAula).join("");
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
    // Lê por 'ordem' (índice automático) e filtra publicadas no cliente —
    // evita depender de índice composto. O catálogo é pequeno.
    const aulasSnap = await getDocs(query(collection(db, "aulas"), orderBy("ordem")));

    const aulasPorTema = new Map();
    aulasSnap.forEach((doc) => {
      const aula = { id: doc.id, ...doc.data() };
      if (estadoDe(aula) === "oculto") return; // mostra publicadas e em preparação
      if (!aulasPorTema.has(aula.temaId)) aulasPorTema.set(aula.temaId, []);
      aulasPorTema.get(aula.temaId).push(aula);
    });

    const secoes = [];
    temasSnap.forEach((doc) => {
      const tema = { id: doc.id, ...doc.data() };
      const aulas = aulasPorTema.get(tema.id) || [];
      if (aulas.length) secoes.push(secaoTema(tema, aulas));
    });

    if (!secoes.length) {
      catalogo.innerHTML = `
        <div class="estado">
          <span class="emoji">📚</span>
          Nenhum material publicado ainda. Em breve as primeiras aulas!
        </div>`;
      return;
    }

    catalogo.innerHTML = secoes.join("");
  } catch (erro) {
    console.error(erro);
    catalogo.innerHTML = `
      <div class="estado">
        <span class="emoji">⚠️</span>
        Não foi possível carregar os materiais agora. Tente novamente em instantes.
      </div>`;
  }
}

carregar();
