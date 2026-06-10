import { defineConfig } from "vite";
import { resolve } from "path";

// Site multipágina: a home (index) e o visualizador de aula (aula)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        aula: resolve(__dirname, "aula.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
