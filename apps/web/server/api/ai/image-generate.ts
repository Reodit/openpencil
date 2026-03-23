import { defineEventHandler, readBody, setResponseHeaders, createError } from 'h3'

interface ImageGenerateBody {
  prompt: string
  provider: 'openai' | 'custom' | 'gemini' | 'gemini-cli' | 'replicate'
  model: string
  apiKey?: string
  baseUrl?: string
  width?: number
  height?: number
}

/**
 * POST /api/ai/image-generate
 *
 * Multi-provider image generation endpoint.
 * Supports OpenAI (dall-e-3/dall-e-2), Gemini (imagen), and Replicate.
 * Returns { url: string } — either a remote URL or a base64 data URL.
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Content-Type': 'application/json' })

  const body = await readBody<ImageGenerateBody>(event)

  if (!body?.prompt?.trim()) {
    throw createError({ statusCode: 400, message: 'Missing required field: prompt' })
  }
  if (!body?.provider) {
    throw createError({ statusCode: 400, message: 'Missing required field: provider' })
  }
  const { prompt, provider, model, apiKey, baseUrl, width, height } = body

  // gemini-cli doesn't need an API key
  if (provider !== 'gemini-cli' && !apiKey?.trim()) {
    throw createError({ statusCode: 400, message: 'Missing required field: apiKey' })
  }

  if (provider === 'gemini-cli') {
    return await generateGeminiCli({ prompt, width, height })
  }

  if (provider === 'openai' || provider === 'custom') {
    return await generateOpenAI({ prompt, model, apiKey: apiKey!, baseUrl, width, height })
  }

  if (provider === 'gemini') {
    return await generateGemini({ prompt, model, apiKey: apiKey!, baseUrl, width, height })
  }

  if (provider === 'replicate') {
    return await generateReplicate({ prompt, model, apiKey, baseUrl, width, height })
  }

  throw createError({ statusCode: 400, message: `Unsupported provider: ${provider}` })
})

// ---------------------------------------------------------------------------
// Size mapping
// ---------------------------------------------------------------------------

function mapToOpenAISize(w?: number, h?: number): string {
  if (!w || !h) return '1024x1024'
  const ratio = w / h
  if (ratio > 1.3) return '1792x1024'
  if (ratio < 0.77) return '1024x1792'
  return '1024x1024'
}

// ---------------------------------------------------------------------------
// OpenAI / custom OpenAI-compatible provider
// ---------------------------------------------------------------------------

async function generateOpenAI(opts: {
  prompt: string
  model: string
  apiKey: string
  baseUrl?: string
  width?: number
  height?: number
}): Promise<{ url: string }> {
  const { prompt, model, apiKey, baseUrl, width, height } = opts
  const size = mapToOpenAISize(width, height)
  const endpoint = `${baseUrl ?? 'https://api.openai.com'}/v1/images/generations`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt, n: 1, size, response_format: 'url' }),
    })
  } catch (err) {
    throw createError({ statusCode: 502, message: `OpenAI request failed: ${String(err)}` })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `OpenAI returned ${res.status}`
    try {
      const errJson = JSON.parse(text) as { error?: { message?: string } }
      if (errJson.error?.message) msg = errJson.error.message
    } catch {
      if (text) msg += `: ${text.slice(0, 150)}`
    }
    throw createError({ statusCode: 502, message: msg })
  }

  const data = (await res.json()) as { data?: { url?: string }[] }
  const url = data?.data?.[0]?.url
  if (!url) {
    throw createError({ statusCode: 502, message: 'OpenAI response missing image URL' })
  }

  return { url }
}

// ---------------------------------------------------------------------------
// Gemini image generation
// ---------------------------------------------------------------------------

function mapToGeminiAspectRatio(w?: number, h?: number): string | undefined {
  if (!w || !h) return undefined
  const ratio = w / h
  if (ratio > 1.6) return '16:9'
  if (ratio > 1.3) return '4:3'
  if (ratio < 0.625) return '9:16'
  if (ratio < 0.77) return '3:4'
  return '1:1'
}

async function generateGemini(opts: {
  prompt: string
  model: string
  apiKey: string
  baseUrl?: string
  width?: number
  height?: number
}): Promise<{ url: string }> {
  const { prompt, model, apiKey, baseUrl, width, height } = opts
  const base = baseUrl ?? 'https://generativelanguage.googleapis.com'
  const endpoint = `${base}/v1beta/models/${model}:generateContent?key=${apiKey}`

  const generationConfig: Record<string, unknown> = { responseModalities: ['TEXT', 'IMAGE'] }
  const aspectRatio = mapToGeminiAspectRatio(width, height)
  if (aspectRatio) {
    generationConfig.imageConfig = { aspectRatio }
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    })
  } catch (err) {
    throw createError({ statusCode: 502, message: `Gemini request failed: ${String(err)}` })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `Gemini returned ${res.status}`
    try {
      const errJson = JSON.parse(text) as { error?: { message?: string } }
      if (errJson.error?.message) msg = errJson.error.message
    } catch {
      if (text) msg += `: ${text.slice(0, 150)}`
    }
    throw createError({ statusCode: 502, message: msg })
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: {
          inlineData?: { mimeType?: string; data?: string }
          text?: string
        }[]
      }
    }[]
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'))

  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    throw createError({ statusCode: 502, message: 'Gemini response missing inline image data' })
  }

  const { mimeType, data: base64data } = imagePart.inlineData
  return { url: `data:${mimeType};base64,${base64data}` }
}

// ---------------------------------------------------------------------------
// Replicate
// ---------------------------------------------------------------------------

async function generateReplicate(opts: {
  prompt: string
  model: string
  apiKey: string
  baseUrl?: string
  width?: number
  height?: number
}): Promise<{ url: string }> {
  const { prompt, model, apiKey, baseUrl, width, height } = opts
  const base = baseUrl ?? 'https://api.replicate.com'

  // Start prediction
  let createRes: Response
  try {
    const input: Record<string, unknown> = { prompt }
    if (width) input.width = width
    if (height) input.height = height

    createRes = await fetch(`${base}/v1/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input }),
    })
  } catch (err) {
    throw createError({ statusCode: 502, message: `Replicate request failed: ${String(err)}` })
  }

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '')
    let msg = `Replicate returned ${createRes.status}`
    try {
      const errJson = JSON.parse(text) as { detail?: string }
      if (errJson.detail) msg = errJson.detail
    } catch {
      if (text) msg += `: ${text.slice(0, 150)}`
    }
    throw createError({ statusCode: 502, message: msg })
  }

  const prediction = (await createRes.json()) as { id?: string; status?: string }
  const predictionId = prediction?.id
  if (!predictionId) {
    throw createError({ statusCode: 502, message: 'Replicate response missing prediction ID' })
  }

  // Poll until succeeded or failed (max 120s, polling every 2s)
  const maxAttempts = 60
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))

    let pollRes: Response
    try {
      pollRes = await fetch(`${base}/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch (err) {
      throw createError({
        statusCode: 502,
        message: `Replicate poll request failed: ${String(err)}`,
      })
    }

    if (!pollRes.ok) {
      const text = await pollRes.text().catch(() => '')
      throw createError({
        statusCode: 502,
        message: `Replicate poll returned ${pollRes.status}: ${text.slice(0, 200)}`,
      })
    }

    const status = (await pollRes.json()) as {
      id?: string
      status?: string
      output?: string | string[]
      error?: string
    }

    if (status.status === 'succeeded') {
      const output = status.output
      if (Array.isArray(output)) {
        const first = output[0]
        if (!first) {
          throw createError({
            statusCode: 502,
            message: 'Replicate succeeded but output array is empty',
          })
        }
        return { url: first }
      }
      if (typeof output === 'string') {
        return { url: output }
      }
      throw createError({ statusCode: 502, message: 'Replicate succeeded but output is missing' })
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      throw createError({
        statusCode: 502,
        message: `Replicate prediction ${status.status}: ${status.error ?? 'unknown error'}`,
      })
    }

    // Still starting/processing — keep polling
  }

  throw createError({
    statusCode: 502,
    message: 'Replicate prediction timed out after 120 seconds',
  })
}

// ---------------------------------------------------------------------------
// Gemini CLI (no API key needed — uses local CLI authentication)
// ---------------------------------------------------------------------------

async function generateGeminiCli(opts: {
  prompt: string
  width?: number
  height?: number
}): Promise<{ url: string }> {
  const { prompt, width, height } = opts
  const { resolveGeminiCli } = await import('../../utils/resolve-gemini-cli')
  const { spawn } = await import('node:child_process')

  const binPath = resolveGeminiCli()
  if (!binPath) {
    throw createError({ statusCode: 502, message: 'Gemini CLI not found. Install it first.' })
  }

  let sizeHint = ''
  if (width && height) {
    sizeHint = ` The image should be approximately ${width}x${height} pixels.`
  }

  const fullPrompt = `Generate an SVG image based on this description and output it as a markdown inline image using a data:image/svg+xml;base64 URL. Do not use any tools or write files. Just output the markdown image directly.\n\n${prompt}${sizeHint}`

  const args = [
    '--output-format', 'stream-json',
    '--sandbox',
    '-p', fullPrompt,
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, {
      env: {
        ...process.env,
        PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
        CLAUDECODE: '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdin.end()

    let resultText = ''
    let buffer = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(createError({ statusCode: 502, message: 'Gemini CLI timed out after 120s' }))
    }, 120_000)

    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('{')) continue
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>
          if (parsed.type === 'message' && parsed.role === 'assistant') {
            resultText += (parsed.content as string) || ''
          }
        } catch { /* skip */ }
      }
    })

    child.stderr.on('data', () => { /* discard */ })

    child.on('close', () => {
      clearTimeout(timeout)

      // Flush remaining buffer
      if (buffer.trim() && buffer.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(buffer.trim()) as Record<string, unknown>
          if (parsed.type === 'message' && parsed.role === 'assistant') {
            resultText += (parsed.content as string) || ''
          }
        } catch { /* skip */ }
      }

      if (!resultText) {
        reject(createError({ statusCode: 502, message: 'Gemini CLI returned no output' }))
        return
      }

      // Extract image data URL from markdown: ![alt](data:image/...;base64,...)
      const dataUrlMatch = resultText.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
      if (dataUrlMatch) {
        resolve({ url: dataUrlMatch[0] })
        return
      }

      // Try to extract any image URL
      const urlMatch = resultText.match(/https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|svg)\S*/i)
      if (urlMatch) {
        resolve({ url: urlMatch[0] })
        return
      }

      reject(createError({
        statusCode: 502,
        message: 'Gemini CLI did not return an image. Response: ' + resultText.slice(0, 200),
      }))
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(createError({ statusCode: 502, message: `Gemini CLI error: ${err.message}` }))
    })
  })
}
