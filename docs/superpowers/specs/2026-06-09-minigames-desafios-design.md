# Minigames e Desafios — Design (V1)

**Data:** 2026-06-09
**Projeto:** Herbert Edu (`C:\Dev\herbert-edu`, Firebase `herbert-edu`)
**Status:** Design aprovado no brainstorm; aguardando revisão da spec antes do plano de implementação.

## Contexto e objetivo

O site Herbert Edu publica materiais de aula para o preparatório ENEM; alunos acessam por QR code no celular, navegam por temas e abrem aulas. Esta página adiciona **minigames amarrados aos temas** do catálogo, reforçando o conteúdo das aulas de forma lúdica.

O uso final é uma **mistura de três cenários** — prática em casa, dinâmica em sala (projetada) e, mais adiante, desafios com premiação. Esta V1 entrega **os jogos primeiro, sem identidade do aluno nem ranking**: a base de jogos serve aos três cenários, e a competição/premiação (que exige identidade) entra como fase seguinte sobre a mesma base, sem retrabalho.

### Escopo da V1 (decisões fechadas)

- **Jogos amarrados aos temas** do catálogo (ex.: um jogo de Quadráticas no tema `funcoes-2grau`).
- **Motor de quiz + 1 jogo completo:** construir o motor genérico e lançar com o **Quiz relâmpago** 100% redondo, amarrado a um tema real. Os outros formatos viram extensões do mesmo motor, adicionadas depois.
- **"Claude publica direto":** perguntas são geradas como arquivo e publicadas via script (estendendo o `publicar-aula.mjs`). Sem painel admin novo.
- **Navegação:** página dedicada `/jogos` (vitrine), acessível por um botão "Jogar" no topo da home.
- **Sem identidade nesta fase:** pontuação é local (`localStorage` no aparelho do aluno). O motor expõe um gancho `aoTerminar(resultado)` que abre a porta para ranking futuro sem mudar o motor.

### Fora de escopo (V1)

- Identidade/login do aluno, ranking online, premiação real (fase posterior).
- Implementação dos formatos `vf`, `grafico`, `pareamento`, `erro` (apenas documentados como extensão do envelope).
- O jogo interativo "Acerte a parábola" (manipulação de controles; caso especial fora do motor de quiz).
- Painel admin para cadastrar/editar jogos no navegador.

## Visão geral da arquitetura

Quatro peças, todas dentro do app Vite existente, com acoplamento frouxo:

```
Home (index.html)
  └─ botão "Jogar" no topo  ──►  /jogos  (jogos.html)
                                   │  vitrine: lê coleção `jogos` do Firestore,
                                   │  agrupa por tema, mostra cards de jogo
                                   └─ clique num jogo ──►  /jogo.html?id=<slug>
                                                            player: carrega o motor
                                                            (src/lib/quiz.js) + o JSON
                                                            de perguntas (do Storage)
```

- **Botão "Jogar":** entra no topo da home, ao lado do botão de QR (mesmo padrão visual). Leva à vitrine.
- **Vitrine (`/jogos`, `jogos.html`):** página nova do app. Lê a coleção `jogos` ordenada por `ordem`, agrupa por tema (reusa a ideia de seções da home), mostra um card por jogo. Jogos "em preparação" aparecem não-clicáveis e esmaecidos, como as aulas em preparação.
- **Player (`/jogo.html?id=<slug>`):** visualizador isolado, espelha o `aula.html?id=X` existente. Lê o doc do jogo no Firestore, baixa o JSON de perguntas do Storage e entrega ao motor.
- **Motor (`src/lib/quiz.js` + `src/lib/quiz.css`):** fonte única, importado pelo player. Recebe formato + perguntas e roda a partida. Não conhece Firestore nem navegação.

**Responsabilidades isoladas:** vitrine só *lista*; player só *carrega e orquestra*; motor só *roda uma partida a partir de dados*. Cada um é testável e modificável isoladamente.

## Modelo de dados

Separação proposital: **doc leve no Firestore** (catálogo, carrega rápido na vitrine) + **JSON de perguntas no Storage** (conteúdo, só baixa quando o aluno abre o jogo).

### Coleção `jogos` (Firestore)

Irmã de `aulas`, reusando os mesmos padrões de campos:

