// ============================================================================
//  Herbert Edu — Concede (ou remove) a permissão de admin a um usuário.
//  Define o custom claim { admin: true } usado pelas regras de segurança.
//
//  Pré-requisito: o usuário precisa JÁ ter entrado uma vez no painel
//  (login com Google em /admin) para que a conta exista no Firebase Auth.
//
//  Uso:
//    node scripts/tornar-admin.mjs seu-email@gmail.com
//    node scripts/tornar-admin.mjs seu-email@gmail.com --remover
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_CHAVE = resolve(RAIZ, "serviceAccountKey.json");

if (!existsSync(CAMINHO_CHAVE)) {
  console.error("\n❌ Falta serviceAccountKey.json na raiz.\n");
  process.exit(1);
}

const email = process.argv[2];
const remover = process.argv.includes("--remover");
if (!email || email.startsWith("--")) {
  console.error("\nUso: node scripts/tornar-admin.mjs <email> [--remover]\n");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(CAMINHO_CHAVE, "utf8"))),
});

try {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, remover ? { admin: false } : { admin: true });
  console.log(
    `\n✅ ${email} agora ${remover ? "NÃO é mais" : "é"} admin.` +
    `\n   (saia e entre de novo no painel para o token atualizar.)\n`
  );
  process.exit(0);
} catch (e) {
  if (e.code === "auth/user-not-found") {
    console.error(
      `\n❌ Conta ${email} não encontrada.` +
      `\n   Entre uma vez em /admin com o Google antes de rodar este comando.\n`
    );
  } else {
    console.error("\n❌ " + (e.message || e) + "\n");
  }
  process.exit(1);
}
