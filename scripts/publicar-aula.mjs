// ============================================================================
//  Herbert Edu — Publicação de aulas e temas
//  Usa o Firebase Admin SDK (ignora as regras de segurança) para enviar o
//  arquivo da aula ao Storage e gravar a entrada no catálogo (Firestore).
//
//  Requisitos:
//    • Arquivo ./serviceAccountKey.json (chave de serviço de admin, fora do Git)
//
//  Uso:
//    Criar/atualizar um tema (agrupador):
//      node scripts/publicar-aula.mjs tema --slug funcoes-2grau \
//           --titulo "Função do 2º grau" --ordem 1 [--descricao "..."] [--cor "#2563EB"]
//
//    Publicar uma aula (HTML interativo ou PDF legado):
//      node scripts/publicar-aula.mjs aula --arquivo "caminho/aula.html" \
//           --titulo "Funções Quadráticas — Aula 1" --tema funcoes-2grau \
//           [--descricao "..."] [--ordem 1] [--slug quadraticas-1] [--tipo html|pdf]
//
//    Publicar um minigame (perguntas em JSON):
//      node scripts/publicar-aula.mjs jogo --perguntas "aulas/jogos/quiz-x.json" \
//           --titulo "Quiz relâmpago — Quadráticas" --tema funcoes-2grau \
//           [--descricao "..."] [--ordem 0] [--slug quiz-quadraticas] \
//           [--estado publicado|preparacao|oculto] [--rascunho]
//
//    Listar o catálogo atual:
//      node scripts/publicar-aula.mjs listar
// ============================================================================

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { montarAula } from "./montar-aula.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_CHAVE = resolve(RAIZ, "serviceAccountKey.json");
const BUCKET = "herbert-edu.firebasestorage.app";

// ---------- utilidades ----------
function erroFatal(msg) {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const chave = argv[i].slice(2);
      const valor = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[chave] = valor;
    }
  }
  return args;
}

function slugify(texto) {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------- inicialização ----------
if (!existsSync(CAMINHO_CHAVE)) {
  erroFatal(
    "Não encontrei a chave de serviço em ./serviceAccountKey.json\n" +
    "   No console do Firebase: Configurações do projeto → Contas de serviço →\n" +
    "   'Gerar nova chave privada'. Salve o JSON como serviceAccountKey.json na raiz."
  );
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(CAMINHO_CHAVE, "utf8"))),
  storageBucket: BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// ---------- comandos ----------
