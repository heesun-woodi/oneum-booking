'use client'

import { useState, useEffect } from 'react'

interface PrepaidProduct {
  id: string
  name: string
  description: string
  price: number
  regular_price: number  // API 응답 필드명과 일치
  hours: number          // API 응답 필드명과 일치
  validity_months: number
}

interface PrepaidPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  userSession: {
    isLoggedIn: boolean
    household: string
    name: string
    phone: string
    userId?: string
  }
  onLoginClick: () => void
  onSignupClick: () => void
}

export function PrepaidPurchaseModal({
  isOpen,
  onClose,
  userSession,
  onLoginClick,
  onSignupClick,
}: PrepaidPurchaseModalProps) {
  const [products, setProducts] = useState<PrepaidProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 상품 목록 조회
  useEffect(() => {
    if (isOpen) {
      fetchProducts()
    }
  }, [isOpen])

  const fetchProducts = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/prepaid/products')
      const data = await response.json()

      if (data.success) {
        setProducts(data.products || [])
      } else {
        setError(data.error || '상품을 불러올 수 없습니다.')
      }
    } catch (err) {
      console.error('상품 조회 오류:', err)
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  // 구매 신청
  const handlePurchase = async (productId: string) => {
    console.log('🛒 [PURCHASE] handlePurchase 실행됨')
    console.log('🛒 [PURCHASE] productId:', productId)
    console.log('🛒 [PURCHASE] userSession:', userSession)
    console.log('🛒 [PURCHASE] userSession.isLoggedIn:', userSession.isLoggedIn)
    console.log('🛒 [PURCHASE] userSession.userId:', userSession.userId)
    
    if (!userSession.isLoggedIn || !userSession.userId) {
      console.warn('⚠️ [PURCHASE] 로그인 필요 - isLoggedIn:', userSession.isLoggedIn, ', userId:', userSession.userId)
      alert('로그인이 필요합니다.')
      return
    }

    console.log('🚀 [PURCHASE] API 호출 시작')
    setIsPurchasing(true)

    try {
      const requestBody = {
        product_id: productId,
        user_id: userSession.userId,
      }
      console.log('📤 [PURCHASE] Request body:', requestBody)
      
      const response = await fetch('/api/prepaid/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      console.log('📥 [PURCHASE] Response status:', response.status)
      const data = await response.json()
      console.log('📥 [PURCHASE] Response data:', data)

      if (data.success) {
        alert(
          `${data.message}\n\n💰 입금 안내\n계좌: 카카오뱅크 7979-72-56275 (정상은)\n금액: ${products[0]?.price.toLocaleString()}원\n예약자명으로 입금해주세요.`
        )
        onClose()
        console.log('✅ [PURCHASE] 구매 완료')
      } else {
        console.error('❌ [PURCHASE] 구매 실패:', data.error)
        alert(`구매 실패: ${data.error}`)
      }
    } catch (err) {
      console.error('💥 [PURCHASE] 예외 발생:', err)
      alert('구매 신청 중 오류가 발생했습니다.')
    } finally {
      setIsPurchasing(false)
      console.log('🏁 [PURCHASE] handlePurchase 종료')
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-2xl font-bold text-gray-900">🎟️ 선불권 구매</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <p className="mt-4 text-gray-600">상품을 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 font-medium">{error}</p>
              <button
                onClick={fetchProducts}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                다시 시도
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">현재 판매 중인 상품이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 상품 카드 */}
              {products.map((product) => {
                const discountRate = Math.round(
                  ((product.regular_price - product.price) / product.regular_price) * 100
                )
                
                return (
                  <div
                    key={product.id}
                    className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-200"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-purple-900">{product.name}</h3>
                        <p className="text-sm text-purple-700 mt-1">{product.description}</p>
                      </div>
                      <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {discountRate}% 할인
                      </span>
                    </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-purple-900">
                        {product.price.toLocaleString()}원
                      </span>
                      <span className="text-lg text-gray-500 line-through">
                        {product.regular_price.toLocaleString()}원
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-gray-600 text-xs mb-1">구성</p>
                        <p className="font-semibold text-gray-900">1시간 × {product.hours}회</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-gray-600 text-xs mb-1">유효기간</p>
                        <p className="font-semibold text-gray-900">구매 후 {product.validity_months}개월</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-3 text-sm">
                      <p className="text-gray-700">
                        <span className="font-semibold">💡 혜택:</span>{' '}
                        {(product.regular_price - product.price).toLocaleString()}원 할인
                      </p>
                    </div>
                  </div>

                  {/* 안내 메시지 */}
                  <div className="bg-white rounded-lg p-4 mb-6 space-y-2 text-sm">
                    <p className="text-gray-700">
                      <span className="font-semibold">📋 구매 안내:</span>
                    </p>
                    <ul className="space-y-1 text-gray-600 ml-4">
                      <li>• {userSession.isLoggedIn ? '구매 신청 후 입금 안내 메시지를 받으실 수 있습니다' : '로그인한 회원만 구매 가능합니다'}</li>
                      <li>• 입금 확인 후 바로 사용 가능합니다</li>
                      <li>• 놀터/방음실 모두 사용 가능합니다</li>
                    </ul>
                  </div>

                  {/* 버튼 */}
                  {userSession.isLoggedIn ? (
                    <button
                      onClick={() => handlePurchase(product.id)}
                      disabled={isPurchasing}
                      className="w-full py-4 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
                    >
                      {isPurchasing ? '처리 중...' : '🎟️ 구매 신청하기'}
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          onClose()
                          onSignupClick()
                        }}
                        className="py-4 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-colors"
                      >
                        회원가입
                      </button>
                      <button
                        onClick={() => {
                          onClose()
                          onLoginClick()
                        }}
                        className="py-4 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
                      >
                        로그인
                      </button>
                    </div>
                  )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
