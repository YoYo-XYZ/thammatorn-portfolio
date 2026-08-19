import { defineConfig } from "vite";

const pagesBasePath = process.env.BASE_PATH ?? "";

export default defineConfig({
  base: pagesBasePath ? `${pagesBasePath}/` : "/",
});
