/* =====================================================================
   HERBERT EDU — Motor das AULAS (modo híbrido)
   Inlinado em cada aula publicada. Sem dependências externas.

   Recursos:
     • ESTUDO (rolagem) ⇄ APRESENTAÇÃO (deck 16:9 + tela cheia)
     • ZOOM de destaque no modo apresentação (clique para ampliar um ponto;
       mova o mouse para deslocar; clique de novo para voltar)
     • Exportar a aula como PDF bonito (cada slide vira uma página)
     • Navegação de slides, teclado, barra de progresso
     • Widgets declarativos:
         - [data-parabola a b c | annot | vertice | raizes | crescimento]
         - [data-simulador]   → simulador a,b,c interativo
         - .quiz com .opt[data-correta] → quiz de recuperação ativa
   ===================================================================== */
(function () {
  "use strict";

  const aula = document.querySelector(".aula");
  if (!aula) return;
  const deck = aula.querySelector(".deck");
  const slides = [...deck.querySelectorAll(".slide")];
  let idx = 0;

  /* ---------- UI (criada via JS; autor só escreve slides) ---------- */
  const titulo = aula.dataset.titulo || document.title || "Aula";

  const topo = document.createElement("div");
  topo.className = "aula-topo";
  topo.innerHTML =
    `<span class="titulo">${titulo}</span>` +
    `<button class="btn ghost" data-acao="pdf">⬇ PDF</button>` +
    `<button class="btn" data-acao="apresentar">⛶ Apresentar</button>`;
  aula.insertBefore(topo, deck);

  const controles = document.createElement("div");
  controles.className = "aula-controles";
  controles.innerHTML =
    `<button class="btn ghost" data-acao="voltar">← Voltar</button>` +
    `<span class="count"><b data-cur>1</b> / <span data-tot>${slides.length}</span></span>` +
    `<button class="btn" data-acao="avancar">Avançar →</button>` +
    `<button class="btn ghost" data-acao="sair">✕ Sair</button>`;
  const progresso = document.createElement("div");
  progresso.className = "aula-progresso";
  aula.after(controles, progresso);

  const elCur = controles.querySelector("[data-cur]");

  /* ---------- Modo apresentação ---------- */
  function fit() {
    const escala = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    aula.style.setProperty("--escala", escala);
  }
  function limpaZoom() {
    zoomAtivo = false;
    slides.forEach((s) => { s.style.transform = ""; s.style.transformOrigin = ""; });
  }
  function mostra(i) {
    limpaZoom();
    idx = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle("ativo", k === idx));
    elCur.textContent = idx + 1;
    progresso.style.width = ((idx + 1) / slides.length * 100) + "%";
  }
  function entrarApresentacao() {
    aula.dataset.modo = "apresentacao";
    fit();
    mostra(0);
    if (aula.requestFullscreen) aula.requestFullscreen().catch(() => {});
  }
  function sairApresentacao() {
    limpaZoom();
    aula.dataset.modo = "estudo";
    slides.forEach((s) => s.classList.remove("ativo"));
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ---------- Exportar PDF (impressão = cada slide vira página) ---------- */
  function exportarPDF() {
    if (aula.dataset.modo === "apresentacao") sairApresentacao();
    setTimeout(() => window.print(), 150);
  }

  /* ---------- Zoom de destaque (modo apresentação) ---------- */
  let zoomAtivo = false;
  const FATOR_ZOOM = 2.4;
  function origem(slide, e) {
    const r = slide.getBoundingClientRect();
    const ox = ((e.clientX - r.left) / r.width) * 100;
    const oy = ((e.clientY - r.top) / r.height) * 100;
    return `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;
  }
  deck.addEventListener("click", (e) => {
    if (aula.dataset.modo !== "apresentacao") return;
    if (e.target.closest("input, button, a, .opt")) return; // não atrapalha widgets
    const slide = slides[idx];
    if (!slide) return;
    zoomAtivo = !zoomAtivo;
    if (zoomAtivo) {
      slide.style.transformOrigin = origem(slide, e);
      slide.style.transform = `scale(${FATOR_ZOOM})`;
      deck.classList.add("ampliado");
    } else {
      slide.style.transform = "";
      deck.classList.remove("ampliado");
    }
  });
  deck.addEventListener("mousemove", (e) => {
    if (!zoomAtivo || aula.dataset.modo !== "apresentacao") return;
    const slide = slides[idx];
    if (slide) slide.style.transformOrigin = origem(slide, e);
  });

  /* ---------- Ações e teclado ---------- */
  document.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "apresentar") entrarApresentacao();
    if (acao === "pdf") exportarPDF();
    if (acao === "sair") sairApresentacao();
    if (acao === "avancar") mostra(idx + 1);
    if (acao === "voltar") mostra(idx - 1);
  });
  document.addEventListener("keydown", (e) => {
    if (aula.dataset.modo !== "apresentacao") return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); mostra(idx + 1); }
    if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); mostra(idx - 1); }
    if (e.key === "Escape") { if (zoomAtivo) limpaZoom(); else sairApresentacao(); }
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && aula.dataset.modo === "apresentacao") sairApresentacao();
  });
  window.addEventListener("resize", () => { if (aula.dataset.modo === "apresentacao") fit(); });

  /* ===================================================================
     WIDGETS
     =================================================================== */

  // ---- Parábola (SVG) ----
  function parabolaSVG(o) {
    const w = o.w || 640, h = o.h || 480;
    const a = +o.a, b = +o.b, c = +o.c;
    const xmin = o.xmin ?? -6, xmax = o.xmax ?? 6, ymin = o.ymin ?? -6, ymax = o.ymax ?? 6;
    const px = (x) => ((x - xmin) / (xmax - xmin)) * w;
    const py = (y) => h - ((y - ymin) / (ymax - ymin)) * h;
    const cor = o.cor || "#7C3AED";

    let grid = "";
    for (let g = Math.ceil(xmin); g <= xmax; g++) {
      grid += `<line x1="${px(g)}" y1="0" x2="${px(g)}" y2="${h}" stroke="#EAEFF7" stroke-width="1"/>`;
      grid += `<line x1="0" y1="${py(g)}" x2="${w}" y2="${py(g)}" stroke="#EAEFF7" stroke-width="1"/>`;
    }

    let curva = "";
    const ponto = (i) => { const x = xmin + (xmax - xmin) * i / 240; return [x, a * x * x + b * x + c]; };
    if (o.crescimento) {
      const xv = -b / (2 * a);
      let dDown = "", dUp = "";
      for (let i = 0; i <= 240; i++) {
        const [x, y] = ponto(i), X = px(x).toFixed(1), Y = py(y).toFixed(1);
        const sobe = a > 0 ? x > xv : x < xv;
        if (sobe) dUp += (dUp ? "L" : "M") + X + " " + Y + " ";
        else dDown += (dDown ? "L" : "M") + X + " " + Y + " ";
      }
      curva =
        `<path d="${dDown}" fill="none" stroke="#D9480F" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="${dUp}" fill="none" stroke="#137a4b" stroke-width="6" stroke-linecap="round"/>`;
    } else {
      let d = "";
      for (let i = 0; i <= 240; i++) { const [x, y] = ponto(i); d += (d ? "L" : "M") + px(x).toFixed(1) + " " + py(y).toFixed(1) + " "; }
      curva = `<path d="${d}" fill="none" stroke="#2563EB" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    let ann = "";
    if (o.annot || o.vertice) {
      const xv = -b / (2 * a), yv = a * xv * xv + b * xv + c;
      ann += `<line x1="${px(xv)}" y1="0" x2="${px(xv)}" y2="${h}" stroke="${cor}" stroke-width="2" stroke-dasharray="8 8"/>`;
      ann += `<circle cx="${px(xv)}" cy="${py(yv)}" r="9" fill="${cor}"/>`;
      const rot = o.rotulo || "vértice";
      ann += `<text x="${px(xv) + 12}" y="${py(yv) + (a > 0 ? 34 : -16)}" font-size="20" fill="${cor}" font-weight="800">${rot}</text>`;
    }
    if (o.annot) {
      ann += `<circle cx="${px(0)}" cy="${py(c)}" r="8" fill="#137a4b"/>`;
      ann += `<text x="${px(0) + 12}" y="${py(c) - 12}" font-size="20" fill="#137a4b" font-weight="700">(0, c)</text>`;
    }
    if (o.annot || o.raizes) {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        [...new Set([(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)])]
          .forEach((r) => { ann += `<circle cx="${px(r)}" cy="${py(0)}" r="7" fill="#2563EB"/>`; });
      }
    }

    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;margin:0 auto">
      ${grid}
      <line x1="0" y1="${py(0)}" x2="${w}" y2="${py(0)}" stroke="#9AA8C0" stroke-width="2"/>
      <line x1="${px(0)}" y1="0" x2="${px(0)}" y2="${h}" stroke="#9AA8C0" stroke-width="2"/>
      ${curva}${ann}
    </svg>`;
  }

  function initParabolas() {
    document.querySelectorAll("[data-parabola]").forEach((el) => {
      el.innerHTML = parabolaSVG({
        a: el.dataset.a, b: el.dataset.b, c: el.dataset.c,
        w: +el.dataset.w || 640, h: +el.dataset.h || 480,
        annot: el.hasAttribute("data-annot"),
        vertice: el.hasAttribute("data-vertice"),
        raizes: el.hasAttribute("data-raizes"),
        crescimento: el.hasAttribute("data-crescimento"),
        rotulo: el.dataset.rotulo,
        cor: el.dataset.cor,
      });
    });
  }

  // ---- Simulador a, b, c ----
  function initSimuladores() {
    document.querySelectorAll("[data-simulador]").forEach((el) => {
      const a0 = el.dataset.a ?? 1, b0 = el.dataset.b ?? -2, c0 = el.dataset.c ?? -3;
      el.innerHTML = `
        <div class="card" style="padding:22px 26px">
          <div class="ctrlrow"><label class="accent">a</label><input data-s="a" type="range" min="-3" max="3" step="0.1" value="${a0}"><span class="val" data-v="a"></span></div>
          <div class="ctrlrow"><label class="accent">b</label><input data-s="b" type="range" min="-8" max="8" step="0.5" value="${b0}"><span class="val" data-v="b"></span></div>
          <div class="ctrlrow"><label class="accent">c</label><input data-s="c" type="range" min="-8" max="8" step="0.5" value="${c0}"><span class="val" data-v="c"></span></div>
          <p class="eqlive" data-eq></p>
        </div>
        <div class="card flat" data-leitura><p class="muted"></p></div>
        <div data-plot style="margin-top:10px"></div>`;
      const get = (k) => parseFloat(el.querySelector(`[data-s="${k}"]`).value);
      const sinal = (v) => (v < 0 ? "− " + Math.abs(v) : "+ " + v);
      function atualiza() {
        const a = get("a"), b = get("b"), c = get("c");
        ["a", "b", "c"].forEach((k) => el.querySelector(`[data-v="${k}"]`).textContent = get(k).toFixed(1));
        el.querySelector("[data-eq]").innerHTML = `f(x) = ${a}x² ${sinal(b)}x ${sinal(c)}`;
        el.querySelector("[data-plot]").innerHTML = parabolaSVG({ a, b, c, annot: true, w: 560, h: 480 });
        const conc = a > 0 ? "concavidade para <b>cima</b> ∪ (mínimo)"
          : a < 0 ? "concavidade para <b>baixo</b> ∩ (máximo)" : "a = 0 → não é quadrática!";
        const disc = b * b - 4 * a * c;
        let nr;
        if (a === 0) nr = "—";
        else if (disc > 0) {
          const r1 = ((-b - Math.sqrt(disc)) / (2 * a)).toFixed(2), r2 = ((-b + Math.sqrt(disc)) / (2 * a)).toFixed(2);
          nr = `2 raízes (x = ${r1} e x = ${r2})`;
        } else if (Math.abs(disc) < 1e-9) nr = `1 raiz (x = ${(-b / (2 * a)).toFixed(2)})`;
        else nr = "sem raízes reais (Δ<0)";
        el.querySelector("[data-leitura] p").innerHTML =
          `<b>Leitura:</b> ${conc} · corta o eixo y em <b>(0, ${c})</b> · Δ = ${disc.toFixed(1)} → ${nr}.`;
      }
      el.querySelectorAll("input[type=range]").forEach((i) => i.addEventListener("input", atualiza));
      atualiza();
    });
  }

  // ---- Quiz ----
  function initQuizzes() {
    document.querySelectorAll(".quiz").forEach((quiz) => {
      const opts = [...quiz.querySelectorAll(".opt")];
      const fb = quiz.querySelector(".feedback");
      const ok = quiz.dataset.ok || "Correto! 🎉";
      const erro = quiz.dataset.erro || "Quase! Veja a alternativa correta destacada.";
      opts.forEach((btn) => btn.addEventListener("click", () => {
        opts.forEach((b) => b.classList.add("disabled"));
        const certa = btn.hasAttribute("data-correta");
        btn.classList.add(certa ? "correct" : "wrong");
        if (!certa) opts.find((b) => b.hasAttribute("data-correta"))?.classList.add("correct");
        if (fb) fb.innerHTML = certa ? `<span class="good">${ok}</span>` : `<span class="warn">${erro}</span>`;
      }));
    });
  }

  initParabolas();
  initSimuladores();
  initQuizzes();

  window.Aula = { parabolaSVG, mostra, entrarApresentacao, exportarPDF };
})();
