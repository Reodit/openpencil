/**
 * Minimal OpenType name table parser.
 * Extracts the font family name from a font file's raw ArrayBuffer.
 */

export function parseFontFamilyName(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer)
    const numTables = view.getUint16(4)

    // Find the 'name' table
    let nameTableOffset = 0
    for (let i = 0; i < numTables; i++) {
      const offset = 12 + i * 16
      const tag = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      )
      if (tag === 'name') {
        nameTableOffset = view.getUint32(offset + 8)
        break
      }
    }
    if (!nameTableOffset) return null

    const count = view.getUint16(nameTableOffset + 2)
    const stringOffset = nameTableOffset + view.getUint16(nameTableOffset + 4)

    // Look for nameID 1 (Font Family) or nameID 4 (Full Name)
    for (const targetId of [1, 4]) {
      for (let i = 0; i < count; i++) {
        const recOffset = nameTableOffset + 6 + i * 12
        const platformID = view.getUint16(recOffset)
        const nameID = view.getUint16(recOffset + 6)
        const length = view.getUint16(recOffset + 8)
        const strOff = view.getUint16(recOffset + 10)

        if (nameID !== targetId) continue

        const start = stringOffset + strOff
        if (platformID === 3 || platformID === 0) {
          // UTF-16BE
          const chars: string[] = []
          for (let j = 0; j < length; j += 2) {
            chars.push(String.fromCharCode(view.getUint16(start + j)))
          }
          const name = chars.join('').trim()
          if (name) return name
        } else if (platformID === 1) {
          // Macintosh Roman
          const bytes = new Uint8Array(buffer, start, length)
          const name = new TextDecoder('ascii').decode(bytes).trim()
          if (name) return name
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Derive a font family name from a filename as fallback */
export function familyNameFromFilename(filename: string): string {
  return filename
    .replace(/\.(woff2?|ttf|otf)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}
