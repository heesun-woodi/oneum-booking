/**
 * 의존성 없는 PWA 아이콘 생성기 (placeholder).
 * 온음 브랜드 컬러 배경 + 중앙 원형 마크. 실제 로고로 교체 권장.
 * 실행: node scripts/gen-icons.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const BG = [31, 138, 112] // #1F8A70 (theme)
const FG = [255, 255, 255]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function makePng(size) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.3
  const rowBytes = size * 4
  const raw = Buffer.alloc((rowBytes + 1) * size)

  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy)
      const inside = dist <= r
      const [rr, gg, bb] = inside ? FG : BG
      const off = y * (rowBytes + 1) + 1 + x * 4
      raw[off] = rr
      raw[off + 1] = gg
      raw[off + 2] = bb
      raw[off + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = path.join(__dirname, '..', 'public')
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]
for (const [name, size] of targets) {
  fs.writeFileSync(path.join(outDir, name), makePng(size))
  console.log('wrote', name, size)
}
