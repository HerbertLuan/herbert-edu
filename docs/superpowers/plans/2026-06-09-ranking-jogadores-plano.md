# Plano de implementação — Ranking de minigames + login simples

**Spec:** [2026-06-09-ranking-jogadores-design.md](../specs/2026-06-09-ranking-jogadores-design.md)
**Branch:** `minigame`

Ordem pensada pra cada fase ser verificável por conta própria. Começa pela
fundação sem UI (módulo + regras), depois pluga nas telas.

---

## Fase 1 — Módulo de identidade `src/lib/jogadores.js`

Fonte única: hash, sessão, leitura/escrita do doc e ranking. Sem DOM.

**Implementar**

1. Imports do Firestore: `doc, getDoc, setDoc, updateDoc, collection, query,
   orderBy, limit, getDocs, where, getCountFromServer, serverTimestamp`. E `db`
   do `./firebase.js` (caminho relativo `../firebase.js`).
2. Helpers internos:
   - `slugificar(nome)` → `trim` → `toLowerCase` → colapsa espaços → troca por
     `-`. Retorna `""` se vazio.
   - `validarNome(nome)` → `{ ok, motivo }`; exige 2–24 caracteres visíveis após
     trim.
   - `gerarSalt()` → `crypto.getRandomValues(Uint8Array(16))` em hex.
   - `hash(salt, senha)` → `crypto.subtle.digest("SHA-256", utf8(salt+senha))`
     em hex.
3. Sessão (localStorage, chave `herbert-jogador`):
   - `sessaoAtual()` → `{ slug, nome } | null` (try/catch, JSON.parse).
   - `salvarSessao({slug,nome})`, `sair()`.
4. Identidade:
   - `existeJogador(nome)` → `getDoc` do slug → `.exists()`.
   - `cadastrar(nome, senha)` → valida nome; gera salt + hash; `setDoc` com
     `{ nome, senhaHash, salt, melhores:{}, total:0, criadoEm, atualizadoEm }`
     usando `serverTimestamp()`; salva sessão; retorna `{slug,nome}`. Lança erro
     claro se já existe (checar antes) ou nome inválido.
   - `entrar(nome, senha)` → lê doc; se não existe, erro "não encontrado"; senão
     recomputa `hash(salt, senha)` e compara com `senhaHash`; bateu → salva
     sessão, retorna `{slug,nome}`; senão lança erro "senha incorreta".
5. Pontuação:
   - `registrarPontuacao(jogoId, pontos)` → lê `sessaoAtual()`; sem sessão →
     retorna `{ atualizou:false }`. Lê o doc; se `pontos > (melhores[jogoId]||0)`
     → `melhores[jogoId]=pontos`, `total=soma(melhores)`,
     `updateDoc({ melhores, total, atualizadoEm: serverTimestamp() })` e retorna
     `{ atualizou:true, total }`; senão no-op.
6. Ranking:
   - `topRanking(lim=12)` → `getDocs(query(collection, orderBy('total','desc'),
     limit(lim)))` → array `[{ slug, nome, total }]`.
   - `posicaoDe(total)` → `getCountFromServer(query(collection, where('total','>',
     total)))` → `.data().count + 1`.

**Verificar (sem UI ainda):** `npm run dev`, abrir `jogos.html`, no console do
navegador importar/colar chamadas manuais não é trivial com módulos —
verificação real desta fase acontece na Fase 4 (login) e Fase 5 (ranking). Por
ora: `npm run build` deve passar sem erro de import/sintaxe.

---

## Fase 2 — Regras do Firestore (`firestore.rules`)

Adicionar bloco `jogadores` antes do catch-all `match /{document=**}`.

```
match /jogadores/{slug} {
  allow read: if true;

  allow create: if request.resource.data.nome is string
    && request.resource.data.nome.size() > 0
    && request.resource.data.senhaHash is string
    && request.resource.data.salt is string
    && request.resource.data.melhores is map
    && request.resource.data.total is number
    && request.resource.data.total >= 0;

  allow update: if request.resource.data.senhaHash == resource.data.senhaHash
    && request.resource.data.salt == resource.data.salt
    && request.resource.data.nome == resource.data.nome
    && request.resource.data.melhores is map
    && request.resource.data.total is number
    && request.resource.data.total >= 0;
}
```

Sem `delete`. **Verificar:** `firebase deploy --only firestore:rules` (ou testar
no emulador, se houver). Confirmar que cadastro/atualização passam e que tentar
trocar `senhaHash` num update é negado. *Nota: o deploy depende de credenciais —
se não houver acesso, deixar pronto e sinalizar ao Herbert pra ele dar deploy.*

---

## Fase 3 — Containers na `jogos.html`

Dentro de `.wrap`, antes do `#catalogo`, adicionar:

```html
<div id="login-jogador"></div>
<div id="ranking"></div>
```

O `#catalogo` continua igual, embaixo. **Verificar:** página carrega sem erro;
os dois divs existem (vazios por enquanto).

---

