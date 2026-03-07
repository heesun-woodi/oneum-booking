#!/bin/bash
# Vercel 배포 완료 확인 스크립트

COMMIT=$(git rev-parse HEAD | cut -c1-7)
MAX_WAIT=120  # 2분
ELAPSED=0

echo "🔍 배포 확인 중... (Commit: $COMMIT)"

while [ $ELAPSED -lt $MAX_WAIT ]; do
  # Vercel 최신 배포 URL 가져오기
  LATEST_URL=$(npx vercel ls --yes 2>/dev/null | head -1)
  
  # 배포 성공 여부 확인 (HTTP 200)
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LATEST_URL")
  
  if [ "$STATUS" = "200" ]; then
    echo "✅ 배포 완료! ($LATEST_URL)"
    exit 0
  fi
  
  echo "⏳ 대기 중... ($ELAPSED초 / $MAX_WAIT초)"
  sleep 10
  ELAPSED=$((ELAPSED + 10))
done

echo "⚠️ 타임아웃: 배포 확인 실패"
exit 1
