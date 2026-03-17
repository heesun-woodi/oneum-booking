/**
 * 전화번호 정규화 유틸리티
 */

/**
 * 전화번호에서 숫자만 추출하고 공백/줄바꿈 제거
 * @param phone - 원본 전화번호
 * @returns 정규화된 전화번호 (숫자만)
 * @example
 * normalizePhone("010-1234-5678") // "01012345678"
 * normalizePhone("010 1234 5678") // "01012345678"
 * normalizePhone("y\n01012345678\n") // "01012345678"
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '').trim();
}

/**
 * 전화번호 포맷 (하이픈 추가)
 * @param phone - 숫자만 있는 전화번호
 * @returns 포맷된 전화번호 (010-1234-5678)
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  
  if (normalized.length === 10) {
    // 010-123-4567
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  } else if (normalized.length === 11) {
    // 010-1234-5678
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  }
  
  return normalized;
}

/**
 * 전화번호 유효성 검사
 * @param phone - 검사할 전화번호
 * @returns 유효하면 true
 */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  
  // 한국 전화번호: 10자리 또는 11자리
  if (normalized.length < 10 || normalized.length > 11) {
    return false;
  }
  
  // 010, 011, 016, 017, 018, 019로 시작
  const validPrefixes = ['010', '011', '016', '017', '018', '019'];
  return validPrefixes.some(prefix => normalized.startsWith(prefix));
}
