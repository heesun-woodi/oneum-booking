'use client'

import { useState, useEffect } from 'react'
import { getSpaceInfo, getGeneralRules } from '@/app/actions/admin-settings'

export default function AdminSettingsPage() {
  const [spaces, setSpaces] = useState<any[]>([])
  const [rules, setRules] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadSettings()
  }, [])
  
  const loadSettings = async () => {
    setLoading(true)
    
    const spaceResult = await getSpaceInfo()
    if (spaceResult.success) {
      setSpaces(spaceResult.spaces)
    }
    
    const rulesResult = await getGeneralRules()
    if (rulesResult.success) {
      setRules(rulesResult.rules)
    }
    
    setLoading(false)
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
      
      {/* 공간 정보 */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">🏠 공간 정보</h2>
        
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
          <h2 className="text-xl font-semibold text-gray-900">📜 이용 규칙</h2>
          
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
      
      {/* 시스템 정보 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 시스템 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">버전</p>
            <p className="text-lg font-semibold text-gray-900">Phase 5</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">배포 환경</p>
            <p className="text-lg font-semibold text-gray-900">Production</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">최종 업데이트</p>
            <p className="text-lg font-semibold text-gray-900">2026-03-30</p>
          </div>
        </div>
      </div>
    </div>
  )
}
