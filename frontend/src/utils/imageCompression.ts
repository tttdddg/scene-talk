/**
 * Client-side image compression for camera keyframes.
 *
 * Pipeline: raw canvas → resize (max 1024px) → JPEG (q=0.72) → quality loop.
 * All metrics come from the actual data, never fabricated.
 */

// ---- Constants ----

/** Maximum dimension (width or height) in pixels. */
const MAX_DIMENSION = 1024

/** Initial JPEG quality (0–1). */
const INITIAL_QUALITY = 0.72

/** Floor quality — we never drop below this. */
const MIN_QUALITY = 0.30

/** Quality step per retry loop. */
const QUALITY_STEP = 0.08

/** Target max bytes (must match backend MAX_IMAGE_BYTES). */
const TARGET_MAX_BYTES = 500_000

// ---- Types ----

export interface CompressionResult {
  /** Original data URL (resized but before quality loop). */
  dataUrl: string
  /** Original JPEG bytes (after resize, before quality reduction). */
  originalBytes: number
  /** Final compressed bytes. */
  compressedBytes: number
  /** compressionRatio = compressedBytes / originalBytes. */
  compressionRatio: number
  /** Original canvas dimensions. */
  originalWidth: number
  /** Original canvas dimensions. */
  originalHeight: number
  /** Resized dimensions. */
  compressedWidth: number
  /** Resized dimensions. */
  compressedHeight: number
  /** Duration of the resize + quality loop in ms. */
  compressionDurationMs: number
  /** Final quality level used. */
  finalQuality: number
}

export interface CompressionError {
  code: 'TOO_LARGE_AFTER_COMPRESSION'
  message: string
}

// ---- Helpers ----

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob returned null'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

// ---- Main ----

/**
 * Compress a raw canvas snapshot.
 *
 * Steps:
 *  1. Resize so longest edge ≤ 1024px (aspect ratio preserved).
 *  2. Export as JPEG at quality 0.72.
 *  3. If byte count > TARGET_MAX_BYTES, re-export at lower quality
 *     until we're under the limit or hit MIN_QUALITY.
 *  4. If still over after hitting MIN_QUALITY, return an error.
 */
export async function compressImage(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
): Promise<CompressionResult | CompressionError> {
  const start = performance.now()

  const originalWidth =
    source instanceof HTMLVideoElement ? source.videoWidth : source.width
  const originalHeight =
    source instanceof HTMLVideoElement ? source.videoHeight : source.height

  // --- Resize ---
  let { width, height } = { width: originalWidth, height: originalHeight }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round((height / width) * MAX_DIMENSION)
      width = MAX_DIMENSION
    } else {
      width = Math.round((width / height) * MAX_DIMENSION)
      height = MAX_DIMENSION
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { code: 'TOO_LARGE_AFTER_COMPRESSION', message: 'Canvas 上下文不可用' }
  }

  // drawImage handles any source type (video / canvas / img)
  ctx.drawImage(source, 0, 0, width, height)

  // --- Quality loop ---
  let quality = INITIAL_QUALITY
  let finalDataUrl = ''
  let finalBytes = 0

  while (quality >= MIN_QUALITY) {
    const blob = await canvasToBlob(canvas, quality)
    finalBytes = blob.size
    finalDataUrl = await blobToDataUrl(blob)

    if (finalBytes <= TARGET_MAX_BYTES) {
      break
    }

    quality = Math.round((quality - QUALITY_STEP) * 100) / 100
  }

  if (finalBytes > TARGET_MAX_BYTES) {
    return {
      code: 'TOO_LARGE_AFTER_COMPRESSION',
      message: `压缩后图片仍有 ${Math.round(finalBytes / 1024)}KB，超过 ${Math.round(TARGET_MAX_BYTES / 1024)}KB 限制。请调整摄像头或降低环境亮度。`,
    }
  }

  const compressionDurationMs = Math.round(performance.now() - start)
  // originalBytes is the first-pass JPEG size (quality = INITIAL_QUALITY) — but we don't
  // have it directly here. Instead, we measure the raw data URL from the *resized* canvas
  // at INITIAL_QUALITY as the "original" (pre-quality-loop) size.
  // For a fair metric we export once more at INITIAL_QUALITY.
  const origBlob = await canvasToBlob(canvas, INITIAL_QUALITY)
  const originalBytes = origBlob.size

  return {
    dataUrl: finalDataUrl,
    originalBytes,
    compressedBytes: finalBytes,
    compressionRatio: originalBytes > 0 ? finalBytes / originalBytes : 1,
    originalWidth,
    originalHeight,
    compressedWidth: width,
    compressedHeight: height,
    compressionDurationMs,
    finalQuality: quality,
  }
}
