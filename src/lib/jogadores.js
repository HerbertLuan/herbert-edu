// =====================================================================
//  Herbert Edu — Identidade do jogador (fonte única)
//
//  Login simples nome+senha sem servidor: os alunos vivem numa coleção
//  pública do Firestore. A senha nunca é guardada em texto — só o hash
//  SHA-256 de (salt + senha). Isto é higiene básica, não blindagem: como
//  o site é 100% cliente, não há como impedir um trapaceiro determinado.
//
//  Este módulo não conhece telas — só dados e sessão.
//
//    sessaoAtual() / sair()
//    existeJogador(nome) / cadastrar(nome, senha) / entrar(nome, senha)
//    registrarPontuacao(jogoId, pontos)
//    topRanking(limite) / posicaoDe(total)
// =====================================================================

import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, orderBy, limit, getDocs,
  where, getCountFromServer, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";

const COLECAO = "jogadores";
const CHAVE_SESSAO = "herbert-jogador";

// ---- normalização e validação do nome ----

// slug = chave única do doc. "  Herbert  Luan " -> "herbert-luan"
export function slugificar(nome = "") {
  return String(nome)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ /g, "-");
}

// Conta caracteres visíveis (sem os espaços das pontas).
export function validarNome(nome = "") {
  const limpo = String(nome).trim();
  if (limpo.length < 2) return { ok: false, motivo: "O nome precisa de pelo menos 2 letras." };
  if (limpo.length > 24) return { ok: false, motivo: "O nome pode ter no máximo 24 letras." };
  return { ok: true };
}

// ---- hash (Web Crypto, sem dependências) ----

function paraHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function gerarSalt() {
  return paraHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function hash(salt, senha) {
  const dados = new TextEncoder().encode(`${salt}${senha}`);
  const digest = await crypto.subtle.digest("SHA-256", dados);
  return paraHex(new Uint8Array(digest));
}

// ---- sessão (localStorage) ----

export function sessaoAtual() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    return dados && dados.slug ? { slug: dados.slug, nome: dados.nome } : null;
  } catch {
    return null;
  }
}

function salvarSessao(sessao) {
  try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch { /* aba privada */ }
}

export function sair() {
  try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* ignora */ }
}

// ---- identidade ----

export async function existeJogador(nome) {
  const slug = slugificar(nome);
  if (!slug) return false;
  const snap = await getDoc(doc(db, COLECAO, slug));
  return snap.exists();
}

export async function cadastrar(nome, senha) {
  const val = validarNome(nome);
  if (!val.ok) throw new Error(val.motivo);
  const slug = slugificar(nome);
  const ref = doc(db, COLECAO, slug);
  if ((await getDoc(ref)).exists()) {
    throw new Error("Esse nome já está cadastrado. Use a senha para entrar.");
  }
  const salt = gerarSalt();
  const senhaHash = await hash(salt, senha);
  await setDoc(ref, {
    nome: String(nome).trim(),
    senhaHash,
    salt,
    melhores: {},
    total: 0,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  const sessao = { slug, nome: String(nome).trim() };
  salvarSessao(sessao);
  return sessao;
}

export async function entrar(nome, senha) {
  const slug = slugificar(nome);
  const snap = await getDoc(doc(db, COLECAO, slug));
  if (!snap.exists()) throw new Error("Nome não encontrado. Confira ou crie uma conta.");
  const dados = snap.data();
  const tentativa = await hash(dados.salt, senha);
  if (tentativa !== dados.senhaHash) throw new Error("Senha incorreta. Tente de novo.");
  const sessao = { slug, nome: dados.nome || String(nome).trim() };
  salvarSessao(sessao);
  return sessao;
}

// ---- pontuação ----

// Só sobe se for recorde naquele jogo. Sem sessão é no-op silencioso —
// jogar deslogado continua válido.
export async function registrarPontuacao(jogoId, pontos) {
  const sessao = sessaoAtual();
  if (!sessao || !jogoId) return { atualizou: false };
  const ref = doc(db, COLECAO, sessao.slug);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { atualizou: false };

  const dados = snap.data();
  const melhores = { ...(dados.melhores || {}) };
  const pontosNum = Number(pontos) || 0;
  if (pontosNum <= (Number(melhores[jogoId]) || 0)) return { atualizou: false };

  melhores[jogoId] = pontosNum;
  const total = Object.values(melhores).reduce((s, v) => s + (Number(v) || 0), 0);
  await updateDoc(ref, { melhores, total, atualizadoEm: serverTimestamp() });
  return { atualizou: true, total };
}

// ---- admin ----

// Aluno perdeu a senha: ninguém (nem o admin) consegue "ler" a senha atual,
// pois só o hash é guardado. Esta função define uma nova.
export async function redefinirSenha(slug, novaSenha) {
  const salt = gerarSalt();
  const senhaHash = await hash(salt, novaSenha);
  await updateDoc(doc(db, COLECAO, slug), { senhaHash, salt, atualizadoEm: serverTimestamp() });
}

// ---- ranking ----

export async function topRanking(limite = 12) {
  const q = query(collection(db, COLECAO), orderBy("total", "desc"), limit(limite));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const dados = d.data();
    return { slug: d.id, nome: dados.nome || d.id, total: Number(dados.total) || 0 };
  });
}

// Posição do aluno = quantos têm total estritamente maior + 1.
// Empates dividem a faixa (aceitável). Usa contagem — não baixa docs.
export async function posicaoDe(total) {
  const q = query(collection(db, COLECAO), where("total", ">", Number(total) || 0));
  const snap = await getCountFromServer(q);
  return snap.data().count + 1;
}

// Lê o total atual do aluno logado (para calcular a posição quando ele fica
// fora do top). Devolve null sem sessão ou se o doc sumiu.
export async function totalDoJogador(slug) {
  if (!slug) return null;
  const snap = await getDoc(doc(db, COLECAO, slug));
  return snap.exists() ? (Number(snap.data().total) || 0) : null;
}
