import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',    // ensure hosted on all interfaces
    port: 3000, 
    open: false, 
    proxy: {
      '/api': {
        target: 'http://app:8000',  // ← use the Docker Compose service name
        changeOrigin: true,
        secure: false,               // if you ever switch to https
        // rewrite: path => path   // optional if you want to strip or remap paths
      }
    }
  },
  build: {
    outDir: 'build' 
  }
})
