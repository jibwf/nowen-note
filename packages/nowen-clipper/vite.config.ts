import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite 配置：MV3 扩展的多入口构建。
 *
 * enhanced.ts 会先加载原 background/index.ts，保留右键菜单、快捷键和截图能力，
 * 再挂载 Issue #217 的统一速记/剪藏流水线。
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome110",
    minify: false,
    sourcemap: false,
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/enhanced.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "src/popup/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
      },
      output: {
        entryFileNames: (chunk) => `${chunk.name}.js`,
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (asset) => {
          const n = asset.name || "asset";
          if (n.endsWith(".css")) return "assets/[name][extname]";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
