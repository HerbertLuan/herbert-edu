# Minigame "Sinais da Parábola" — Design

**Data:** 2026-06-10
**Projeto:** Herbert Edu (`C:\Dev\herbert-edu`, Firebase `herbert-edu`)
**Status:** Design aprovado no brainstorm; aguardando revisão da spec antes do plano de implementação.

## Contexto e objetivo

Segundo minigame do catálogo, no tema `funcoes-2grau`. Jogo arcade **contra o tempo** em que o aluno classifica, olhando só para o gráfico de uma função quadrática, o **sinal (positivo ou negativo)** dos coeficientes **a**, **b**, **c** e do **discriminante Δ** — arrastando a carta para a **esquerda se negativo** e para a **direita se positivo**.

Treina a leitura visual que o ENEM cobra: concavidade (a), interceptação do eixo y (c), posição/inclinação do vértice (b) e número de raízes (Δ) — em ritmo de arcade, com feedback sensorial imediato ("cores dopaminérgicas").

### Decisões fechadas no brainstorm

- **Um alvo por carta no início**, escalando: quanto mais o aluno acerta em sequência (combo), mais o jogo intensifica e pede mais sinais por gráfico.
- **Gráficos gerados proceduralmente** no cliente (SVG); nenhum acervo autorado.
- **Relógio vivo:** a partida começa com um tempo total; **erros descontam segundos** e **marcos de combo devolvem segundos**.
- **Sem morte:** erro penaliza (tempo + zera combo) mas a partida segue até o relógio zerar.
- Entra como **novo formato `sinais`** na arquitetura existente de minigames (vitrine → player → motor por formato), reusando catálogo, pipeline e ranking.

### Fora de escopo

- Δ = 0 e coeficientes nulos (o jogo é binário: positivo ou negativo; casos-limite nunca são gerados).
- Modos multiplayer/versus, níveis selecionáveis pelo aluno, sons (pode entrar depois; V1 é visual + vibração).
- Mudanças no motor de quiz, na vitrine ou no ranking — todos são reusados como estão.

## Loop de jogo

1. **Abertura:** título, regras curtas (arraste ← negativo / positivo →, relógio, combo), "seu melhor" do `localStorage`, botão "Começar".
2. **Partida:** uma carta central mostra a parábola (SVG com eixos) e um **alvo destacado** ("qual o sinal de **a**?"). O aluno arrasta a carta — ela acompanha o dedo com leve rotação (estilo Tinder) e, passado o limiar, voa para o lado escolhido; abaixo do limiar, volta ao centro. Alternativas de entrada: **botões "− negativo" / "positivo +"** na base e **setas ← →** no teclado (sala projetada).
3. **Resolução:** acerto soma pontos e sobe o combo; erro desconta tempo, zera o combo e mostra um toast-relâmpago que ensina a leitura correta. Próxima carta entra na hora.
4. **Fim:** relógio zera → tela final com placar animado, recorde, acurácia por alvo e ações (jogar de novo / voltar aos jogos).

### Relógio

- Duração inicial: **60s** (configurável via envelope, campo `duracao`).
- **Erro: −3s.** **Subir de nível de combo: +2s.** O mostrador reage (flash vermelho no desconto, pulso dourado no bônus).
- Pausa quando a aba perde foco e retoma ao voltar (mesmo padrão do quiz).

### Escada de combo (intensidade)

A sequência de acertos (streak) sobe um medidor com 4 níveis; errar derruba para o nível 1:

| Nível | Streak | Multiplicador | Alvos no sorteio | Extra |
|---|---|---|---|---|
| 1 · Aquecendo | 0–2 | ×1 | a, Δ | — |
| 2 · Pegando fogo | 3–5 | ×2 | a, Δ, c | — |
| 3 · Em chamas | 6–9 | ×3 | a, Δ, c, b | — |
| 4 · Modo turbo | 10+ | ×4 | todos | **cartas múltiplas:** o mesmo gráfico permanece e pede 2–3 sinais em sequência (um arrasto por sinal) |

- **Pontuação:** acerto vale `10 × multiplicador`. Sem bônus de velocidade individual — a pressão de velocidade já vem do relógio global (mais cartas por minuto = mais pontos).
- Ao subir de nível: banner "COMBO ×N!", +2s, explosão de cor.
- No modo turbo, cada sinal da carta múltipla conta como um acerto/erro normal (alimenta streak e relógio); errar um sinal derruba o combo e a carta seguinte volta a ser simples.

## Geração procedural (regras de clareza)

O motor sorteia **o alvo primeiro** e depois coeficientes que tornam aquele sinal **inequívoco no desenho**. Princípios:

- **Nunca zero, nunca ambíguo:** todo coeficiente sorteado respeita um módulo mínimo que o torna legível no gráfico.
- **a:** |a| dentro de faixa que produz curvatura claramente visível no viewport (nem reta demais, nem agulha).
- **c:** a parábola corta o eixo y claramente acima ou abaixo da origem (|c| ≥ limiar em unidades do gráfico).
- **b:** o vértice fica claramente deslocado para um dos lados do eixo y (|x_v| ≥ limiar), para a leitura "inclinação na origem / lado do vértice" funcionar. (Lembrete pedagógico: sinal de b = oposto do sinal de a·x_v.)
- **Δ:** ou duas raízes bem separadas e visíveis (Δ > 0), ou a parábola claramente afastada do eixo x (Δ < 0). **Δ = 0 nunca é gerado.**
- **Enquadramento:** vértice e interceptação do eixo y sempre dentro do quadro; a janela do gráfico é fixa e os coeficientes se adaptam a ela (não o contrário).
- **Balanceamento:** os sinais sorteados alternam de forma equilibrada (sem longas sequências da mesma resposta, para o aluno não "surfar" arrastando sempre pro mesmo lado).
- Nas **cartas múltiplas** do modo turbo, o mesmo gráfico precisa ter todos os sinais pedidos legíveis — a geração valida os limiares de todos os alvos da carta.

