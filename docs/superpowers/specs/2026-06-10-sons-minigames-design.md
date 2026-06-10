# Efeitos sonoros dos minigames — Design

**Data:** 2026-06-10
**Projeto:** Herbert Edu (`C:\Dev\herbert-edu`, Firebase `herbert-edu`)
**Status:** Design aprovado no brainstorm; aguardando revisão da spec antes do plano de implementação.

## Contexto e objetivo

Os minigames (Quiz relâmpago e Sinais da Parábola) entregam feedback visual e tátil (cores, animações, vibração), mas são mudos. Som é metade da dopamina de um arcade: esta entrega adiciona **efeitos sonoros sintetizados** aos dois jogos, com controle de mudo global.

### Decisões fechadas no brainstorm

- **Síntese via Web Audio API** (osciladores + envelopes): zero arquivos, zero licença, carregamento instantâneo, e o tom do acerto pode variar com o combo. Estética retrô/8-bit limpa.
- **Kit essencial de 5 sons:** acerto, erro, combo (subida de nível), fim de jogo e recorde.
- **Módulo compartilhado** `src/lib/som.js`, plugado **nos dois motores** (sinais e quiz) nesta mesma entrega.
- **Ligado por padrão**, com botão 🔊/🔇 persistido em `localStorage` e válido para todos os jogos.

### Fora de escopo

- Sons de cartas especiais, tique-taque de tempo e sons de interface (cliques, woosh) — podem entrar depois sobre o mesmo módulo.
- Arquivos de áudio, música de fundo, controle de volume pelo usuário (só liga/desliga).

## Módulo `src/lib/som.js`

Fonte única de áudio. Não conhece os jogos: expõe eventos nomeados.

### API

```js
destravarAudio() // cria/retoma o AudioContext — chamar num gesto do usuário
tocarSom(nome, opcoes) // "acerto" | "erro" | "combo" | "fim" | "recorde"
somLigado()      // boolean — estado global
alternarSom()    // inverte e persiste; retorna o novo estado
```

### Internos

- `AudioContext` **preguiçoso e único**: criado no primeiro `destravarAudio()`; se suspenso (política de autoplay, troca de aba), retomado no próximo `destravarAudio()`/`tocarSom()`.
- `GainNode` mestre em volume discreto (~0,2) — spam de sons não distorce.
- Helper `nota(freq, quando, dur, timbre, ganho)`: agenda um oscilador com envelope (ataque curto, decaimento exponencial). Todos os sons são composições de `nota()`.
- Constantes de frequência/duração no topo do arquivo (ajuste fino fácil).

### Os 5 sons

| Nome | Receita | Observação |
|---|---|---|
| `acerto` | blip duplo curto (2 notas brilhantes, ~120ms) | recebe `{ streak }`: cada acerto seguido sobe um degrau de escala, limitado a ~10 degraus (não vira apito) |
| `erro` | buzz grave (~150Hz) com queda de pitch, ~180ms | claro sem ser punitivo |
| `combo` | arpejo maior ascendente de 3 notas, rápido | toca junto do banner "COMBO ×N!" |
| `fim` | jingle curto de resolução (3 notas) | tela final sem recorde |
| `recorde` | fanfarra: 4 notas ascendentes + acorde final | substitui o `fim` quando bate o melhor pessoal |

### Mudo global

- Chave `herbert-som` no `localStorage`: ausente ou `"1"` = ligado; `"0"` = mudo. Vale para todos os jogos do site.
- `tocarSom` é no-op quando mudo (o contexto nem é criado se o aluno nunca ligar o som).

## Integração nos motores

### `src/lib/sinais.js`

- `destravarAudio()` no clique de "Começar" (e "Jogar de novo").
- `tocarSom("acerto", { streak })` em cada acerto (inclusive sub-acertos da carta múltipla); `tocarSom("erro")` em erro e estouro de janela; `tocarSom("combo")` em `anunciarCombo`; `tocarSom(recorde ? "recorde" : "fim")` na tela final.
- Botão 🔊/🔇 no HUD da partida e na abertura.

### `src/lib/quiz.js`

- `destravarAudio()` no "Começar"/"Jogar de novo".
- `tocarSom("acerto", { streak })` no acerto; `tocarSom("erro")` no erro/tempo esgotado; `tocarSom(recorde ? "recorde" : "fim")` na tela final.
- Botão 🔊/🔇 no HUD e na abertura.

O botão é o mesmo componente visual nos dois (classe própria de cada motor, mesmo comportamento): alterna `alternarSom()` e atualiza o ícone. Não pausa nem interfere no jogo.

## Tratamento de erros e casos de borda

- **Sem `AudioContext`** (navegador antigo/bloqueado): módulo vira no-op silencioso; jogo segue normal.
- **Política de autoplay:** o contexto só nasce/resume dentro de gesto (clique em Começar/resposta). Se ainda assim estiver `suspended`, `tocarSom` tenta `resume()` e desiste sem erro.
- **`localStorage` indisponível:** estado vive só na sessão, padrão ligado.
- **Qualquer exceção** dentro do módulo é engolida (try/catch) — som nunca derruba uma partida.
- **Aba em segundo plano:** sons não são agendados às cegas (o jogo já pausa o relógio; sem ticks, sem sons).

## Como validar

- **Preview:** jogar partidas nos dois jogos conferindo no console que `tocarSom` agenda sem erros; estado do `AudioContext` (`running` após o primeiro gesto); botão de mudo alterna o ícone, persiste após recarregar e vale nos dois jogos.
- **Auditivo (Herbert):** timbre, volume e a subida de tom do combo, no computador e no celular — constantes de ajuste no topo do `som.js`.
- **Regressão:** partidas completas dos dois jogos com som mudo e ligado, console limpo.

## Resumo da entrega

1. `src/lib/som.js` (Web Audio, 5 sons, mudo global persistido).
2. Ganchos de som + botão 🔊/🔇 no `sinais.js` e no `quiz.js` (e estilos correspondentes).
3. Deploy do hosting após validação.
