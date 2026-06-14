/**
 * Camera keyframe capture with client-side compression.
 *
 * Captures a frame from a <video> element, resizes, and compresses to JPEG.
 * All metrics come from the actual pipeline run — never fabricated.
 */

import { ref } from 'vue'
import { compressImage } from '../utils/imageCompression'

// ---- Types ----

export interface CaptureMetrics {
  /** Bytes of the resized JPEG at INITIAL_QUALITY (pre-quality-loop). */
  originalBytes: number
  /** Final compressed bytes sent to backend. */
  compressedBytes: number
  /** compressedBytes / originalBytes. */
  compressionRatio: number
  /** Original video dimensions. */
  originalWidth: number
  /** Original video dimensions. */
  originalHeight: number
  /** Dimensions after resize. */
  compressedWidth: number
  /** Dimensions after resize. */
  compressedHeight: number
  /** Time spent drawing + resizing + compressing (ms). */
  compressionDurationMs: number
  /** Time from capture start to capture end (ms). */
  captureDurationMs: number
  /** Final JPEG quality used. */
  finalQuality: number
}

// ---- Composable ----

export function useImageCapture() {
  const snapshot = ref<string | null>(null)
  const captureError = ref('')
  const lastMetrics = ref<CaptureMetrics | null>(null)

  /**
   * Capture a frame from a video element, compress it, and produce a JPEG data URL.
   *
   * Returns true on success (snapshot ref is populated), false on failure.
   * Camera must be active: readyState ≥ HAVE_CURRENT_DATA and dimensions > 0.
   */
  async function captureFrame(
    videoEl: HTMLVideoElement | null,
  ): Promise<boolean> {
    captureError.value = ''
    lastMetrics.value = null

    const t0 = performance.now()

    if (!videoEl) {
      captureError.value = '视频元素未就绪，请先开启摄像头。'
      return false
    }

    if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      captureError.value = '摄像头画面尚未就绪，请稍候再试。'
      return false
    }

    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      captureError.value = '无法读取摄像头画面尺寸，请检查摄像头连接。'
      return false
    }

    try {
      const result = await compressImage(videoEl)
      const t1 = performance.now()

      if ('code' in result) {
        // CompressionError
        captureError.value = result.message
        return false
      }

      // Success
      snapshot.value = result.dataUrl
      lastMetrics.value = {
        originalBytes: result.originalBytes,
        compressedBytes: result.compressedBytes,
        compressionRatio: result.compressionRatio,
        originalWidth: result.originalWidth,
        originalHeight: result.originalHeight,
        compressedWidth: result.compressedWidth,
        compressedHeight: result.compressedHeight,
        compressionDurationMs: result.compressionDurationMs,
        captureDurationMs: Math.round(t1 - t0),
        finalQuality: result.finalQuality,
      }
      return true
    } catch (e: unknown) {
      const err = e as Error
      captureError.value = `截图失败：${err.message || '未知错误'}`
      return false
    }
  }

  function clearSnapshot(): void {
    snapshot.value = null
    captureError.value = ''
    lastMetrics.value = null
  }

  return {
    snapshot,
    captureError,
    lastMetrics,
    captureFrame,
    clearSnapshot,
  }
}