O desenho é uma função interna `desenharParabola(a, b, c)` que devolve SVG (eixos + curva), sem imagens nem dependências externas.

## Feedback sensorial ("dopamina")

- **Acerto:** a carta voa com rastro na direção do arrasto; pulso verde; número flutuante "+N"; vibração curta no celular (`navigator.vibrate`, envolto em try/catch).
- **Erro:** flash vermelho na borda da tela; shake da carta; **toast-relâmpago pedagógico** com a resposta certa e o porquê em uma linha (ex.: "c era **negativo**: a parábola corta o eixo y abaixo da origem"). O toast não bloqueia — some sozinho, a próxima carta já entra.
- **Fundo vivo:** gradiente de fundo esquenta com o nível de combo — azul `#2563EB` → roxo `#7C3AED` → laranja → dourado `#F59E0B` (paleta do design system; dourado reservado a conquista, usado no auge do combo).
- **Tela final:** placar com contagem animada, selo de recorde quando bate o melhor local, e **acurácia por alvo** (a / b / c / Δ) para o aluno ver onde tropeça.
- **`prefers-reduced-motion`:** remove voos, shakes, contagens animadas e vibração; mantém apenas as cores de certo/errado e o toast.

## Arquitetura e integração

Tudo se encaixa na arquitetura existente de minigames; **nenhuma peça atual muda de responsabilidade**:

- **Motor novo:** `src/lib/sinais.js` + `src/lib/sinais.css`. Interface espelho do quiz:
  `iniciarSinais({ container, dados, jogoId, aoTerminar })` — não conhece Firestore nem navegação.
- **Player (`src/jogo.js`):** passa a escolher o motor pelo `formato` do envelope: `quiz` → `iniciarQuiz`, `sinais` → `iniciarSinais`; formato desconhecido → mensagem de erro amigável.
- **Envelope JSON (Storage):** para `sinais` é só configuração — sem `questoes`:

  ```json
  { "formato": "sinais", "titulo": "Sinais da Parábola", "duracao": 60 }
  ```

  `duracao` é opcional (default 60s). Campos de ajuste fino (penalidade, bônus, limiares de combo) ficam como constantes no motor na V1 — só viram config se houver necessidade real.
- **Catálogo (Firestore `jogos`):** doc igual ao do quiz, com `formato: "sinais"`; a vitrine não muda.
- **Pipeline (`scripts/publicar-aula.mjs jogo`):** a validação do JSON passa a ramificar por formato — `quiz` exige `questoes` válidas (como hoje); `sinais` exige apenas o envelope mínimo (`formato`, `titulo`) e **não** exige `questoes` — se vier, é ignorado com um aviso. Mensagens de erro claras por formato.
- **Ranking:** zero mudança — o gancho `aoTerminar(resultado)` já chama `registrarPontuacao(jogoId, pontos)`. O `resultado` do sinais traz `{ jogoId, pontos, acertos, erros, maiorStreak, acuraciaPorAlvo, recorde }`.
- **"Seu melhor"** local em `localStorage`, mesma convenção de chave do quiz (`herbert-jogo-melhor:<id>`).

## Tratamento de erros e casos de borda

- **Envelope com formato desconhecido ou corrompido:** player mostra mensagem amigável + voltar (rede defensiva; o pipeline já valida na publicação).
- **`localStorage` indisponível:** placar funciona na sessão; "seu melhor" só não persiste (try/catch silencioso, como no quiz).
- **Aba perde foco:** relógio pausa e retoma.
- **`navigator.vibrate` ausente** (iOS/desktop): ignorado silenciosamente.
- **Arrasto interrompido** (dedo sai da tela, scroll acidental): carta volta ao centro sem responder; `touch-action` configurado para o arrasto não brigar com o scroll da página.
- **Telas estreitas:** carta e botões dimensionados mobile-first (uso principal: celular via QR); botões − / + garantem jogabilidade mesmo se o arrasto falhar.
- **Geração:** se o sorteio não achar coeficientes válidos em N tentativas (não deve ocorrer com faixas bem definidas), relaxa para um caso padrão seguro em vez de travar.

## Como validar

- **Motor isolado:** jogar partidas inteiras no preview (dev server): arrasto no mobile (resize), botões e teclado, escada de combo (subida, queda, modo turbo), relógio (−3s/+2s, pausa por foco), toast pedagógico, tela final e persistência do melhor. Console e network limpos.
- **Clareza dos gráficos:** inspecionar visualmente uma amostra de cartas geradas de cada alvo/nível confirmando que o sinal pedido é inequívoco.
- **Acessibilidade:** `prefers-reduced-motion` ativado, navegação por teclado.
- **Pipeline:** publicar com envelope válido e inválido; confirmar que o inválido falha com mensagem clara e o quiz continua publicando como antes.
- **Caso real:** publicar "Sinais da Parábola" no tema `funcoes-2grau` e jogar no site, conferindo o placar no ranking.

## Resumo da entrega

1. Motor `src/lib/sinais.js` + `src/lib/sinais.css` (formato `sinais`, procedural, arcade).
2. Seleção de motor por formato no `src/jogo.js`.
3. Validação por formato no comando `jogo` do `publicar-aula.mjs`.
4. Envelope `aulas/jogos/sinais-parabola.json` + publicação real no tema `funcoes-2grau`.
