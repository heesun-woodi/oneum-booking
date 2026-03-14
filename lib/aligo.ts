/**
 * Aligo SMS API Client
 * @see https://smartsms.aligo.in/admin/api/spec.html
 */

interface AligoConfig {
  apiKey: string
  userId: string
  sender: string
  testMode: boolean
}

interface SendResult {
  success: boolean
  msgId?: string
  error?: string
  resultCode?: number
  message?: string
}

interface AligoResponse {
  result_code: string
  message: string
  msg_id?: string
  success_cnt?: number
  error_cnt?: number
}

class AligoClient {
  private config: AligoConfig
  private baseUrl = 'https://apis.aligo.in/send/'

  constructor(config: AligoConfig) {
    this.config = config
  }

  /**
   * SMS 발송 (단문: 90자 이내)
   */
  async sendSMS(
    phone: string,
    message: string,
    title?: string
  ): Promise<SendResult> {
    try {
      const normalizedPhone = this.normalizePhone(phone)
      
      const formData = new URLSearchParams()
      formData.append('key', this.config.apiKey)
      formData.append('user_id', this.config.userId)
      formData.append('sender', this.config.sender)
      formData.append('receiver', normalizedPhone)
      formData.append('msg', message)
      formData.append('testmode_yn', this.config.testMode ? 'Y' : 'N')
      
      if (title) {
        formData.append('title', title)
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      const data: AligoResponse = await response.json()

      if (data.result_code === '1') {
        return {
          success: true,
          msgId: data.msg_id,
          message: data.message,
        }
      } else {
        return {
          success: false,
          error: data.message,
          resultCode: parseInt(data.result_code),
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다.',
      }
    }
  }

  /**
   * LMS 발송 (장문: 2000자 이내)
   */
  async sendLMS(
    phone: string,
    message: string,
    title: string
  ): Promise<SendResult> {
    try {
      const normalizedPhone = this.normalizePhone(phone)
      
      const formData = new URLSearchParams()
      formData.append('key', this.config.apiKey)
      formData.append('user_id', this.config.userId)
      formData.append('sender', this.config.sender)
      formData.append('receiver', normalizedPhone)
      formData.append('msg', message)
      formData.append('msg_type', 'LMS')
      formData.append('title', title)
      formData.append('testmode_yn', this.config.testMode ? 'Y' : 'N')

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      const data: AligoResponse = await response.json()

      if (data.result_code === '1') {
        return {
          success: true,
          msgId: data.msg_id,
          message: data.message,
        }
      } else {
        return {
          success: false,
          error: data.message,
          resultCode: parseInt(data.result_code),
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다.',
      }
    }
  }

  /**
   * 잔여 건수 조회
   */
  async getRemaining(): Promise<number> {
    try {
      const formData = new URLSearchParams()
      formData.append('key', this.config.apiKey)
      formData.append('user_id', this.config.userId)

      const response = await fetch('https://apis.aligo.in/remain/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      const data = await response.json()

      if (data.result_code === '1') {
        return parseInt(data.SMS_CNT || '0')
      } else {
        throw new Error(data.message)
      }
    } catch (error: any) {
      console.error('잔여 건수 조회 실패:', error)
      return 0
    }
  }

  /**
   * 전화번호 정규화 (010-1234-5678 → 01012345678)
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '')
  }

  /**
   * 메시지 길이에 따라 SMS/LMS 자동 선택
   */
  async sendAuto(
    phone: string,
    message: string,
    title?: string
  ): Promise<SendResult> {
    if (message.length <= 90 && !title) {
      return this.sendSMS(phone, message)
    } else {
      return this.sendLMS(phone, message, title || '온음 알림')
    }
  }
}

// Singleton instance
export const aligo = new AligoClient({
  apiKey: process.env.ALIGO_API_KEY || '',
  userId: process.env.ALIGO_USER_ID || '',
  sender: process.env.ALIGO_SENDER || '',
  testMode: process.env.ALIGO_TESTMODE === 'Y',
})

export type { SendResult, AligoConfig }