```js
{
  titulo: "Quiz relâmpago — Quadráticas",
  descricao: "10 questões, contra o relógio",
  temaId: "funcoes-2grau",          // amarra ao tema do catálogo
  formato: "quiz",                   // quiz | vf | grafico | pareamento | erro
  ordem: 0,                          // posição dentro do tema
  estado: "publicado",               // publicado | preparacao | oculto
  publicado: true,                   // espelha estado (mesmo helper estadoDe do site)
  perguntasUrl: "https://storage.../jogos/quiz-quadraticas.json",
  perguntasPath: "jogos/quiz-quadraticas.json",
  atualizadoEm: <serverTimestamp>
}
```

Reaproveita `temaId`, `ordem`, o trio `estado`/`publicado`/`estadoDe`, e o par `perguntasUrl`/`perguntasPath` (espelhando `arquivoUrl`/`arquivoPath` das aulas). A vitrine lê por `orderBy("ordem")` e filtra publicados no cliente, igual à home — sem índice composto do Firestore.

### Envelope JSON de perguntas (Storage)

Um arquivo por jogo, com envelope comum pensado para servir os cinco formatos de quiz:

```js
{
  "formato": "quiz",
  "titulo": "Quiz relâmpago — Quadráticas",
  "tempoPorQuestao": 20,             // segundos; opcional (default: 20s se omitido)
  "questoes": [
    {
      "enunciado": "A parábola y = x² − 4x + 3 corta o eixo x em:",
      "opcoes": ["x=1 e x=3", "x=0 e x=4", "x=−1 e x=3", "não corta"],
      "correta": 0,                   // índice da opção correta
      "explicacao": "Bhaskara: raízes 1 e 3."   // mostrada no feedback (opcional)
    }
  ]
}
```

O `formato` do envelope casa com o do doc. Extensões futuras (documentadas, **não implementadas na V1**):

- **`vf`** (verdadeiro/falso): `afirmacao` + `verdadeira: true`, ou `opcoes` fixo V/F.
- **`grafico`** (qual é o gráfico): `opcoes` apontando para imagens/specs de gráfico em vez de texto.
- **`pareamento`**: troca `questoes` por `pares: [[esquerda, direita], ...]`.
- **`erro`** (caça ao erro): `passos: [...]` + `passoErrado: <índice>`.

Quando um formato novo for pedido, o motor ganha um modo; catálogo e pipeline não mudam.

## Motor de quiz (`src/lib/quiz.js` + `src/lib/quiz.css`)

Máquina de estados pequena que roda uma partida a partir do envelope JSON. Não conhece Firestore nem navegação. Interface única:

```js
iniciarQuiz({ container, dados, aoTerminar });
```

### Fluxo de uma partida

1. **Tela de abertura** — título, nº de questões, regra ("20s por questão"), botão "Começar" (evita o cronômetro disparar antes de o aluno estar pronto).
2. **Loop de questões** — para cada questão: enunciado + opções clicáveis, cronômetro circular. O aluno toca numa opção (ou o tempo zera = erra).
3. **Feedback imediato** — verde na correta, vermelho na escolhida-errada, e a `explicacao` abaixo. Botão "Próxima" (ou avança sozinho após ~2s). É o que faz o jogo *ensinar*, não só medir.
4. **Tela final** — pontuação, nº de acertos, maior sequência (streak), "seu melhor" lido do `localStorage`. Botões "Jogar de novo" e "Voltar aos jogos".

### Pontuação (local nesta fase)

- Acerto vale base + bônus por velocidade + bônus por streak (recompensa quem sabe **e** é rápido — espírito ENEM).
- O melhor resultado de cada jogo persiste em `localStorage`, com chave pelo `id` do jogo. Aluno vê progresso no próprio aparelho, sem login.
- `aoTerminar(resultado)` recebe o placar final (pontos, acertos, streak). Na fase de premiação, esse mesmo gancho envia o resultado a um ranking — **o motor não muda**.

### Identidade visual

Usa o design system do projeto: azul `#2563EB` + roxo `#7C3AED` sobre base clara, personalidade motivacional. O dourado `#F59E0B` (reservado a conquistas/desafios) é usado em acertos, streaks e na tela de pontuação. Anima o mínimo sob `prefers-reduced-motion`, como os cards de preparação da home.

### Acessibilidade e robustez

- Navegável por teclado (opções são botões reais).
- Cronômetro pausa quando a aba perde foco e retoma ao voltar (evita "perder" por trocar de app no celular).
- Tolerante a JSON parcial: questão sem `explicacao` simplesmente não mostra o texto extra.

## Pipeline de publicação

