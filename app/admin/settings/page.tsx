'use client'

import { useState, useEffect } from 'react'
import { 
  getSpaceInfo, 
  updateSpaceInfo, 
  getGeneralRules, 
  updateGeneralRules,
  SpaceInfo,
  GeneralRules 
} from '@/app/actions/admin-settings'
import { PhotoManager } from './components/PhotoManager'

export default function AdminSettingsPage() {
  // 공간 정보
  const [spaces, setSpaces] = useState<SpaceInfo[]>([])
  const [editingSpace, setEditingSpace] = useState<string | null>(null)
  const [savingSpaces, setSavingSpaces] = useState(false)
  
  // 이용 규칙
  const [rules, setRules] = useState<GeneralRules | null>(null)
  const [editingRules, setEditingRules] = useState(false)
  const [savingRules, setSavingRules] = useState(false)
  
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

  // ===== 공간 정보 수정 =====
  const handleSpaceChange = (spaceId: string, field: keyof SpaceInfo, value: any) => {
    setSpaces(prev => prev.map(space => {
      if (space.id === spaceId) {
        return { ...space, [field]: value }
      }
      return space
    }))
  }

  const handleSpacePricingChange = (spaceId: string, field: 'member' | 'nonMember', value: string) => {
    setSpaces(prev => prev.map(space => {
      if (space.id === spaceId) {
        return { 
          ...space, 
          pricing: { ...space.pricing, [field]: value }
        }
      }
      return space
    }))
  }

  const handleSpaceListChange = (spaceId: string, field: 'facilities' | 'rules', index: number, value: string) => {
    setSpaces(prev => prev.map(space => {
      if (space.id === spaceId) {
        const newList = [...space[field]]
        newList[index] = value
        return { ...space, [field]: newList }
      }
      return space
    }))
  }

  const handleAddSpaceListItem = (spaceId: string, field: 'facilities' | 'rules') => {
    setSpaces(prev => prev.map(space => {
      if (space.id === spaceId) {
        return { ...space, [field]: [...space[field], ''] }
      }
      return space
    }))
  }

  const handleRemoveSpaceListItem = (spaceId: string, field: 'facilities' | 'rules', index: number) => {
    setSpaces(prev => prev.map(space => {
      if (space.id === spaceId) {
        const newList = space[field].filter((_, i) => i !== index)
        return { ...space, [field]: newList }
      }
      return space
    }))
  }

  const handleSaveSpace = async (spaceId: string) => {
    setSavingSpaces(true)
    try {
      const result = await updateSpaceInfo(spaces)
      if (result.success) {
        alert('공간 정보가 저장되었습니다.')
        setEditingSpace(null)
      } else {
        alert('저장 실패: ' + result.error)
      }
    } catch (e) {
      console.error(e)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSavingSpaces(false)
    }
  }

  // ===== 이용 규칙 수정 =====
  const handleRulesChange = (category: keyof GeneralRules, index: number, value: string) => {
    if (!rules) return
    setRules(prev => {
      if (!prev) return prev
      const newList = [...prev[category]]
      newList[index] = value
      return { ...prev, [category]: newList }
    })
  }

  const handleAddRule = (category: keyof GeneralRules) => {
    if (!rules) return
    setRules(prev => {
      if (!prev) return prev
      return { ...prev, [category]: [...prev[category], ''] }
    })
  }

  const handleRemoveRule = (category: keyof GeneralRules, index: number) => {
    if (!rules) return
    setRules(prev => {
      if (!prev) return prev
      const newList = prev[category].filter((_, i) => i !== index)
      return { ...prev, [category]: newList }
    })
  }

  const handleSaveRules = async () => {
    if (!rules) return
    setSavingRules(true)
    try {
      const result = await updateGeneralRules(rules)
      if (result.success) {
        alert('이용 규칙이 저장되었습니다.')
        setEditingRules(false)
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

  // ===== 리스트 편집 컴포넌트 =====
  const ListEditor = ({ 
    items, 
    onChange, 
    onAdd, 
    onRemove,
    placeholder = '항목 입력...'
  }: {
    items: string[]
    onChange: (index: number, value: string) => void
    onAdd: () => void
    onRemove: (index: number) => void
    placeholder?: string
  }) => (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => onRemove(index)}
            className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="삭제"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
      >
        + 항목 추가
      </button>
    </div>
  )

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

      {/* 공간 정보 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">🏠 공간 정보</h2>
        </div>
        
        {spaces.map((space) => {
          const isEditing = editingSpace === space.id
          
          return (
            <div key={space.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              {/* 헤더 */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={space.name}
                        onChange={(e) => handleSpaceChange(space.id, 'name', e.target.value)}
                        className="text-lg font-bold px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        value={space.description}
                        onChange={(e) => handleSpaceChange(space.id, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={2}
                      />
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{space.name}</h3>
                      <p className="text-sm text-gray-600">{space.description}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {isEditing ? (
                    <input
                      type="text"
                      value={space.capacity}
                      onChange={(e) => handleSpaceChange(space.id, 'capacity', e.target.value)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                    />
                  ) : (
                    <span className={`px-3 py-1 text-sm font-medium rounded ${
                      space.id === 'nolter' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {space.capacity}
                    </span>
                  )}
                  <button
                    onClick={() => isEditing ? handleSaveSpace(space.id) : setEditingSpace(space.id)}
                    disabled={savingSpaces}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isEditing 
                        ? 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isEditing ? (savingSpaces ? '저장 중...' : '저장') : '편집'}
                  </button>
                  {isEditing && (
                    <button
                      onClick={() => {
                        setEditingSpace(null)
                        loadSettings() // 취소 시 원래 값 복원
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 시설 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">🔧 시설</h4>
                  {isEditing ? (
                    <ListEditor
                      items={space.facilities}
                      onChange={(index, value) => handleSpaceListChange(space.id, 'facilities', index, value)}
                      onAdd={() => handleAddSpaceListItem(space.id, 'facilities')}
                      onRemove={(index) => handleRemoveSpaceListItem(space.id, 'facilities', index)}
                      placeholder="시설명 입력..."
                    />
                  ) : (
                    <ul className="space-y-2">
                      {space.facilities.map((facility: string, index: number) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <span className="mr-2 mt-0.5">•</span>
                          <span className="flex-1 break-words">{facility}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                {/* 이용 규칙 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">📋 이용 규칙</h4>
                  {isEditing ? (
                    <ListEditor
                      items={space.rules}
                      onChange={(index, value) => handleSpaceListChange(space.id, 'rules', index, value)}
                      onAdd={() => handleAddSpaceListItem(space.id, 'rules')}
                      onRemove={(index) => handleRemoveSpaceListItem(space.id, 'rules', index)}
                      placeholder="규칙 입력..."
                    />
                  ) : (
                    <ul className="space-y-2">
                      {space.rules.map((rule: string, index: number) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <span className="mr-2 mt-0.5">•</span>
                          <span className="flex-1 break-words">{rule}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                {/* 운영 시간 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">🕐 운영 시간</h4>
                  {isEditing ? (
                    <input
                      type="text"
                      value={space.hours}
                      onChange={(e) => handleSpaceChange(space.id, 'hours', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-sm text-gray-600 break-words">{space.hours}</p>
                  )}
                </div>
                
                {/* 요금 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">💰 이용 요금</h4>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 w-16 flex-shrink-0">회원:</span>
                        <input
                          type="text"
                          value={space.pricing.member}
                          onChange={(e) => handleSpacePricingChange(space.id, 'member', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 w-16 flex-shrink-0">비회원:</span>
                        <input
                          type="text"
                          value={space.pricing.nonMember}
                          onChange={(e) => handleSpacePricingChange(space.id, 'nonMember', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 break-words">
                        <span className="font-medium">회원:</span> {space.pricing.member}
                      </p>
                      <p className="text-sm text-gray-600 break-words">
                        <span className="font-medium">비회원:</span> {space.pricing.nonMember}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* 이용 규칙 */}
      {rules && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">📜 이용 규칙</h2>
            <div className="flex gap-2">
              {editingRules ? (
                <>
                  <button
                    onClick={handleSaveRules}
                    disabled={savingRules}
                    className="px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
                  >
                    {savingRules ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingRules(false)
                      loadSettings()
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditingRules(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  편집
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 예약 규정 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 예약 규정</h3>
              {editingRules ? (
                <ListEditor
                  items={rules.booking}
                  onChange={(index, value) => handleRulesChange('booking', index, value)}
                  onAdd={() => handleAddRule('booking')}
                  onRemove={(index) => handleRemoveRule('booking', index)}
                />
              ) : (
                <ul className="space-y-2.5">
                  {rules.booking.map((rule: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="mr-2 mt-0.5">•</span>
                      <span className="flex-1 break-words leading-relaxed">{rule}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            {/* 취소 및 환불 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🔄 취소 및 환불</h3>
              {editingRules ? (
                <ListEditor
                  items={rules.cancellation}
                  onChange={(index, value) => handleRulesChange('cancellation', index, value)}
                  onAdd={() => handleAddRule('cancellation')}
                  onRemove={(index) => handleRemoveRule('cancellation', index)}
                />
              ) : (
                <ul className="space-y-2.5">
                  {rules.cancellation.map((rule: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="mr-2 mt-0.5">•</span>
                      <span className="flex-1 break-words leading-relaxed">{rule}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            {/* 입금 안내 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">💳 입금 안내</h3>
              {editingRules ? (
                <ListEditor
                  items={rules.payment}
                  onChange={(index, value) => handleRulesChange('payment', index, value)}
                  onAdd={() => handleAddRule('payment')}
                  onRemove={(index) => handleRemoveRule('payment', index)}
                />
              ) : (
                <ul className="space-y-2.5">
                  {rules.payment.map((rule: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="mr-2 mt-0.5">•</span>
                      <span className="flex-1 break-words leading-relaxed">{rule}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            {/* 이용 수칙 */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">⚠️ 이용 수칙</h3>
              {editingRules ? (
                <ListEditor
                  items={rules.usage}
                  onChange={(index, value) => handleRulesChange('usage', index, value)}
                  onAdd={() => handleAddRule('usage')}
                  onRemove={(index) => handleRemoveRule('usage', index)}
                />
              ) : (
                <ul className="space-y-2.5">
                  {rules.usage.map((rule: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="mr-2 mt-0.5">•</span>
                      <span className="flex-1 break-words leading-relaxed">{rule}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