## Fase 4 — Card de login (`src/jogos.js` + estilos)

Controlador de login que renderiza em `#login-jogador` usando `jogadores.js`.

**Implementar**

1. Importar de `./lib/jogadores.js`: `sessaoAtual, sair, existeJogador,
   cadastrar, entrar`.
2. `renderLogin()` decide o estado:
   - **Logado** (`sessaoAtual()`): chip "👋 Olá, {nome}" + botão "sair"
     (`sair()` → re-render → `renderRanking()`).
   - **Deslogado, passo nome:** input nome + "Continuar".
   - **Passo senha:** depende de `existeJogador` — mostra "criar senha"
     (cadastrar) ou "senha" (entrar), com o nome fixado e link "trocar nome".
3. Fluxo: "Continuar" → valida nome → `existeJogador` → muda pro passo senha
   certo. Submit → `cadastrar`/`entrar` → sucesso re-render logado +
   `renderRanking()` (pra destacar/atualizar); erro → mensagem inline.
4. Estados de carregando nos botões (desabilita enquanto aguarda a rede).

**Estilos em `src/estilo.css`:** card `.login-card` na paleta do site, inputs
bonitos, chip de logado, mensagem de erro. Reaproveitar tokens já existentes.

**Verificar (preview):** cadastrar um nome novo → vira logado; recarregar →
continua logado; sair → volta ao input; entrar de novo com senha certa → ok;
senha errada → mensagem inline; nome já existente → pede senha (não cria
duplicado). Conferir no Firestore que o doc nasceu com hash/salt, sem senha em
texto.

---

## Fase 5 — Ranking pódio + lista (`src/jogos.js` + estilos)

`renderRanking()` em `#ranking`, chamado no carregar e após login/logout.

**Implementar**

1. Importar `topRanking, posicaoDe, sessaoAtual`.
2. `topRanking(12)`:
   - vazio → estado amigável ("Seja o primeiro a pontuar!").
   - senão → **pódio** (top 3: ouro/prata/bronze, nome + total) + **lista** (4º+
     numerada). Realçar a linha do `sessaoAtual().slug` se presente.
3. Se há sessão e o slug **não** está no top 12 → `posicaoDe(total do aluno)` e
   render de "Sua posição: Nº · {total} pts" abaixo da lista. (Obter o total do
   aluno: ler do doc ou guardar no retorno do login; simplest: pequena leitura
   do doc do aluno, ou reaproveitar `registrarPontuacao`/`getDoc`.)
4. `escapar()` em todo nome exibido (já existe helper na `jogos.js`).

**Estilos em `src/estilo.css`:** `.ranking`, `.podio` (3 colunas com alturas
diferentes, medalhas), `.rank-lista`, linha realçada `.rank-eu`, `.rank-posicao`.
Dourado pra 1º, coerente com o quiz.

**Verificar (preview):** com 1, 3 e 5+ jogadores fictícios, o pódio e a lista
desenham certo; a linha do logado fica realçada; criar um jogador com total alto
e outro logado com total baixo → conferir "Sua posição: Nº". Responsivo no mobile
(`preview_resize`).

---

## Fase 6 — Pontuação real no jogo (`src/jogo.js`)

Plugar o ranking no fim da partida.

**Implementar**

1. Importar `registrarPontuacao` de `./lib/jogadores.js`.
2. No `iniciarQuiz({ ... aoTerminar })`, trocar o `console.debug` por:
   `aoTerminar: (r) => registrarPontuacao(r.jogoId, r.pontos)`. Tratar a promise
   com `.catch(console.error)` — falha de rede não pode quebrar a tela final.
3. Jogar deslogado continua válido (no-op).

**Verificar (preview):** logado, jogar e bater um recorde → o doc do aluno
atualiza `melhores[jogoId]` e `total`; voltar pra `jogos.html` → ranking reflete.
Deslogado → joga normal, nada sobe.

---

## Fase 7 — Verificação ponta a ponta + commit

1. Fluxo completo num navegador limpo: cadastra → joga 2 jogos → soma aparece no
   ranking → outro aluno → posições corretas → fora do top mostra a posição.
2. `npm run build` limpo.
3. Conferir nada de senha em texto puro em lugar nenhum (Firestore + network).
4. Commit por fase ou um commit coeso ao final, na branch `minigame`. Lembrar do
   deploy das regras (`firestore.rules`) se ainda não foi.

---

## Riscos / pontos de atenção

- **Deploy das regras** pode depender de credenciais do Herbert — sinalizar.
- **`posicaoDe` com empates:** `where total > X` conta quem está estritamente
  acima; jogadores com o mesmo total dividem faixa de posição. Aceitável; se
  incomodar, desempatar depois por `atualizadoEm`.
- **Corrida no cadastro:** dois cadastros simultâneos do mesmo nome — improvável
  no contexto; o `create` das regras barra o segundo (doc já existe).
- **Total do aluno fora do top** precisa de uma leitura extra do doc dele;
  manter simples (um `getDoc`).
