/**
 * SOLAPI SMS API Client
 * Aligo 대체 - IP 인증 문제 해결
 * @see https://solapi.com
 */

import { SolapiMessageService } from 'solapi';

const messageService = new SolapiMessageService(
  process.env.SOLAPI_API_KEY!.trim(),
  process.env.SOLAPI_API_SECRET!.trim()
);

export interface SendResult {
  success: boolean
  groupId?: string
  msgId?: string
  error?: string
  test?: boolean
  response?: any
}

/**
 * SMS 발송
 */
export async function sendSMS({
  to,
  text,
}: {
  to: string;
  text: string;
}): Promise<SendResult> {
  try {
    // 테스트 모드 확인
    if (process.env.SOLAPI_TESTMODE === 'Y') {
      console.log('🧪 [SOLAPI TEST MODE]');
      console.log('To:', to);
      console.log('Text:', text);
      return { success: true, test: true };
    }

    // 실제 발송
    const response = await messageService.send({
      to: to.replace(/-/g, ''), // 010-1234-5678 → 01012345678
      from: process.env.SOLAPI_SENDER!.trim(),
      text: text,
      type: 'SMS', // SMS, LMS, MMS
    });

    const groupId = response.groupInfo?.groupId || '';
    console.log('✅ SMS 발송 성공:', groupId);
    return { 
      success: true, 
      groupId: groupId,
      msgId: groupId, // aligo 호환성
      response 
    };
    
  } catch (error: any) {
    console.error('❌ SMS 발송 실패:', error);
    return { 
      success: false, 
      error: error.message || '알 수 없는 오류가 발생했습니다.' 
    };
  }
}

/**
 * LMS 발송 (장문)
 */
export async function sendLMS({
  to,
  text,
  subject,
}: {
  to: string;
  text: string;
  subject?: string;
}): Promise<SendResult> {
  try {
    // 테스트 모드 확인
    if (process.env.SOLAPI_TESTMODE === 'Y') {
      console.log('🧪 [SOLAPI TEST MODE - LMS]');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log('Text:', text);
      return { success: true, test: true };
    }

    // 실제 발송
    const response = await messageService.send({
      to: to.replace(/-/g, ''),
      from: process.env.SOLAPI_SENDER!.trim(),
      text: text,
      subject: subject,
      type: 'LMS',
    });

    const groupId = response.groupInfo?.groupId || '';
    console.log('✅ LMS 발송 성공:', groupId);
    return { 
      success: true, 
      groupId: groupId,
      msgId: groupId,
      response 
    };
    
  } catch (error: any) {
    console.error('❌ LMS 발송 실패:', error);
    return { 
      success: false, 
      error: error.message || '알 수 없는 오류가 발생했습니다.' 
    };
  }
}

/**
 * 메시지 길이에 따라 SMS/LMS 자동 선택 (Aligo 호환)
 */
export async function sendAuto(
  phone: string,
  message: string,
  title?: string
): Promise<SendResult> {
  if (message.length <= 90 && !title) {
    return sendSMS({ to: phone, text: message });
  } else {
    return sendLMS({ to: phone, text: message, subject: title || '온음 알림' });
  }
}

// Aligo 호환 export
export const solapi = {
  sendSMS,
  sendLMS,
  sendAuto,
};
