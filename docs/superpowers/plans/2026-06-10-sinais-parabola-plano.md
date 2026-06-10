# Plano de implementação — Minigame "Sinais da Parábola"

**Spec:** [2026-06-10-sinais-parabola-design.md](../specs/2026-06-10-sinais-parabola-design.md)
**Branch:** `minigame`

Ordem pensada pra cada fase ser jogável/verificável por conta própria: primeiro
a matemática pura (geração + desenho), depois o esqueleto do jogo com botões,
depois o arrasto, e só então as camadas de intensidade (combo, especiais,
dopamina). Pipeline e publicação real fecham.

---

## Fase 1 — Geração procedural + desenho SVG (`src/lib/sinais.js`, parte pura)

Funções puras, sem DOM nem estado de jogo. São a fundação de tudo.

**Implementar**

1. **Janela fixa do gráfico:** viewBox lógico x ∈ [−6, 6], y ∈ [−6, 6];
   helper `mapear(x, y)` → coordenadas SVG.
2. **Amostragem por forma de vértice** (controla o enquadramento direto):
   sorteia `a`, `xv`, `yv` e deriva `b = −2a·xv`, `c = yv + a·xv²`. Faixas:
   `|a| ∈ [0.3, 1.2]`, `|xv| ≤ 3.5`, `|yv| ≤ 4`.
3. **`gerarCoeficientes(alvos)`** — recebe os alvos que a carta vai pedir e
   re-sorteia (rejection sampling, máx. ~40 tentativas) até todos os limiares
   de clareza valerem; no esgotamento, cai num caso padrão seguro fixo:
   - sempre: `|a| ≥ 0.3`, `|c| ≥ 0.4`, `Δ` longe de 0 (`|yv| ≥ 0.8`);
   - alvo `c`: `|c| ≥ 1.5` (corte do eixo y bem visível);
   - alvo `b`: `|xv| ≥ 1.5` (vértice claramente de um lado);
   - alvo `Δ`: Δ>0 ⇒ raízes separadas ≥ 2 e dentro da janela;
     Δ<0 ⇒ `|yv| ≥ 1` com concavidade afastando do eixo x.
   - interceptação do eixo y e vértice sempre dentro da janela.
4. **Balanceamento:** módulo guarda as últimas respostas sorteadas; após 3
   iguais seguidas, força o sinal contrário no próximo sorteio (o aluno não
   "surfa" arrastando sempre pro mesmo lado).
5. **`desenharParabola({ curvas })`** → string SVG com eixos x/y discretos e
   1–2 curvas (cada uma com `a,b,c`, cor e `tracejada?`). Curva como `<path>`
   amostrado em ~40 pontos, `stroke` grosso, sem números nos eixos (sinal não
   depende de escala).
6. **`gerarCarta({ nivel, tipo })`** → `{ alvos, coefs, svg, respostas }`,
   onde `respostas[alvo] ∈ {+1, −1}` (gabarito calculado dos coeficientes).
   Tipos: `normal`, `multipla` (2–3 alvos), `dupla` (2 curvas + qual curva),
   `espelho`, `relampago` — nesta fase basta `normal` e `multipla`; os
   especiais ganham corpo na Fase 5, mas a assinatura já prevê.

**Verificar:** `npm run build` limpo. No preview, console do navegador:
`const m = await import("/src/lib/sinais.js")` e inspecionar
`m.gerarCarta(...)` algumas vezes — gabaritos corretos (conferir contra os
coeficientes), nenhum coeficiente abaixo do limiar; injetar uns 8 SVGs no
`#palco` e olhar: sinais inequívocos a olho nu.

---

## Fase 2 — Esqueleto do motor + integração no player

Jogo completo jogável **só com botões − / +** (sem drag ainda).

**Implementar**

1. **`iniciarSinais({ container, dados, jogoId, aoTerminar })`** em
   `src/lib/sinais.js`, com `import "./sinais.css"` no topo (Vite resolve;
   não mexer no `<link>` do `jogo.html`).
2. **Telas:** abertura (título, regras: "← negativo · positivo →", 45s,
   combo; "seu melhor" — mesma chave `herbert-jogo-melhor:<id>` do quiz) →
   partida → final.
