// ============================================================================
//  Herbert Edu — Painel do Admin
//  Login com Google + permissão via custom claim admin=true. CRUD de temas e
//  aulas direto no Firestore/Storage (regras só liberam escrita para admin).
// ============================================================================
import { auth, db, storage, iniciarAnalytics } from "./firebase.js";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

iniciarAnalytics();

const $ = (s) => document.querySelector(s);
const elLogin = $("#login"), elPainel = $("#painel"), elLista = $("#lista");
const elLoginMsg = $("#login-msg"), btnEntrar = $("#btn-entrar"), elToast = $("#toast");

let temas = [], aulas = [];

/* ---------- utilidades ---------- */
const escapar = (t = "") => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function slugify(t) {
  return (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function unicoId(base, usados) {
  let id = base || "item", n = 2;
  while (usados.includes(id)) id = `${base}-${n++}`;
  return id;
}
let toastTimer;
function toast(msg, tipo = "ok") {
  elToast.textContent = msg; elToast.className = "toast " + tipo; elToast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (elToast.hidden = true), 3000);
}

/* ---------- Autenticação ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return mostrarLogin();
  let admin = false;
  try { admin = (await user.getIdTokenResult(true)).claims.admin === true; } catch {}
  if (admin) entrarPainel(user);
  else mostrarLogin(`A conta ${user.email} ainda não tem permissão de admin.`);
});

function mostrarLogin(msg = "") {
  elPainel.hidden = true; elLogin.hidden = false;
  elLoginMsg.textContent = msg;
  btnEntrar.lastChild.textContent = auth.currentUser ? " Trocar de conta" : " Entrar com Google";
}
btnEntrar.addEventListener("click", async () => {
  if (auth.currentUser) { await signOut(auth); return; }
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    elLoginMsg.textContent = e.code === "auth/operation-not-allowed"
      ? "Ative o provedor Google no console do Firebase (Authentication → Sign-in method)."
      : "Falha no login: " + (e.message || e.code);
  }
});
$("#btn-sair").addEventListener("click", () => signOut(auth));

function entrarPainel(user) {
  elLogin.hidden = true; elPainel.hidden = false;
  $("#painel-user").textContent = user.email;
  carregar();
}

/* ---------- Carregar dados ---------- */
async function carregar() {
  elLista.innerHTML = `<div class="estado"><span class="emoji">⏳</span> Carregando…</div>`;
  try {
    const [ts, as] = await Promise.all([
      getDocs(query(collection(db, "temas"), orderBy("ordem"))),
      getDocs(query(collection(db, "aulas"), orderBy("ordem"))),
    ]);
    temas = ts.docs.map((d) => ({ id: d.id, ...d.data() }));
    aulas = as.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (e) {
    elLista.innerHTML = `<div class="estado"><span class="emoji">⚠️</span> Erro ao carregar: ${escapar(e.message || "")}</div>`;
  }
}

/* ---------- Render ---------- */
function aulasDoTema(temaId) {
  return aulas.filter((a) => a.temaId === temaId).sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0));
}
function render() {
  if (!temas.length) {
    elLista.innerHTML = `<div class="estado"><span class="emoji">📚</span> Nenhum tema ainda. Crie o primeiro com “+ Novo tema”.</div>`;
    return;
  }
  elLista.innerHTML = temas.map((t, i) => {
    const lista = aulasDoTema(t.id);
    const linhas = lista.length ? lista.map((a, j) => linhaAula(a, j, lista.length)).join("")
      : `<div class="sem-aulas">Sem materiais. Use “+ Aula”.</div>`;
    return `
      <div class="tema-bloco" data-tema="${t.id}">
        <div class="tema-cab">
          <div class="ordenadores">
            <button data-acao="tema-cima" ${i === 0 ? "disabled" : ""}>▲</button>
            <button data-acao="tema-baixo" ${i === temas.length - 1 ? "disabled" : ""}>▼</button>
          </div>
          <span class="tema-cor" style="background:${escapar(t.cor || "#2563EB")}"></span>
          <div class="tema-nome">${escapar(t.titulo)}<small>${escapar(t.descricao || "sem descrição")} · ${lista.length} material(is)</small></div>
          <div class="tema-botoes">
            <button class="btn ghost mini" data-acao="add-aula">+ Aula</button>
            <button class="btn ghost mini" data-acao="tema-editar">Editar</button>
            <button class="btn perigo mini" data-acao="tema-excluir">Excluir</button>
          </div>
        </div>
        <div class="aulas-lista">${linhas}</div>
      </div>`;
  }).join("");
}
const estadoDe = (a) => a.estado || (a.publicado ? "publicado" : "oculto");
function dataBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function linhaAula(a, j, total) {
  const tag = a.tipo === "pdf" ? `<span class="tag pdf">PDF</span>` : `<span class="tag">HTML</span>`;
  const abrir = a.tipo === "pdf" ? a.arquivoUrl : `/aula.html?id=${encodeURIComponent(a.id)}`;
  const est = estadoDe(a);
  const dataTxt = a.data ? `📅 ${dataBR(a.data)} · ` : "";
  const seg = (val, label) => `<button data-acao="estado" data-valor="${val}" class="${est === val ? "sel" : ""}">${label}</button>`;
  return `
    <div class="aula-linha" data-aula="${a.id}">
      <div class="ordenadores">
        <button data-acao="aula-cima" ${j === 0 ? "disabled" : ""}>▲</button>
        <button data-acao="aula-baixo" ${j === total - 1 ? "disabled" : ""}>▼</button>
      </div>
      <div class="aula-info">
        <div class="aula-nome">${tag} ${escapar(a.titulo)}</div>
        <div class="aula-meta">${dataTxt}${escapar(a.descricao || "")}</div>
      </div>
      <div class="estado-seg" title="Estado na home">
        ${seg("oculto", "Oculto")}${seg("preparacao", "Preparação")}${seg("publicado", "Publicado")}
      </div>
      <div class="tema-botoes">
        <a class="btn ghost mini" href="${abrir}" target="_blank" rel="noopener">Abrir</a>
        <button class="btn ghost mini" data-acao="aula-editar">Editar</button>
        <button class="btn perigo mini" data-acao="aula-excluir">Excluir</button>
      </div>
    </div>`;
}

