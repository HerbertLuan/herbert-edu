// =====================================================================
//  Herbert Edu — Sons dos minigames (síntese Web Audio, sem assets)
//
//  Fonte única de áudio dos motores de jogo. Não conhece os jogos:
//  expõe eventos nomeados. Som NUNCA pode quebrar uma partida — tudo
//  aqui é try/catch e vira no-op silencioso sem suporte ou no mudo.
//
//    destravarAudio()        cria/retoma o AudioContext (chamar num gesto)
//    tocarSom(nome, opcoes)  "acerto" | "erro" | "combo" | "fim" | "recorde"
//    somLigado()             estado global (localStorage, padrão ligado)
//    alternarSom()           inverte e persiste; retorna o novo estado
// =====================================================================

const CHAVE_SOM = "herbert-som";
const VOLUME_MESTRE = 0.2;

// Escala do acerto (pentatônica maior a partir de Lá4): cada acerto
// seguido do combo sobe um degrau, limitado pra não virar apito.
const ESCALA_ACERTO = [440, 494, 554, 659, 740, 880, 988, 1109, 1319, 1480, 1760];

let ctx = null;
let mestre = null;
let ligadoSessao = true; // fallback quando localStorage não existe

export function somLigado() {
  try {
    const v = localStorage.getItem(CHAVE_SOM);
    return v === null ? true : v !== "0";
  } catch {
    return ligadoSessao;
  }
}

export function alternarSom() {
  const novo = !somLigado();
  ligadoSessao = novo;
  try { localStorage.setItem(CHAVE_SOM, novo ? "1" : "0"); } catch { /* sessão apenas */ }
  return novo;
}

// Cria o contexto (ou o retoma, se a política de autoplay o suspendeu).
// Só funciona de verdade dentro de um gesto do usuário — os motores
// chamam no "Começar", no toggle de som e a cada resposta.
export function destravarAudio() {
  try {
    if (!somLigado()) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      mestre = ctx.createGain();
      mestre.gain.value = VOLUME_MESTRE;
      mestre.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* som nunca quebra o jogo */ }
}

// Agenda uma nota: oscilador com envelope (ataque curto, decaimento
// exponencial). Devolve o oscilador pra receitas que dobram o pitch.
function nota(freq, quando, dur, timbre = "triangle", ganho = 1) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = timbre;
  osc.frequency.setValueAtTime(freq, quando);
  g.gain.setValueAtTime(0.0001, quando);
  g.gain.linearRampToValueAtTime(ganho, quando + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
  osc.connect(g);
  g.connect(mestre);
  osc.start(quando);
  osc.stop(quando + dur + 0.03);
  return osc;
}

const SONS = {
  // blip duplo brilhante; o tom sobe com a sequência de acertos
  acerto(t, { streak = 1 } = {}) {
    const grau = Math.max(0, Math.min(streak - 1, ESCALA_ACERTO.length - 1));
    const f = ESCALA_ACERTO[grau];
    nota(f, t, 0.07, "square", 0.5);
    nota(f * 1.5, t + 0.07, 0.1, "square", 0.5);
  },
  // buzz grave com queda de pitch — claro sem ser punitivo
  erro(t) {
    const osc = nota(160, t, 0.18, "sawtooth", 0.6);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);
  },
  // arpejo maior ascendente, levemente atrasado pra não brigar com o blip do acerto
  combo(t) {
    [523, 659, 784].forEach((f, i) => nota(f, t + 0.12 + i * 0.07, 0.11, "square", 0.45));
  },
  // jingle curto de resolução
  fim(t) {
    [659, 587, 523].forEach((f, i) => nota(f, t + i * 0.13, 0.18, "triangle", 0.6));
  },
  // fanfarra: subida + acorde sustentado
  recorde(t) {
    [523, 659, 784, 1047].forEach((f, i) => nota(f, t + i * 0.09, 0.12, "square", 0.5));
    [523, 659, 784, 1047].forEach((f) => nota(f, t + 0.42, 0.55, "triangle", 0.3));
  },
};

export function tocarSom(nome, opcoes) {
  try {
    if (!somLigado()) return;
    destravarAudio();
    if (!ctx || ctx.state !== "running" || !SONS[nome]) return;
    SONS[nome](ctx.currentTime, opcoes);
  } catch { /* som nunca quebra o jogo */ }
}
