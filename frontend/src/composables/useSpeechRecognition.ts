import { ref, computed, onUnmounted } from 'vue'

export type RecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'unsupported'
  | 'denied'
  | 'error'

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

// 浏览器 SpeechRecognition 构造函数类型
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onerror:
    | ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void)
    | null
  onresult:
    | ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void)
    | null
}

export function useSpeechRecognition() {
  const status = ref<RecognitionStatus>('idle')
  const interimTranscript = ref('')
  const finalTranscript = ref('')
  const errorMessage = ref('')

  let recognition: SpeechRecognitionInstance | null = null

  // 检测浏览器支持
  const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
    (window as unknown as Record<string, unknown>).SpeechRecognition as
      | SpeechRecognitionConstructor
      | undefined
      ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition as
        | SpeechRecognitionConstructor
        | undefined

  const isSupported = computed(() => !!SpeechRecognitionCtor)

  function createRecognition(): SpeechRecognitionInstance {
    const rec = new SpeechRecognitionCtor!()
    rec.lang = 'zh-CN'
    rec.continuous = false
    rec.interimResults = true
    return rec
  }

  function startListening(): void {
    // 状态保护：禁止重复点击
    if (status.value === 'listening' || status.value === 'processing') return

    if (!isSupported.value) {
      status.value = 'unsupported'
      errorMessage.value =
        '您的浏览器不支持语音识别。请使用最新版 Chrome 或 Edge，并通过 localhost 或 HTTPS 访问。'
      return
    }

    // 清理上一次的 recognition 实例
    if (recognition) {
      try { recognition.abort() } catch { /* 忽略 */ }
      recognition = null
    }

    interimTranscript.value = ''
    finalTranscript.value = ''
    errorMessage.value = ''

    try {
      recognition = createRecognition()
    } catch {
      status.value = 'error'
      errorMessage.value = '创建语音识别实例失败，请刷新页面重试。'
      return
    }

    recognition.onstart = () => {
      status.value = 'listening'
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript.value += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      interimTranscript.value = interim
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      switch (event.error) {
        case 'not-allowed':
          status.value = 'denied'
          errorMessage.value =
            '麦克风权限被拒绝。请点击浏览器地址栏左侧的锁定图标，开启麦克风权限后重试。'
          break
        case 'no-speech':
          // 没有检测到语音——静默回到 idle，不算错误
          status.value = 'idle'
          break
        case 'audio-capture':
          status.value = 'error'
          errorMessage.value =
            '无法访问麦克风设备。请确认麦克风已正确连接且未被其他应用占用。'
          break
        case 'network':
          // 网络语音识别服务不可用
          status.value = 'error'
          errorMessage.value =
            '语音识别网络服务不可用，请检查网络连接后重试。'
          break
        case 'aborted':
          // 主动停止，正常流程
          break
        default:
          status.value = 'error'
          errorMessage.value = `语音识别出错：${event.message || event.error}`
      }
    }

    recognition.onend = () => {
      // onend 可能在 onresult 之前触发（Chrome 行为）
      // 如果当前是 listening 状态且有 interim 文本，说明还在处理中
      if (status.value === 'listening') {
        status.value = 'processing'
        // 给 onresult 一点时间（continuous=false 时 result 会在 end 前到达）
        setTimeout(() => {
          if (status.value === 'processing') {
            status.value = 'idle'
          }
        }, 300)
      } else if (status.value !== 'denied' && status.value !== 'error') {
        status.value = 'idle'
      }
    }

    try {
      recognition.start()
    } catch {
      status.value = 'error'
      errorMessage.value = '启动语音识别失败，请刷新页面重试。'
    }
  }

  function stopListening(): void {
    if (recognition) {
      try { recognition.stop() } catch { /* 忽略 */ }
    }
    status.value = 'idle'
  }

  function resetTranscript(): void {
    interimTranscript.value = ''
    finalTranscript.value = ''
    errorMessage.value = ''
  }

  // 组件卸载时清理
  onUnmounted(() => {
    if (recognition) {
      try { recognition.abort() } catch { /* 忽略 */ }
      recognition = null
    }
  })

  return {
    status,
    interimTranscript,
    finalTranscript,
    errorMessage,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  }
}
