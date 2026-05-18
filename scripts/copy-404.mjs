// GitHub Pages için 404 fallback — dist/index.html'i 404.html olarak kopyalar.
// Kullanıcı bir alt-path'e (örn. /tyroforecast/sayfa-x) doğrudan girerse,
// veya hard-refresh yaparsa, GitHub Pages 404'e düşer. 404.html aynı SPA
// olduğu için uygulama yine yüklenir ve client-side router devreye girer.
import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const src = join(distDir, 'index.html')
const dst = join(distDir, '404.html')

if (!existsSync(src)) {
  console.error(`[copy-404] dist/index.html bulunamadı: ${src}. Önce 'vite build' çalıştırın.`)
  process.exit(1)
}

copyFileSync(src, dst)
console.log(`[copy-404] ${src}  →  ${dst}  (SPA fallback)`)
