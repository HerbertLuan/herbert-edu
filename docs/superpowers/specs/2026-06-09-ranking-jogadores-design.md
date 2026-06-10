# Ranking de minigames + login simples — design

**Data:** 2026-06-09
**Contexto:** O primeiro minigame já existe. O motor de quiz (`src/lib/quiz.js`)
já expõe o gancho `aoTerminar(resultado)` com `{ jogoId, pontos, acertos, total,
maiorStreak, recorde }`, deixado de propósito para o ranking. Hoje o "melhor" de
cada jogo vive só no `localStorage`. Este spec adiciona identidade de aluno
(login nome+senha, sem servidor) e um ranking geral na `jogos.html`.

## Objetivo

Um aluno se cadastra com **nome + senha** (experiência mínima, sem e-mail nem
confirmação), joga os minigames e aparece num **ranking geral** ordenado pela
**soma do seu melhor em cada jogo**. O ranking fica em destaque no topo da
`jogos.html`, com os minigames logo abaixo.

## Modelo de segurança (honesto)

O site é 100% cliente (Firebase no navegador, sem backend próprio). Login
nome+senha sem Firebase Auth implica que o navegador lê e escreve numa coleção
pública. Consequências assumidas:

- Um aluno técnico consegue ler a coleção (vê hashes, não senhas em texto) e, em
  tese, cravar uma pontuação falsa.
- Não há como impedir isso de verdade sem servidor.

Decisão: **simples com higiene básica** — senha guardada como hash (nunca em
texto puro) e regras do Firestore validando o formato da escrita. Barra o abuso
casual; não blinda contra um trapaceiro determinado. Aceitável para um ranking
de turma. Sem recuperação de senha (esqueceu = não recupera).

## Modelo de dados

Coleção nova `jogadores`, um documento por aluno. O id do doc é o **slug** do
nome (chave única).

```
jogadores/{slug}
  nome         string   // como digitado, para exibição ("Herbert")
  senhaHash    string   // SHA-256 hex de (salt + senha)
  salt         string   // aleatório por aluno (hex, ~16 bytes)
  melhores     map      // { "<jogoId>": <pontos:number> } melhor por jogo
  total        number   // soma dos valores de `melhores` — ordena o ranking
  criadoEm     timestamp
  atualizadoEm timestamp
```

**Normalização do slug:** nome `trim()` → minúsculo → espaços internos colapsados
para um só → espaços viram `-`. Ex.: `"  Herbert  Luan "` → `herbert-luan`. Dois
nomes que normalizam igual são a mesma conta. Validação de entrada: nome não
vazio após trim, 2–24 caracteres visíveis; senha 1+ caractere (sem regras de
força — simplicidade pedida).

**`total` é derivado** (soma de `melhores`) mas é gravado explícito para o
ranking ler/ordenar sem recomputar no cliente.

## Módulo `src/lib/jogadores.js`

Fonte única da identidade. Não conhece telas — só dados e sessão. API:

- `sessaoAtual()` → `{ slug, nome } | null` (lê `localStorage`).
- `sair()` — limpa a sessão.
- `existeJogador(nome)` → `boolean` (busca o doc pelo slug).
- `cadastrar(nome, senha)` → cria o doc com hash + salt, abre sessão, retorna
  `{ slug, nome }`. Erro se já existe.
- `entrar(nome, senha)` → lê o doc, compara o hash no navegador; sucesso abre
  sessão e retorna `{ slug, nome }`; senha errada lança erro tratável.
- `registrarPontuacao(jogoId, pontos)` → para o jogador logado, se `pontos >
  melhores[jogoId]` atual, atualiza `melhores[jogoId]`, recomputa `total`,
  grava `atualizadoEm`. Sem sessão, é no-op (retorna sem erro).
- `topRanking(limite = 12)` → lê `jogadores` ordenado por `total` desc.

**Hash:** Web Crypto `crypto.subtle.digest("SHA-256", salt+senha)`, hex. Salt
gerado com `crypto.getRandomValues`. Sem dependências novas.

**Chaves de `localStorage`:** `herbert-jogador` guarda `{slug, nome}`. As chaves
atuais `herbert-jogo-melhor:<id>` continuam existindo (o jogo segue funcionando
deslogado).

## Fluxo de login (UI na `jogos.html`)

Card no topo da página. Estado conduzido por um pequeno controlador em
`src/jogos.js` usando o módulo acima.

1. **Deslogado, passo 1:** input de nome + botão "Continuar".
2. Ao continuar → `existeJogador(nome)`:
   - **Não existe** → passo 2a: aparece "criar senha" + botão "Criar conta" →
     `cadastrar`.
   - **Existe** → passo 2b: aparece "senha" + botão "Entrar" → `entrar`.
3. Sucesso em qualquer caminho → re-renderiza como **logado**: chip
   "👋 Olá, {nome} · sair".
4. Erro (senha errada, falha de rede) → mensagem inline no card, sem recarregar.

O nome é editável até confirmar; trocar o nome volta ao passo 1.

## Pontuação no jogo (`src/jogo.js`)

No `iniciarQuiz`, o `aoTerminar(resultado)` chama
`registrarPontuacao(resultado.jogoId, resultado.pontos)`. Se houver sessão,
sobe pro Firestore; se não, não faz nada (jogar deslogado continua válido). O
`localStorage` "melhor" segue como está, independente do login.

## Ranking na `jogos.html`

Entre o card de login e o catálogo de minigames. Lê `topRanking()` no carregar.

- **Pódio:** top 3 em destaque (ouro/prata/bronze), com nome e total.
- **Lista:** 4º em diante, numerada e enxuta (posição · nome · total).
- **Destaque do aluno logado:** se o jogador da sessão está no top, sua linha
  fica realçada. (Mostrar a posição de quem ficou fora do top é desejável, mas
  fica como melhoria futura — não bloqueia esta entrega.)
- **Vazio:** se ninguém pontuou ainda, mensagem amigável ("Seja o primeiro!").

## Regras do Firestore

Adicionar bloco para `jogadores`:

- `allow read: if true;` — o ranking é público.
- `allow create:` só se o doc não existe e a forma é válida: `nome` string não
  vazia, `senhaHash` e `salt` strings, `melhores` é map, `total` number `>= 0`,
  `criadoEm`/`atualizadoEm` timestamps.
- `allow update:` valida a forma e impede troca de credencial:
  `request.resource.data.senhaHash == resource.data.senhaHash` e idem `salt` e
  `nome`; `total` e os valores de `melhores` continuam números `>= 0`.
- Sem `delete`.

Limitação assumida: como `senhaHash` é legível, a checagem de credencial na
regra não é à prova de replay. É higiene, não blindagem — coerente com a decisão
de segurança acima.

## O que NÃO entra (YAGNI)

- Recuperação/troca de senha.
- Ranking por jogo (só o geral; pode vir depois).
- Avatares, badges, histórico de partidas.
- Posição do aluno fora do top (melhoria futura).
- Anti-cheat de verdade (exige servidor).

## Arquivos afetados

- **Novo:** `src/lib/jogadores.js` — identidade, hash, sessão, ranking.
- `src/jogos.js` — card de login + render do ranking.
- `src/jogo.js` — chama `registrarPontuacao` no `aoTerminar`.
- `jogos.html` — containers do login e do ranking.
- `src/estilo.css` (ou `src/lib/quiz.css`) — estilos do card de login e pódio.
- `firestore.rules` — bloco `jogadores`.
```