/* ---------- Reordenação (troca de ordem com o vizinho) ---------- */
async function mover(colecao, lista, idAtual, dir) {
  const i = lista.findIndex((x) => x.id === idAtual), j = i + dir;
  if (j < 0 || j >= lista.length) return;
  const a = lista[i], b = lista[j];
  await Promise.all([
    updateDoc(doc(db, colecao, a.id), { ordem: b.ordem ?? 0 }),
    updateDoc(doc(db, colecao, b.id), { ordem: a.ordem ?? 0 }),
  ]);
  await carregar();
}

/* ---------- Delegação de eventos ---------- */
elLista.addEventListener("click", async (e) => {
  const alvo = e.target.closest("[data-acao]");
  const acao = alvo?.dataset.acao;
  if (!acao) return;
  const temaId = e.target.closest("[data-tema]")?.dataset.tema;
  const aulaId = e.target.closest("[data-aula]")?.dataset.aula;
  try {
    if (acao === "tema-cima") await mover("temas", temas, temaId, -1);
    if (acao === "tema-baixo") await mover("temas", temas, temaId, +1);
    if (acao === "tema-editar") abrirModalTema(temas.find((t) => t.id === temaId));
    if (acao === "tema-excluir") await excluirTema(temaId);
    if (acao === "add-aula") abrirModalAula(null, temaId);
    if (acao === "aula-cima") await mover("aulas", aulasDoTema(temaId), aulaId, -1);
    if (acao === "aula-baixo") await mover("aulas", aulasDoTema(temaId), aulaId, +1);
    if (acao === "aula-editar") abrirModalAula(aulas.find((a) => a.id === aulaId));
    if (acao === "aula-excluir") await excluirAula(aulaId);
    if (acao === "estado") await mudarEstado(aulaId, alvo.dataset.valor);
  } catch (err) { toast(err.message || "Erro", "erro"); }
});

