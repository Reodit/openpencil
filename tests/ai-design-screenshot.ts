/**
 * AI Design Generation Screenshot Test
 *
 * 1. Registers/logs in a test user
 * 2. Navigates to editor
 * 3. Generates a design via AI chat
 * 4. Takes canvas screenshot
 *
 * Usage: npx playwright test tests/ai-design-screenshot.ts
 */
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const BASE_URL = process.env.TEST_URL ?? 'http://localhost:3000'
const SCREENSHOT_DIR = resolve('tests/screenshots')
const DIAG_DIR = join(homedir(), '.openpencil', 'diag')

const TEST_USER = { username: 'test-bot', password: 'test1234' }
const DEFAULT_PROMPT = process.env.TEST_PROMPT
  ?? '한국어 호텔 예약 앱 메인 화면을 디자인해줘. 상단바, 검색, 카테고리, 추천 호텔 카드, 하단 네비게이션 포함.'

test.describe('AI Design Generation', () => {
  test.beforeAll(() => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true })
  })

  test('generate design and capture screenshot', async ({ page, request }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

    // 1. Register test user (ignore error if already exists)
    await request.post(`${BASE_URL}/api/auth/register`, {
      data: { username: TEST_USER.username, password: TEST_USER.password },
    }).catch(() => {})

    // 2. Navigate to login page and login via UI
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)

    // Fill login form
    const usernameInput = page.locator('input[placeholder*="username"], input[name="username"], input[type="text"]').first()
    const passwordInput = page.locator('input[type="password"]').first()

    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usernameInput.fill(TEST_USER.username)
      await passwordInput.fill(TEST_USER.password)

      // Click sign in button
      const signInBtn = page.locator('button:has-text("Sign In"), button:has-text("Log in"), button[type="submit"]').first()
      await signInBtn.click()
      await page.waitForTimeout(3000)
    }

    // 3. Navigate to editor (may redirect automatically after login)
    if (!page.url().includes('/editor') && !page.url().includes('/workspace')) {
      // Look for a workspace or create-new link
      const editorLink = page.locator('a[href*="editor"], a[href*="workspace"], button:has-text("New"), button:has-text("Create")').first()
      if (await editorLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editorLink.click()
        await page.waitForTimeout(3000)
      } else {
        await page.goto(`${BASE_URL}/editor`, { waitUntil: 'networkidle', timeout: 15000 })
      }
    }

    await page.waitForTimeout(3000) // Wait for CanvasKit WASM

    // Take a screenshot to see current state
    await page.screenshot({ path: join(SCREENSHOT_DIR, `state-${timestamp}.png`) })
    console.log(`[Test] Current state screenshot saved`)

    // 4. Find chat input
    let chatInput = page.locator('textarea').first()
    if (!await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try to open AI panel by keyboard shortcut or button
      await page.keyboard.press('Control+Shift+A')
      await page.waitForTimeout(1000)
      chatInput = page.locator('textarea').first()
    }

    if (!await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Test] Cannot find chat input, saving state screenshot')
      await page.screenshot({ path: join(SCREENSHOT_DIR, `no-chat-${timestamp}.png`) })
      return
    }

    // 5. Type prompt and send
    await chatInput.fill(DEFAULT_PROMPT)
    await page.waitForTimeout(500)
    await chatInput.press('Enter')
    console.log(`[Test] Sent prompt: ${DEFAULT_PROMPT}`)

    // 6. Wait for generation to complete (up to 3 min)
    await page.waitForTimeout(5000) // Initial wait for streaming to start

    // Poll for completion: check if assistant message stops updating
    let lastContent = ''
    let stableCount = 0
    for (let i = 0; i < 60; i++) { // Max 60 * 3s = 3min
      await page.waitForTimeout(3000)
      const currentContent = await page.locator('.ai-chat-panel, [class*="chat"]').innerText().catch(() => '')
      if (currentContent === lastContent && currentContent.length > 100) {
        stableCount++
        if (stableCount >= 3) {
          console.log(`[Test] Generation appears complete (stable for ${stableCount * 3}s)`)
          break
        }
      } else {
        stableCount = 0
      }
      lastContent = currentContent
    }

    await page.waitForTimeout(3000) // Extra settle time

    // 7. Take screenshots
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `full-${timestamp}.png`),
      fullPage: true,
    })
    console.log(`[Test] Full screenshot saved: full-${timestamp}.png`)

    const canvas = page.locator('canvas').first()
    if (await canvas.isVisible().catch(() => false)) {
      await canvas.screenshot({
        path: join(SCREENSHOT_DIR, `canvas-${timestamp}.png`),
      })
      console.log(`[Test] Canvas screenshot saved: canvas-${timestamp}.png`)
    }

    // 8. Save diagnostic data
    const diagDate = new Date().toISOString().slice(0, 10)
    const diagPath = join(DIAG_DIR, `generation-${diagDate}.log`)
    if (existsSync(diagPath)) {
      const diagContent = readFileSync(diagPath, 'utf-8')
      const entries = diagContent.split('='.repeat(80))
      const lastEntry = entries[entries.length - 1]?.trim()
      if (lastEntry) {
        writeFileSync(join(SCREENSHOT_DIR, `diag-${timestamp}.txt`), lastEntry)
        console.log(`[Test] Diagnostic data saved`)
      }
    }

    console.log(`[Test] All artifacts saved to ${SCREENSHOT_DIR}`)
  })
})
