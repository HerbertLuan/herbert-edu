// ============================================================================
//  Montador de aulas — "assa" um arquivo de conteúdo (só os slides) com o
//  design system (src/lib/aula.css + aula.js) dentro do template base,
//  produzindo um HTML autocontido (funciona offline / iframe).
//
//  Uso direto (gera ao lado do conteúdo):
//    node scripts/montar-aula.mjs aulas/<slug>/conteudo.html "Título da Aula"
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function montarAula({ conteudoPath, titulo }) {
  const base = readFileSync(join(RAIZ, "aulas/template/base.html"), "utf8");
  const css = readFileSync(join(RAIZ, "src/lib/aula.css"), "utf8");
  const js = readFileSync(join(RAIZ, "src/lib/aula.js"), "utf8");
  const conteudo = readFileSync(resolve(conteudoPath), "utf8");

  return base
    .replaceAll("{{TITULO}}", () => titulo)
    .replace("{{CSS}}", () => css)
    .replace("{{JS}}", () => js)
    .replace("{{CONTEUDO}}", () => conteudo);
}

// Execução direta pela linha de comando
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , conteudoPath, titulo] = process.argv;
  if (!conteudoPath || !titulo) {
    console.error('Uso: node scripts/montar-aula.mjs <conteudo.html> "<Título>"');
    process.exit(1);
  }
  const html = montarAula({ conteudoPath, titulo });
  const saida = join(dirname(resolve(conteudoPath)), "index.html");
  writeFileSync(saida, html, "utf8");
  console.log(`✅ Aula montada: ${saida} (${(html.length / 1024).toFixed(0)} kB)`);
}
