/**
 * SOLAPI 카카오 알림톡 API 클라이언트
 * @see https://docs.solapi.com
 * @see https://github.com/solapi/solapi-nodejs
 */

import { SolapiMessageService } from 'solapi'

interface AlimtalkConfig {
  apiKey: string
  apiSecret: string
  pfId: string
  sender: string
  testMode: boolean
}

interface SendResult {
  success: boolean
  groupId?: string
  messageId?: string
  error?: string
}

interface AlimtalkVariables {
  [key: string]: string
}

interface AlimtalkOptions {
  templateId: string
  variables?: AlimtalkVariables
  disableSms?: boolean // SMS 대체 발송 비활성화
}

class KakaoAlimtalkClient {
  private config: AlimtalkConfig
  private messageService: SolapiMessageService

  constructor(config: AlimtalkConfig) {
    this.config = config
    this.messageService = new SolapiMessageService(
      config.apiKey,
      config.apiSecret
    )
  }

  /**
   * 카카오 알림톡 발송
   * @param phone 수신 전화번호 (숫자만)
   * @param templateId 알림톡 템플릿 ID
   * @param variables 템플릿 변수 (#{변수명} 형식)
   * @param disableSms SMS 대체 발송 비활성화 (기본: false)
   */
  async sendAlimtalk(
    phone: string,
    templateId: string,
    variables?: AlimtalkVariables,
    disableSms: boolean = false
  ): Promise<SendResult> {
    try {
      const normalizedPhone = this.normalizePhone(phone)

      // 테스트 모드에서는 실제 발송 안 함
      if (this.config.testMode) {
        console.log('📨 [TEST MODE] 알림톡 발송:', {
          to: normalizedPhone,
          from: this.config.sender,
          pfId: this.config.pfId,
          templateId,
          variables,
        })
        return {
          success: true,
          messageId: 'test-' + Date.now(),
        }
      }

      // SOLAPI 알림톡 발송
      const response = await this.messageService.sendOne({
        to: normalizedPhone,
        from: this.config.sender,
        kakaoOptions: {
          pfId: this.config.pfId,
          templateId,
          variables: variables || {},
          disableSms,
        },
      })

      console.log('✅ 알림톡 발송 성공:', response)

      return {
        success: true,
        groupId: response.groupId,
        messageId: response.messageId,
      }
    } catch (error: any) {
      console.error('❌ 알림톡 발송 실패:', error)
      return {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다.',
      }
    }
  }

  /**
   * 예약 알림톡 발송
   * @param phone 수신 전화번호
   * @param templateId 알림톡 템플릿 ID
   * @param scheduledAt 예약 시간 (Date 객체)
   * @param variables 템플릿 변수
   * @param disableSms SMS 대체 발송 비활성화
   */
  async sendScheduledAlimtalk(
    phone: string,
    templateId: string,
    scheduledAt: Date,
    variables?: AlimtalkVariables,
    disableSms: boolean = false
  ): Promise<SendResult> {
    try {
      const normalizedPhone = this.normalizePhone(phone)
      
      // 예약 시간 포맷 (YYYY-MM-DD HH:mm:ss)
      const scheduledDate = this.formatScheduledDate(scheduledAt)

      // 테스트 모드
      if (this.config.testMode) {
        console.log('📨 [TEST MODE] 예약 알림톡 발송:', {
          to: normalizedPhone,
          from: this.config.sender,
          pfId: this.config.pfId,
          templateId,
          scheduledDate,
          variables,
        })
        return {
          success: true,
          messageId: 'test-scheduled-' + Date.now(),
        }
      }

      // SOLAPI 예약 발송
      const response = await this.messageService.send(
        [
          {
            to: normalizedPhone,
            from: this.config.sender,
            kakaoOptions: {
              pfId: this.config.pfId,
              templateId,
              variables: variables || {},
              disableSms,
            },
          },
        ],
        {
          scheduledDate,
        }
      )

      console.log('✅ 예약 알림톡 발송 성공:', response)

      return {
        success: true,
        groupId: response.groupId,
      }
    } catch (error: any) {
      console.error('❌ 예약 알림톡 발송 실패:', error)
      return {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다.',
      }
    }
  }

  /**
   * 전화번호 정규화 (010-1234-5678 → 01012345678)
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '')
  }

  /**
   * 예약 시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
   */
  private formatScheduledDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }
}

// Singleton instance
export const kakaoAlimtalk = new KakaoAlimtalkClient({
  apiKey: process.env.SOLAPI_API_KEY || '',
  apiSecret: process.env.SOLAPI_API_SECRET || '',
  pfId: process.env.KAKAO_PF_ID || '',
  sender: process.env.KAKAO_SENDER || '',
  testMode: process.env.KAKAO_TESTMODE === 'Y',
})

export type { SendResult, AlimtalkVariables, AlimtalkOptions }
export { KakaoAlimtalkClient }
