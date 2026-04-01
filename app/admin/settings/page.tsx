'use client'

import { useState, useEffect } from 'react'
import { getSpaceInfo, getGeneralRules } from '@/app/actions/admin-settings'
import { getSetting, updateSetting } from '@/app/actions/settings'
import { PhotoManager } from './components/PhotoManager'

export default function AdminSettingsPage() {
  const [spaces, setSpaces] = useState<any[]>([])
  const [rules, setRules] = useState<any>(null)
  const [usageRules, setUsageRules] = useState<string>('')
  const [savingRules, setSavingRules] = useState(false)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadSettings()
  }, [])
  
  const loadSettings = async () => {
    setLoading(true)
    
    // Get existing spaces & rules
    const spaceResult = await getSpaceInfo()
    if (spaceResult.success) {
      setSpaces(spaceResult.spaces)
    }
    
    const rulesResult = await getGeneralRules()
    if (rulesResult.success) {
      setRules(rulesResult.rules)
    }
    
    // Get DB settings
    const rules = await getSetting('usage_rules')
    if (rules) {
      setUsageRules(rules)
    }
    
    setLoading(false)
  }

  const handleSaveRules = async () => {
    setSavingRules(true)
    try {
      const result = await updateSetting('usage_rules', usageRules)
      if (result.success) {
        alert('이용 규칙 설정이 저장되었습니다.')
      } else {
        alert('저장 실패: ' + result.error)
      }
    } catch (e) {
      console.error(e)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSavingRules(false)
    }
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">⚙️ 설정</h1>
      
      {/* 공간 사진 관리 */}
      <PhotoManager />

      {/* 사이트 설정 (DB 연동) */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">🌐 사이트 설정</h2>
        
        {/* 이용 규칙 */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">메인 페이지 이용 규칙</label>
          <p className="text-xs text-gray-500 mb-2">
            💡 마크다운 형식으로 작성하세요. ## 제목으로 각 섹션을 구분합니다. (예: ## 🗓 예약 규정)
          </p>
          <textarea
            value={usageRules}
            onChange={(e) => setUsageRules(e.target.value)}
            rows={16}
            className="w-full p-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="## 🗓 예약 규정

- 예약은 1일 전까지 가능합니다 (당일 예약 불가)
- 회원은 월 8시간까지 무료 이용
..."
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSaveRules}
              disabled={savingRules}
              className="px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
            >
              {savingRules ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 공간 정보 */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">🏠 공간 정보 (Read-Only)</h2>
        
        {spaces.map((space) => (
          <div key={space.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{space.name}</h3>
                <p className="text-sm text-gray-600">{space.description}</p>
              </div>
              <span className={`px-3 py-1 text-sm font-medium rounded ${
                space.id === 'nolter' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-purple-100 text-purple-700'
              }`}>
                {space.capacity}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 시설 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">🔧 시설</h4>
                <ul className="space-y-1">
                  {space.facilities.map((facility: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-center">
                      <span className="mr-2">•</span>
                      {facility}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* 이용 규칙 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 이용 규칙</h4>
                <ul className="space-y-1">
                  {space.rules.map((rule: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-center">
                      <span className="mr-2">•</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* 운영 시간 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">🕐 운영 시간</h4>
                <p className="text-sm text-gray-600">{space.hours}</p>
              </div>
              
              {/* 요금 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">💰 이용 요금</h4>
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">회원:</span> {space.pricing.member}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">비회원:</span> {space.pricing.nonMember}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* 이용 규칙 */}
      {rules && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">📜 이용 규칙 (Read-Only)</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 예약 규정 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">📅 예약 규정</h3>
              <ul className="space-y-2">
                {rules.booking.map((rule: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="mr-2 mt-1">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* 취소 및 환불 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🔄 취소 및 환불</h3>
              <ul className="space-y-2">
                {rules.cancellation.map((rule: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="mr-2 mt-1">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* 입금 안내 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">💳 입금 안내</h3>
              <ul className="space-y-2">
                {rules.payment.map((rule: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="mr-2 mt-1">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* 이용 수칙 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">⚠️ 이용 수칙</h3>
              <ul className="space-y-2">
                {rules.usage.map((rule: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="mr-2 mt-1">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