async function cmdTema(a) {
  if (!a.titulo) erroFatal("Informe --titulo do tema.");
  const slug = a.slug || slugify(a.titulo);
  const dados = {
    titulo: a.titulo,
    ordem: a.ordem != null ? Number(a.ordem) : 0,
    ...(a.descricao ? { descricao: a.descricao } : {}),
    ...(a.cor ? { cor: a.cor } : {}),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection("temas").doc(slug).set(dados, { merge: true });
  console.log(`\n✅ Tema "${a.titulo}" salvo (id: ${slug}).\n`);
}

async function cmdAula(a) {
  if (!a.arquivo && !a.conteudo) erroFatal("Informe --arquivo (HTML/PDF pronto) ou --conteudo (slides a montar).");
  if (!a.titulo) erroFatal("Informe --titulo da aula.");
  if (!a.tema) erroFatal("Informe --tema (id/slug do agrupador).");

  // --conteudo: "assa" os slides com o design system num HTML autocontido
  let caminho;
  if (a.conteudo) {
    const conteudoPath = resolve(RAIZ, a.conteudo);
    if (!existsSync(conteudoPath)) erroFatal(`Conteúdo não encontrado: ${conteudoPath}`);
    const html = montarAula({ conteudoPath, titulo: a.titulo });
    caminho = join(dirname(conteudoPath), "index.html");
    writeFileSync(caminho, html, "utf8");
    console.log(`   Aula montada (${(html.length / 1024).toFixed(0)} kB).`);
  } else {
    caminho = resolve(RAIZ, a.arquivo);
    if (!existsSync(caminho)) erroFatal(`Arquivo não encontrado: ${caminho}`);
  }

  // confere se o tema existe
  const temaRef = db.collection("temas").doc(a.tema);
  if (!(await temaRef.get()).exists) {
    erroFatal(`Tema "${a.tema}" não existe. Crie antes com o comando "tema".`);
  }

  const ext = extname(caminho).toLowerCase();
  const tipo = a.tipo || (ext === ".pdf" ? "pdf" : "html");
  const slug = a.slug || slugify(a.titulo);
  const pasta = tipo === "pdf" ? "pdfs" : "aulas";
  const destino = `${pasta}/${slug}${ext || (tipo === "pdf" ? ".pdf" : ".html")}`;
  const contentType = tipo === "pdf" ? "application/pdf" : "text/html; charset=utf-8";

  // envia o arquivo e deixa público para leitura, servindo inline
  await bucket.upload(caminho, {
    destination: destino,
    metadata: { contentType, contentDisposition: "inline", cacheControl: "public, max-age=300" },
  });
  await bucket.file(destino).makePublic();
  const arquivoUrl = `https://storage.googleapis.com/${BUCKET}/${destino}`;

  // ordem automática: vai para o fim do tema, se não informada
  let ordem = a.ordem != null ? Number(a.ordem) : null;
  if (ordem == null) {
    const irmas = await db.collection("aulas").where("temaId", "==", a.tema).get();
    ordem = irmas.size;
  }

  await db.collection("aulas").doc(slug).set(
    {
      titulo: a.titulo,
      descricao: a.descricao || "",
      temaId: a.tema,
      tipo,
      arquivoUrl,
      arquivoPath: destino,
      ordem,
      publicado: a.rascunho ? false : true,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`\n✅ Aula "${a.titulo}" publicada (id: ${slug}).`);
  console.log(`   Arquivo: ${arquivoUrl}\n`);
}

// Valida o envelope JSON de um jogo antes de publicar. Devolve uma mensagem
// de erro (string) se algo estiver errado, ou null se estiver tudo certo.
function validarJogo(dados) {
  const formatosOk = ["quiz", "vf", "grafico", "pareamento", "erro"];
  if (!dados || typeof dados !== "object") return "JSON vazio ou não é um objeto.";
  if (!formatosOk.includes(dados.formato)) {
    return `campo "formato" ausente ou desconhecido (use: ${formatosOk.join(", ")}).`;
  }
  // V1 implementa só o motor "quiz"; os demais formatos ficam reservados.
  if (dados.formato === "quiz") {
    if (!Array.isArray(dados.questoes) || dados.questoes.length === 0) {
      return 'o jogo "quiz" precisa de um array "questoes" não vazio.';
    }
    for (let i = 0; i < dados.questoes.length; i++) {
      const q = dados.questoes[i];
      const n = i + 1;
      if (!q || typeof q.enunciado !== "string" || !q.enunciado.trim()) {
        return `questão ${n}: "enunciado" ausente ou vazio.`;
      }
      if (!Array.isArray(q.opcoes) || q.opcoes.length < 2) {
        return `questão ${n}: "opcoes" precisa de ao menos 2 alternativas.`;
      }
      if (!Number.isInteger(q.correta) || q.correta < 0 || q.correta >= q.opcoes.length) {
        return `questão ${n}: "correta" (${q.correta}) fora do intervalo das opções.`;
      }
    }
    if (dados.sortear !== undefined) {
      if (!Number.isInteger(dados.sortear) || dados.sortear < 1) {
        return '"sortear" deve ser um inteiro ≥ 1.';
      }
      if (dados.sortear > dados.questoes.length) {
        return `"sortear" (${dados.sortear}) é maior que o número de questões (${dados.questoes.length}).`;
      }
    }
  }
  return null;
}

async function cmdJogo(a) {
  if (!a.perguntas) erroFatal("Informe --perguntas (arquivo JSON com as questões).");
  if (!a.titulo) erroFatal("Informe --titulo do jogo.");
  if (!a.tema) erroFatal("Informe --tema (id/slug do agrupador).");

  const jsonPath = resolve(RAIZ, a.perguntas);
  if (!existsSync(jsonPath)) erroFatal(`Arquivo de perguntas não encontrado: ${jsonPath}`);

  let dados;
  try {
    dados = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (e) {
    erroFatal(`JSON inválido em ${a.perguntas}: ${e.message}`);
  }
  const problema = validarJogo(dados);
  if (problema) erroFatal(`Validação do jogo falhou — ${problema}`);

  // confere se o tema existe
  const temaRef = db.collection("temas").doc(a.tema);
  if (!(await temaRef.get()).exists) {
    erroFatal(`Tema "${a.tema}" não existe. Crie antes com o comando "tema".`);
  }

  const slug = a.slug || slugify(a.titulo);
  const destino = `jogos/${slug}.json`;

  // envia o JSON e deixa público para leitura, servindo inline
  await bucket.upload(jsonPath, {
    destination: destino,
    metadata: {
      contentType: "application/json; charset=utf-8",
      contentDisposition: "inline",
      cacheControl: "public, max-age=300",
    },
  });
  await bucket.file(destino).makePublic();
  const perguntasUrl = `https://storage.googleapis.com/${BUCKET}/${destino}`;

  // ordem automática: vai para o fim do tema, se não informada
  let ordem = a.ordem != null ? Number(a.ordem) : null;
  if (ordem == null) {
    const irmaos = await db.collection("jogos").where("temaId", "==", a.tema).get();
    ordem = irmaos.size;
  }

  // estado: publicado (padrão) | preparacao | oculto. --rascunho ⇒ oculto.
  const estado = a.estado || (a.rascunho ? "oculto" : "publicado");

  await db.collection("jogos").doc(slug).set(
    {
      titulo: a.titulo,
      descricao: a.descricao || "",
      temaId: a.tema,
      formato: dados.formato,
      ordem,
      estado,
      publicado: estado === "publicado",
      perguntasUrl,
      perguntasPath: destino,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`\n✅ Jogo "${a.titulo}" publicado (id: ${slug}, formato: ${dados.formato}, estado: ${estado}).`);
  console.log(`   Perguntas: ${perguntasUrl}\n`);
}

async function cmdListar() {
  const temas = await db.collection("temas").orderBy("ordem").get();
  if (temas.empty) { console.log("\n(catálogo vazio)\n"); return; }
  for (const t of temas.docs) {
    console.log(`\n# ${t.data().titulo}  [${t.id}]`);
    const aulas = await db.collection("aulas").where("temaId", "==", t.id).get();
    aulas.docs
      .sort((x, y) => (x.data().ordem ?? 0) - (y.data().ordem ?? 0))
      .forEach((d) => {
        const v = d.data();
        const flag = v.publicado ? "●" : "○ (rascunho)";
        console.log(`   ${flag} ${v.titulo}  [${d.id}] (${v.tipo})`);
      });
    const jogos = await db.collection("jogos").where("temaId", "==", t.id).get();
    jogos.docs
      .sort((x, y) => (x.data().ordem ?? 0) - (y.data().ordem ?? 0))
      .forEach((d) => {
        const v = d.data();
        const flag = v.publicado ? "●" : "○ (rascunho)";
        console.log(`   ${flag} 🎮 ${v.titulo}  [${d.id}] (jogo:${v.formato})`);
      });
  }
  console.log("");
}

// ---------- roteador ----------
const [, , comando, ...resto] = process.argv;
const args = parseArgs(resto);

const comandos = { tema: cmdTema, aula: cmdAula, jogo: cmdJogo, listar: cmdListar };
const fn = comandos[comando];

if (!fn) {
  console.log(
    "\nComandos: tema | aula | jogo | listar\n" +
    "Ex.: node scripts/publicar-aula.mjs aula --arquivo aulas/x.html --titulo \"...\" --tema funcoes-2grau\n" +
    "Ex.: node scripts/publicar-aula.mjs jogo --perguntas aulas/jogos/quiz-x.json --titulo \"...\" --tema funcoes-2grau\n"
  );
  process.exit(comando ? 1 : 0);
}

fn(args).then(() => process.exit(0)).catch((e) => erroFatal(e.message || String(e)));