Estende `scripts/publicar-aula.mjs` com um comando novo `jogo` (tudo no mesmo script já conhecido, sem script à parte):

```bash
node scripts/publicar-aula.mjs jogo \
     --perguntas aulas/jogos/quiz-quadraticas.json \
     --titulo "Quiz relâmpago — Quadráticas" \
     --tema funcoes-2grau \
     [--descricao "..."] [--ordem 0] [--slug quiz-quadraticas] [--rascunho]
```

Paralelo direto do `cmdAula`:

1. Valida que o `--tema` existe (mesma checagem das aulas).
2. **Valida o JSON:** `JSON.parse`, confere `formato` e que `questoes` não está vazio; confere cada questão (`correta` dentro do range de `opcoes`, `opcoes` presente). Falha cedo com mensagem clara se malformado — nada sobe.
3. Sobe o JSON para o Storage em `jogos/<slug>.json` (`contentType: application/json`, público, `cacheControl` curto), igual ao upload de arquivo das aulas.
4. Grava o doc na coleção `jogos` com `ordem` automática (vai para o fim do tema se não informada) e `estado`/`publicado` espelhados.

- **Local dos JSONs no repo:** `aulas/jogos/<slug>.json`, ao lado da pasta `aulas/` existente, versionado junto.
- O comando `listar` do script passa a incluir os jogos na saída, para visão do catálogo completo.

Fluxo de autoria: o usuário descreve o jogo e o tema → Claude escreve o JSON em `aulas/jogos/<slug>.json` → roda o comando. Zero painel novo; zero deploy para publicar um jogo (deploy só para mudar o motor/site).

## Tratamento de erros e casos de borda

- **Vitrine sem jogos / Firestore falha:** mesmo padrão da home — estado vazio amigável ("Nenhum jogo publicado ainda. Em breve!") e, em erro de rede, mensagem de "tente em instantes" com `console.error`.
- **Jogo inexistente (`id` errado na URL):** player mostra "Jogo não encontrado" + link "Voltar aos jogos". Não trava.
- **JSON corrompido ou vazio:** player tenta baixar/parsear; em falha, mensagem clara + voltar. Rede defensiva, pois o script já valida na publicação.
- **Questão malformada:** capturada na publicação (jogo não sobe). No motor, questão inválida é pulada com aviso no console, sem derrubar a partida.
- **`localStorage` indisponível** (aba privada/bloqueio): pontuação funciona na sessão; só não persiste o "seu melhor". Envolto em try/catch silencioso.
- **Aba perde foco no meio da partida:** cronômetro pausa e retoma ao voltar.
- **`prefers-reduced-motion`:** anima o mínimo, como os cards de preparação já respeitam.

## Como validar

Projeto é Vite + Firebase, sem suíte de testes hoje; validação pragmática em camadas:

- **Motor isolado:** `quiz.js` é função de dados — abrir o player com um JSON de exemplo local e jogar uma partida inteira, verificando cronômetro, pontuação, streak, feedback, tela final e persistência do "seu melhor".
- **Pipeline:** rodar o comando `jogo` com um JSON válido e um inválido — confirmar que o válido publica (doc no Firestore + arquivo no Storage) e o inválido falha com mensagem clara, sem subir nada.
- **Integração no preview:** subir o dev server, percorrer home → "Jogar" → vitrine → jogo, com console/network limpos; testar responsivo (uso principal: celular via QR).
- **Caso real:** publicar de fato o "Quiz relâmpago — Quadráticas" no tema `funcoes-2grau`, com questões reais, e jogar no site.

## Resumo da entrega V1

1. Coleção `jogos` no Firestore + envelope JSON de perguntas no Storage.
2. Motor `src/lib/quiz.js` + `src/lib/quiz.css` (formato `quiz`, com gancho `aoTerminar` para ranking futuro).
3. Vitrine `/jogos` (`jogos.html`) + player `/jogo.html?id=` no app; botão "Jogar" na home.
4. Comando `jogo` no `publicar-aula.mjs` + JSONs em `aulas/jogos/`.
5. Entrega validada com o "Quiz relâmpago — Quadráticas" real no tema `funcoes-2grau`.

## Caminho para a fase seguinte (premiação)

Sem trabalho jogado fora: a página dedicada `/jogos` ganha palco para "desafio da semana" e ranking; o gancho `aoTerminar(resultado)` passa a enviar o placar a uma coleção de ranking quando houver identidade do aluno; o motor e o pipeline permanecem como estão.
