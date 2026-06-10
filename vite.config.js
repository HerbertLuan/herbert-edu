import { defineConfig } from "vite";
import { resolve } from "path";

// Site multipágina: home (index), visualizador de aula (aula), painel (admin),
// vitrine de minigames (jogos) e player de minigame (jogo).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        aula: resolve(__dirname, "aula.html"),
        admin: resolve(__dirname, "admin.html"),
        jogos: resolve(__dirname, "jogos.html"),
        jogo: resolve(__dirname, "jogo.html"),
      },
    },
  },
});
