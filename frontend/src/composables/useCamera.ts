import { ref, onUnmounted } from 'vue'

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'error'

export function useCamera() {
  const status = ref<CameraStatus>('idle')
  const stream = ref<MediaStream | null>(null)
  const errorMessage = ref('')

  async function requestCamera(): Promise<void> {
    if (status.value === 'requesting') return

    status.value = 'requesting'
    errorMessage.value = ''

    // 检查浏览器是否支持 mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.value = 'unavailable'
      errorMessage.value =
        '您的浏览器不支持摄像头访问。请使用最新版 Chrome、Edge 或 Firefox，并确保通过 localhost 或 HTTPS 访问。'
      return
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      })

      stream.value = mediaStream
      status.value = 'ready'
    } catch (err: unknown) {
      const error = err as DOMException

      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          status.value = 'denied'
          errorMessage.value =
            '摄像头权限被拒绝。请点击浏览器地址栏左侧的锁定/摄像头图标，开启摄像头权限后刷新页面重试。'
          break

        case 'NotFoundError':
        case 'DevicesNotFoundError':
          status.value = 'unavailable'
          errorMessage.value =
            '未检测到摄像头设备。请确认摄像头已正确连接，并在系统设置中检查驱动是否正常。'
          break

        case 'NotReadableError':
        case 'TrackStartError':
          status.value = 'error'
          errorMessage.value =
            '摄像头被其他应用占用，请关闭其他使用摄像头的程序（如视频会议、QQ、微信视频等）后重试。'
          break

        case 'OverconstrainedError':
          status.value = 'error'
          errorMessage.value =
            '摄像头不支持所需的分辨率或参数，请尝试更换摄像头。'
          break

        case 'AbortError':
          // 用户取消了权限请求——回到 idle，不算错误
          status.value = 'idle'
          errorMessage.value = ''
          return

        default:
          status.value = 'error'
          errorMessage.value = `摄像头启动失败：${error.message || '未知错误'}`
      }
    }
  }

  function closeCamera(): void {
    if (stream.value) {
      stream.value.getTracks().forEach((track) => {
        track.stop()
      })
      stream.value = null
    }
    status.value = 'idle'
    errorMessage.value = ''
  }

  // 页面卸载时自动释放全部 MediaStreamTrack
  onUnmounted(() => {
    closeCamera()
  })

  return {
    status,
    stream,
    errorMessage,
    requestCamera,
    closeCamera,
  }
}
