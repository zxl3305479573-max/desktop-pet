import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => {
  const electronMain = resolve(__dirname, 'electron/main.ts')
  const electronPreload = resolve(__dirname, 'electron/preload.ts')
  const mainHtml = resolve(__dirname, 'index.html')
  const petHtml = resolve(__dirname, 'pet-renderer/index.html')

  console.log('Config loaded:', { electronMain, electronPreload, mainHtml, petHtml })

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: electronMain,
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: electronPreload,
        },
      },
    },
    renderer: {
      plugins: [react()],
      build: {
        rollupOptions: {
          input: { main: mainHtml, pet: petHtml },
        },
      },
    },
  }
})