3. **Partida (V0):** relógio de 45s (`dados.duracao` opcional) descendo em
   ticks de 100ms, **pausa quando a aba perde foco** (padrão do quiz);
   carta `normal` com alvo só `a`/`Δ` por enquanto; responder por botões
   "− negativo" / "positivo +" e teclado ← →; acerto +10, erro −3s e
   **toast-relâmpago pedagógico** (frase por alvo, ex.: "c era negativo: a
   parábola corta o eixo y abaixo da origem"), some sozinho (~1,6s) e a
   próxima carta entra na hora.
4. **HUD:** relógio (barra ou anel), pontos, medidor de combo (estático ×1
   por enquanto).
5. **Tela final:** pontos, acertos/erros, maior streak, recorde local
   (ler/gravar com try/catch), acurácia por alvo (contadores por a/b/c/Δ),
   botões "Jogar de novo" / "Voltar aos jogos".
   `aoTerminar({ jogoId, pontos, acertos, erros, maiorStreak, acuraciaPorAlvo, recorde })`
   — `registrarPontuacao` do `jogo.js` já usa só `jogoId` e `pontos`.
6. **Player (`src/jogo.js`):** escolher o motor pelo `formato` do envelope:
   `quiz` → `iniciarQuiz`, `sinais` → `iniciarSinais`, desconhecido → estado
   de erro amigável. O callback `aoTerminar` atual serve aos dois.
7. **Modo demo dev-only:** em `jogo.js`, se `import.meta.env.DEV` e
   `?demo=sinais`, pular Firestore e iniciar com um envelope local fixo
   (`{ formato: "sinais", titulo: "Sinais da Parábola (demo)" }`). Código
   morto no build de produção; permite jogar antes de publicar.

**Verificar (preview):** `jogo.html?demo=sinais` → partida inteira com
botões e teclado: relógio desce, erro tira 3s e mostra o toast, partida acaba
em ≤45s, tela final certa, "jogar de novo" zera tudo, melhor local persiste.
Trocar de aba pausa o relógio. `jogo.html?id=quiz-quadraticas` continua
funcionando (regressão).

---

## Fase 3 — Arrasto da carta (gesto principal)

**Implementar**

1. **Pointer events** na carta (`setPointerCapture`): acompanha o dedo com
   `translate` + leve rotação (~dx/20 graus); `touch-action: none` na carta
   (página não rola durante o gesto, e o gesto não briga com o scroll).
2. **Limiar:** soltou além de ~35% da largura → resposta (esquerda −,
   direita +) e a carta voa pra fora com rastro; aquém → anima de volta ao
   centro sem responder. `pointercancel` = volta ao centro.
3. **Affordance:** rótulos "− negativo" / "positivo +" nas laterais ganham
   destaque progressivo conforme a carta se aproxima do lado (cor esquenta).
4. Botões e teclado continuam valendo (acessibilidade e sala projetada).

**Verificar (preview):** `preview_resize` para viewport de celular; arrastar
com o mouse (pointer events cobrem touch): responder pros dois lados, soltar
no meio volta ao centro, arrasto não rola a página, rótulos laterais reagem.
Teclado e botões seguem funcionando.

---

## Fase 4 — Escada de combo, janela por carta e cartas múltiplas

**Implementar**

1. **Níveis por streak** (constantes no topo do motor):
   0–2 ×1 (alvos a, Δ) · 3–5 ×2 (+c) · 6–9 ×3 (+b, janela ~3s) ·
   10+ ×4 (janela ~2s, cartas múltiplas). Erro → nível 1.
2. **Pontuação** `10 × multiplicador`; subir de nível → banner "COMBO ×N!" e
   onda de cor.
3. **Janela por carta (níveis 3–4):** barra encolhendo na carta; estouro =
   erro normal (−3s, zera combo, toast "tempo!"). Sem janela nos níveis 1–2.
4. **Cartas múltiplas (turbo):** mesma carta/gráfico pede 2–3 alvos em
   sequência (chips de alvo com o atual destacado); cada sinal conta como
   acerto/erro normal; janela renova por alvo; errar derruba o combo e a
   próxima carta volta a ser simples.
5. **Medidor de combo no HUD** vivo: nível, multiplicador, progresso pro
   próximo nível.

**Verificar (preview):** acertar em sequência e ver: alvos novos entrando
(c no ×2, b no ×3), janela aparecendo no ×3 e apertando no ×4, carta múltipla
no turbo; deixar a janela estourar (conta erro); errar de propósito derruba
pro ×1. Pontos batem com `10 × multiplicador`.

---

## Fase 5 — Cartas especiais (distratores)

**Implementar**

1. **Sorteio:** nível ≥ 3 → ~1 a cada 4 cartas é especial; pesos: espelho e
   dupla mais comuns, relâmpago rara (ex.: 40/40/20 dentro das especiais).
   Especiais são sempre de alvo único; nunca combinam com carta múltipla.
2. **🔄 Espelho:** lados invertidos (negativo = DIREITA). Entra com giro
   horizontal, banner "MODO ESPELHO", moldura roxa vibrante, rótulos −/+
   trocados de lugar e piscando. A *resposta* é avaliada com o mapeamento
   invertido — gabarito não muda, o gesto sim.
3. **〰️ Dupla:** `desenharParabola` com 2 curvas (sólida colorida vs.
   tracejada em outra cor, bem afastadas — Fase 1 já prevê); alvo cita a
   curva ("sinal de a da **tracejada**"); badge "DUPLA", moldura bicolor.
4. **⚡ Relâmpago:** pontos em dobro (`2 × 10 × mult`), expira em ~1,5s com
   barra dourada encolhendo; carta dourada `#F59E0B`, brilho pulsante, raio.
   Estouro = erro normal.
5. **Toasts pedagógicos** das especiais: espelho errado lembra "era modo
   espelho!"; dupla errada cita a curva certa.

**Verificar (preview):** baixar temporariamente o limiar de nível (constante)
pra forçar especiais cedo; conferir os três visuais inconfundíveis, espelho
avaliando invertido (botões, teclado E arrasto), dupla com a curva certa no
gabarito, relâmpago dobrando pontos e expirando. Restaurar a constante.

---

## Fase 6 — Dopamina, acessibilidade e polimento

**Implementar**

1. **Fundo vivo:** gradiente do palco esquenta por nível — azul `#2563EB` →
   roxo `#7C3AED` → laranja → dourado `#F59E0B` (transição suave por classe
   `nivel-N` no container).
2. **Acerto:** pulso verde, número flutuante "+N" subindo da carta,
   `navigator.vibrate?.(30)` em try/catch.
3. **Erro:** flash vermelho nas bordas do palco + shake da carta.
4. **Tela final:** contagem animada do placar (requestAnimationFrame),
   selo "🏆 Novo recorde!", barras de acurácia por alvo.
5. **`prefers-reduced-motion`:** sem voos/shake/giro/brilho pulsante/contagem
   /vibração; molduras, banners, badges e cores de certo/errado ficam
   (identidade visual não depende de animação). Media query no CSS + checagem
   única no JS pra vibração e animações imperativas.
6. **Passada de revisão:** nomes, tamanhos de função, CSS órfão, console
   limpo.

**Verificar (preview):** partida inteira "bonita": fundo esquentando,
+N flutuando, banner de combo, final animado. Emular reduced-motion
(`preview_eval` com `matchMedia` não dá — usar DevTools rendering ou checar
via classe forçada) e confirmar jogo 100% funcional sem animações. Console e
network limpos nas duas condições.

---

## Fase 7 — Pipeline, publicação real e ponta a ponta

**Implementar**

1. **`validarJogo` (`scripts/publicar-aula.mjs`):** adicionar `"sinais"` aos
   `formatosOk` e ramificar: `sinais` exige `titulo` string e, se presentes,
   `duracao` inteiro > 0; `questoes` presente → só aviso no console
   (ignorado). Validação do `quiz` intocada.
2. **Envelope real:** `aulas/jogos/sinais-parabola.json` →
   `{ "formato": "sinais", "titulo": "Sinais da Parábola", "duracao": 45 }`.
3. **Publicar:**
   `node scripts/publicar-aula.mjs jogo --perguntas aulas/jogos/sinais-parabola.json --titulo "Sinais da Parábola" --tema funcoes-2grau --descricao "Arrasta pra lá ou pra cá: classifique a, b, c e Δ contra o relógio"`.
4. **Deploy do site** (motor novo entra no bundle): `npm run build` +
   `firebase deploy --only hosting` (ou o fluxo de deploy do projeto).

**Verificar:** publicar com um envelope inválido (`duracao: "x"`) → falha
clara, nada sobe. Válido → doc na coleção `jogos` + JSON no Storage;
`listar` mostra o jogo. No site real (celular de verdade se possível):
home → Jogar → vitrine mostra o card → partida completa por arrasto →
placar sobe pro ranking quando logado → "seu melhor" persiste. Quiz antigo
continua publicável e jogável. Commits por fase na branch `minigame`.

---

## Riscos / pontos de atenção

- **Clareza do alvo b** é o ponto pedagógico mais frágil (leitura indireta:
  lado do vértice + concavidade). Limiar `|xv| ≥ 1.5` deve bastar; se na
  prática confundir, subir o limiar ou adiar b pro nível 4.
- **Arrasto vs. scroll no celular:** `touch-action: none` na carta resolve o
  conflito, mas testar em aparelho real na Fase 7 (emulação de pointer não
  cobre tudo).
- **Janela por carta + tick do relógio:** dois cronômetros simultâneos
  (global e da carta) — manter um único `setInterval` que decrementa ambos,
  senão a pausa por visibilidade fica inconsistente.
- **Vibração:** iOS não suporta `navigator.vibrate` — optional chaining +
  try/catch e seguir em frente.
- **Balanceamento de respostas** com cartas múltiplas/duplas: a regra "3
  iguais força troca" olha a sequência *de respostas pedidas*, incluindo as
  dos alvos múltiplos — manter o histórico no gerador, não na carta.
- **Deploy** (hosting + Storage/Firestore do jogo novo) depende de
  credenciais do Herbert — sinalizar se faltar acesso.
