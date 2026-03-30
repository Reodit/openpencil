import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*screenshot*.ts',
  timeout: 360000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            '--enable-webgl',
            '--enable-webgl2',
            '--ignore-gpu-blocklist',
            '--enable-gpu',
            '--use-angle=metal',
            '--enable-features=Vulkan,UseSkiaRenderer',
          ],
        },
      },
    },
  ],
})