async function mudarEstado(id, estado) {
  await updateDoc(doc(db, "aulas", id), { estado, publicado: estado === "publicado" });
  toast(estado === "publicado" ? "Publicado na home"
    : estado === "preparacao" ? "Marcado como “em preparação”" : "Oculto da home");
  await carregar();
}
$("#btn-novo-tema").addEventListener("click", () => abrirModalTema(null));

/* ---------- Modal genérico ---------- */
function abrirModal(html) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<div class="modal-card">${html}</div>`;
  document.body.appendChild(m);
  m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
  return m;
}

/* ---------- Tema: criar/editar ---------- */
function abrirModalTema(tema) {
  const ed = !!tema;
  const m = abrirModal(`
    <h3>${ed ? "Editar tema" : "Novo tema"}</h3>
    <div class="campo"><label>Título</label><input type="text" id="t-titulo" value="${ed ? escapar(tema.titulo) : ""}" placeholder="Ex.: Função do 1º grau"></div>
    <div class="campo"><label>Descrição</label><textarea id="t-desc" placeholder="Aparece abaixo do título na home">${ed ? escapar(tema.descricao || "") : ""}</textarea></div>
    <div class="campo"><label>Cor</label><div class="campo-cor"><input type="color" id="t-cor" value="${ed ? (tema.cor || "#2563EB") : "#2563EB"}"><span class="ajuda">Bolinha ao lado do tema</span></div></div>
    <div class="modal-erro" id="t-erro"></div>
    <div class="modal-acoes">
      <button class="btn ghost" data-fechar>Cancelar</button>
      <button class="btn" id="t-salvar">Salvar</button>
    </div>`);
  m.querySelector("[data-fechar]").onclick = () => m.remove();
  m.querySelector("#t-salvar").onclick = async () => {
    const titulo = m.querySelector("#t-titulo").value.trim();
    if (!titulo) return (m.querySelector("#t-erro").textContent = "Informe o título.");
    const dados = { titulo, descricao: m.querySelector("#t-desc").value.trim(), cor: m.querySelector("#t-cor").value };
    const btn = m.querySelector("#t-salvar"); btn.disabled = true;
    try {
      if (ed) await updateDoc(doc(db, "temas", tema.id), dados);
      else {
        const id = unicoId(slugify(titulo), temas.map((t) => t.id));
        const ordem = temas.length ? Math.max(...temas.map((t) => t.ordem ?? 0)) + 1 : 0;
        await setDoc(doc(db, "temas", id), { ...dados, ordem });
      }
      m.remove(); toast("Tema salvo"); await carregar();
    } catch (err) { btn.disabled = false; m.querySelector("#t-erro").textContent = err.message || "Erro ao salvar."; }
  };
}

async function excluirTema(id) {
  if (aulasDoTema(id).length) return toast("Remova/mova os materiais antes de excluir o tema.", "erro");
  if (!confirm("Excluir este tema? Esta ação não pode ser desfeita.")) return;
  await deleteDoc(doc(db, "temas", id));
  toast("Tema excluído"); await carregar();
}

/* ---------- Aula: criar/editar ---------- */
function abrirModalAula(aula, temaIdInicial) {
  const ed = !!aula;
  const opcoes = temas.map((t) => `<option value="${t.id}" ${((ed ? aula.temaId : temaIdInicial) === t.id) ? "selected" : ""}>${escapar(t.titulo)}</option>`).join("");
  const m = abrirModal(`
    <h3>${ed ? "Editar material" : "Novo material"}</h3>
    <div class="campo"><label>Título</label><input type="text" id="a-titulo" value="${ed ? escapar(aula.titulo) : ""}" placeholder="Ex.: Função Afim no ENEM"></div>
    <div class="campo"><label>Descrição</label><textarea id="a-desc" placeholder="Resumo curto na home">${ed ? escapar(aula.descricao || "") : ""}</textarea></div>
    <div class="campo"><label>Tema</label><select id="a-tema">${opcoes}</select></div>
    <div class="campo">
      <label>Arquivo (PDF ou HTML autocontido)</label>
      <input type="file" id="a-arquivo" accept=".pdf,.html,.htm">
      <div class="ajuda">${ed ? "Deixe vazio para manter o arquivo atual." : "Aulas no formato Herbert Edu: peça ao Claude. Aqui você sobe um HTML pronto ou um PDF."}</div>
    </div>
    <div class="campo"><label>Data da aula</label><input type="date" id="a-data" value="${ed && aula.data ? aula.data : ""}"><div class="ajuda">Quando você passou (ou vai passar) a aula. Opcional.</div></div>
    <div class="campo"><label>Estado na home</label>
      <select id="a-estado">
        <option value="oculto">Oculto (não aparece)</option>
        <option value="preparacao">Em preparação (aparece com animação)</option>
        <option value="publicado">Publicado (aberto aos alunos)</option>
      </select>
    </div>
    <div class="modal-erro" id="a-erro"></div>
    <div class="modal-acoes">
      <button class="btn ghost" data-fechar>Cancelar</button>
      <button class="btn" id="a-salvar">Salvar</button>
    </div>`);
  m.querySelector("[data-fechar]").onclick = () => m.remove();
  m.querySelector("#a-estado").value = ed ? estadoDe(aula) : "publicado";
  m.querySelector("#a-salvar").onclick = async () => {
    const erro = m.querySelector("#a-erro");
    const titulo = m.querySelector("#a-titulo").value.trim();
    const temaId = m.querySelector("#a-tema").value;
    const file = m.querySelector("#a-arquivo").files[0];
    const estado = m.querySelector("#a-estado").value;
    const data = m.querySelector("#a-data").value || "";
    const publicado = estado === "publicado";
    const descricao = m.querySelector("#a-desc").value.trim();
    if (!titulo) return (erro.textContent = "Informe o título.");
    if (!ed && !file) return (erro.textContent = "Selecione um arquivo PDF ou HTML.");
    if (file && !/\.(pdf|html?|)$/i.test(file.name)) return (erro.textContent = "Arquivo deve ser .pdf ou .html.");
    const btn = m.querySelector("#a-salvar"); btn.disabled = true; erro.textContent = "";
    try {
      let extra = {};
      if (file) {
        const tipo = /\.pdf$/i.test(file.name) ? "pdf" : "html";
        const id = ed ? aula.id : unicoId(slugify(titulo), aulas.map((a) => a.id));
        const caminho = `${tipo === "pdf" ? "pdfs" : "aulas"}/${id}.${tipo === "pdf" ? "pdf" : "html"}`;
        const r = ref(storage, caminho);
        await uploadBytes(r, file, { contentType: tipo === "pdf" ? "application/pdf" : "text/html; charset=utf-8", contentDisposition: "inline" });
        extra = { tipo, arquivoUrl: await getDownloadURL(r), arquivoPath: caminho, _id: id };
        // remove arquivo antigo se o caminho mudou (ex.: trocou de tipo)
        if (ed && aula.arquivoPath && aula.arquivoPath !== caminho) {
          deleteObject(ref(storage, aula.arquivoPath)).catch(() => {});
        }
      }
      if (ed) {
        await updateDoc(doc(db, "aulas", aula.id), { titulo, descricao, temaId, estado, publicado, data, ...(file ? { tipo: extra.tipo, arquivoUrl: extra.arquivoUrl, arquivoPath: extra.arquivoPath } : {}) });
      } else {
        const lista = aulasDoTema(temaId);
        const ordem = lista.length ? Math.max(...lista.map((a) => a.ordem ?? 0)) + 1 : 0;
        await setDoc(doc(db, "aulas", extra._id), {
          titulo, descricao, temaId, tipo: extra.tipo, arquivoUrl: extra.arquivoUrl, arquivoPath: extra.arquivoPath, ordem, estado, publicado, data,
        });
      }
      m.remove(); toast("Material salvo"); await carregar();
    } catch (err) { btn.disabled = false; erro.textContent = err.message || "Erro ao salvar."; }
  };
}

async function excluirAula(id) {
  const a = aulas.find((x) => x.id === id);
  if (!confirm(`Excluir “${a?.titulo || "material"}”? Esta ação não pode ser desfeita.`)) return;
  await deleteDoc(doc(db, "aulas", id));
  if (a?.arquivoPath) deleteObject(ref(storage, a.arquivoPath)).catch(() => {});
  toast("Material excluído"); await carregar();
}
