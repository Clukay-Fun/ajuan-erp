/**
 * 把替换后的图层强制缩放回替换前的边界。
 * Photoshop 以中心为锚分别缩放宽高，再用 dx/dy 把中心移回原中心。
 * 测试在 tests/psdExport.test.ts。插件用 require 加载本文件。
 */
function fitToBounds(oldBounds, newBounds) {
  const oldW = oldBounds.right - oldBounds.left
  const oldH = oldBounds.bottom - oldBounds.top
  const newW = newBounds.right - newBounds.left
  const newH = newBounds.bottom - newBounds.top
  if (!(oldW > 0 && oldH > 0 && newW > 0 && newH > 0)) {
    throw new Error('图层边界无效，无法按原位置缩放')
  }
  const oldCx = (oldBounds.left + oldBounds.right) / 2
  const oldCy = (oldBounds.top + oldBounds.bottom) / 2
  const newCx = (newBounds.left + newBounds.right) / 2
  const newCy = (newBounds.top + newBounds.bottom) / 2
  return {
    scaleX: oldW / newW,
    scaleY: oldH / newH,
    dx: oldCx - newCx,
    dy: oldCy - newCy
  }
}

module.exports = { fitToBounds }
