/**
 * 描述: 阶段 4 只读数据接口综合单元测试
 * 主要功能:
 *   - 验证 stats.getSummary 双周期环比与财务统计口径
 *   - 验证 stats.getDailySeries 逐日连续序列补零
 *   - 验证 stats.getLatestActivityDate 智能日期检索
 *   - 验证 stats.getProductHealth 可售天数与健康状态判定算法
 *   - 验证 documents.getPendingSummary 待处理草稿聚合
 *   - 验证 products.getLastPrices 最新进销单价获取
 */

import { describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { createOpening } from '../src/main/services/opening'
import { createDraft, confirmDocument, voidDocument, getPendingSummary } from '../src/main/services/documents'
import {
  getStatsSummary,
  getStatsDailySeries,
  getLatestActivityDate,
  getProductHealth
} from '../src/main/services/stats'
import { getLastPrices, updateProduct, createProduct } from '../src/main/services/products'

function setupFixtureDb() {
  const db = testDb()

  // 1. 录入期初：SKU 1，数量 100，单价 10 元 (1000 分)，日期 2026-03-01
  createOpening(db, {
    skuId: 1,
    quantity: 100,
    unitCostCents: 1000,
    docDate: '2026-03-01',
    note: '期初'
  })

  const makeDoc = (type: 'inbound' | 'outbound', date: string, qty: number, price: number) => {
    const draft = createDraft(db, {
      type,
      docDate: date,
      channelId: null,
      externalOrderNo: '',
      note: '',
      items: [{ skuId: 1, quantity: qty, unitPriceCents: price }]
    })
    return confirmDocument(db, draft.id)
  }

  // 2. 录入本期生效单据 (2026-03-10 ~ 2026-03-12)
  makeDoc('inbound', '2026-03-10', 50, 1200) // 进货 50 件 @ 12 元
  makeDoc('outbound', '2026-03-11', 20, 2500) // 出库 20 件 @ 25 元
  makeDoc('outbound', '2026-03-12', 10, 2500) // 出库 10 件 @ 25 元
  makeDoc('outbound', '2026-03-12', 5, 3000) // 出库 5 件 @ 30 元

  // 3. 录入被作废的单据（不应计入统计）
  const voided = makeDoc('outbound', '2026-03-12', 15, 2500)
  voidDocument(db, voided.id, '客户撤单')

  // 4. 录入未生效的草稿单据（不应计入财务与出入库统计）
  createDraft(db, {
    type: 'outbound',
    docDate: '2026-03-12',
    channelId: null,
    externalOrderNo: 'DRAFT-01',
    note: '未审核草稿',
    items: [{ skuId: 1, quantity: 99, unitPriceCents: 9999 }]
  })

  return db
}

// #region 1. getStatsSummary 财务与环比汇总测试

describe('stats.getSummary 汇总接口', () => {
  it('正确统计已生效单据，排除草稿与已作废单据', () => {
    const db = setupFixtureDb()

    // 统计 2026-03-10 至 2026-03-12 (共 3 天)
    const summary = getStatsSummary(db, {
      from: '2026-03-10',
      to: '2026-03-12'
    })

    // 出库数量：20 + 10 + 5 = 35 件（作废的 15 件与草稿 99 件均不计入）
    expect(summary.current.outQty).toBe(35)
    // 出库单数：3 笔已确认出库单
    expect(summary.current.outDocCount).toBe(3)
    // 出库金额：20*2500 + 10*2500 + 5*3000 = 50000 + 25000 + 15000 = 90000 分
    expect(summary.current.outAmountCents).toBe(90000)
    // 入库数量与金额：50 件 @ 1200 分 = 60000 分
    expect(summary.current.inQty).toBe(50)
    expect(summary.current.inAmountCents).toBe(60000)
    // 毛利大于 0 且毛利率在 0~1 之间
    expect(summary.current.profitCents).toBeGreaterThan(0)
    expect(summary.current.profitRate).toBeGreaterThan(0)
    expect(summary.current.profitRate).toBeLessThan(1)

    // 上一个等长周期 (2026-03-07 ~ 2026-03-09，该期无单据)
    expect(summary.previous.outQty).toBe(0)
    expect(summary.previous.outAmountCents).toBe(0)
  })
})

// #endregion

// #region 2. getStatsDailySeries 逐日连续序列测试

describe('stats.getDailySeries 逐日序列接口', () => {
  it('生成完整自然日序列，无业务的自然日全部补零', () => {
    const db = setupFixtureDb()

    // 查询 2026-03-09 到 2026-03-13 (共 5 天)
    const series = getStatsDailySeries(db, {
      from: '2026-03-09',
      to: '2026-03-13'
    })

    expect(series).toHaveLength(5)
    expect(series[0].date).toBe('2026-03-09')
    expect(series[0].inQty).toBe(0)
    expect(series[0].outQty).toBe(0)

    // 03-10 有入库
    expect(series[1].date).toBe('2026-03-10')
    expect(series[1].inQty).toBe(50)
    expect(series[1].outQty).toBe(0)

    // 03-11 有出库
    expect(series[2].date).toBe('2026-03-11')
    expect(series[2].outQty).toBe(20)

    // 03-12 有出库 (10 + 5 = 15 件)
    expect(series[3].date).toBe('2026-03-12')
    expect(series[3].outQty).toBe(15)

    // 03-13 无单据自动补零
    expect(series[4].date).toBe('2026-03-13')
    expect(series[4].inQty).toBe(0)
    expect(series[4].outQty).toBe(0)
  })
})

// #endregion

// #region 3. getLatestActivityDate 最新活动日期测试

describe('stats.getLatestActivityDate 最新活动日期', () => {
  it('正确返回已生效单据的最大日期', () => {
    const db = setupFixtureDb()
    const latest = getLatestActivityDate(db)
    expect(latest).toBe('2026-03-12')
  })

  it('全新空库上返回 null', () => {
    const emptyDb = testDb()
    const latest = getLatestActivityDate(emptyDb)
    expect(latest).toBeNull()
  })
})

// #endregion

// #region 4. getProductHealth 健康状态与可售天数测试

describe('stats.getProductHealth 库存健康度判定', () => {
  it('正确判定正常、预警、样本不足及停用状态', () => {
    const db = setupFixtureDb()

    const health = getProductHealth(db, 30, '2026-03-12')
    expect(health.length).toBeGreaterThan(0)

    const p1 = health.find((item) => item.productId === 1)
    expect(p1).toBeDefined()
    expect(p1?.name).toBe('电动车发光小饰品')
    expect(p1?.stock).toBeGreaterThan(0)
    // 出库单数 3 笔，满足可售天数统计样本
    expect(p1?.windowOutDocCount).toBe(3)
    expect(p1?.daysOfSupply).not.toBeNull()
  })

  it('停用商品状态直接判定为 inactive', () => {
    const db = setupFixtureDb()
    createProduct(db, {
      name: '备用商品',
      code: 'BACKUP-SKU',
      unit: '件',
      defaultCostCents: 100,
      defaultPriceCents: 200,
      lowStockThreshold: 10
    })
    // 停用商品 1（已有备用商品处于启用状态）
    updateProduct(db, 1, {
      name: '停用商品',
      code: 'DIS',
      unit: '件',
      defaultCostCents: 100,
      defaultPriceCents: 200,
      lowStockThreshold: 10,
      isActive: false
    })

    const health = getProductHealth(db, 30, '2026-03-12')
    const p1 = health.find((item) => item.productId === 1)
    expect(p1?.status).toBe('inactive')
  })

  const setThreshold = (db: ReturnType<typeof testDb>, threshold: number): void => {
    updateProduct(db, 1, {
      name: '电动车发光小饰品',
      code: 'FG001',
      unit: '件',
      defaultCostCents: 0,
      defaultPriceCents: 0,
      lowStockThreshold: threshold,
      isActive: true
    })
  }

  it('空库：没有库存判定为 out，可售天数为 null', () => {
    const p1 = getProductHealth(testDb(), 30, '2026-03-12').find((item) => item.productId === 1)
    expect(p1?.stock).toBe(0)
    expect(p1?.daysOfSupply).toBeNull()
    expect(p1?.status).toBe('out')
  })

  it('只有期初：样本不足，可售天数为 null，状态 ok', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 100, unitCostCents: 1000, docDate: '2026-03-01', note: '' })
    const p1 = getProductHealth(db, 30, '2026-03-12').find((item) => item.productId === 1)
    expect(p1?.daysOfSupply).toBeNull()
    expect(p1?.status).toBe('ok')
  })

  it('窗口内出库单少于 3 张时可售天数为 null', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 100, unitCostCents: 1000, docDate: '2026-03-01', note: '' })
    for (const date of ['2026-03-05', '2026-03-06']) {
      const d = createDraft(db, {
        type: 'outbound',
        docDate: date,
        channelId: null,
        externalOrderNo: '',
        note: '',
        items: [{ skuId: 1, quantity: 30, unitPriceCents: 2000 }]
      })
      confirmDocument(db, d.id)
    }
    const p1 = getProductHealth(db, 30, '2026-03-12').find((item) => item.productId === 1)
    expect(p1?.windowOutDocCount).toBe(2)
    expect(p1?.daysOfSupply).toBeNull()
  })

  it('可售天数不足 7 天判定为 critical，优先于低于预警', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 10, unitCostCents: 1000, docDate: '2026-03-01', note: '' })
    for (const date of ['2026-03-05', '2026-03-06', '2026-03-07']) {
      const d = createDraft(db, {
        type: 'outbound',
        docDate: date,
        channelId: null,
        externalOrderNo: '',
        note: '',
        items: [{ skuId: 1, quantity: 3, unitPriceCents: 2000 }]
      })
      confirmDocument(db, d.id)
    }
    setThreshold(db, 5)
    // 日均出库 9 / 30 = 0.3，库存 1 → floor(1 / 0.3) = 3 天
    const p1 = getProductHealth(db, 30, '2026-03-12').find((item) => item.productId === 1)
    expect(p1?.daysOfSupply).toBe(3)
    expect(p1?.status).toBe('critical')
  })

  it('库存不超过预警值判定为 low；作废单据不计入出库样本', () => {
    const db = setupFixtureDb()
    setThreshold(db, 200)
    const p1 = getProductHealth(db, 30, '2026-03-12').find((item) => item.productId === 1)
    // 期初 100 + 入库 50 − 出库 35 = 115；作废的 15 件已冲回
    expect(p1?.stock).toBe(115)
    expect(p1?.windowOutDocCount).toBe(3)
    // 日均 35 / 30，floor(115 / (35 / 30)) = 98
    expect(p1?.daysOfSupply).toBe(98)
    expect(p1?.status).toBe('low')
  })
})

// #endregion

// #region 5. documents.getPendingSummary 草稿待处理测试

describe('documents.getPendingSummary 待处理草稿聚合', () => {
  it('仅聚合草稿状态单据并按 ID 倒序排列', () => {
    const db = setupFixtureDb()

    const pending = getPendingSummary(db)
    expect(pending.draftCount).toBe(1)
    expect(pending.drafts).toHaveLength(1)
    expect(pending.drafts[0].note).toBe('未审核草稿')
    expect(pending.drafts[0].totalQuantity).toBe(99)
  })
})

// #endregion

// #region 6. products.getLastPrices 最新单价获取测试

describe('products.getLastPrices 历史价格获取', () => {
  it('返回最近一次已生效的入库进价与出库售价', () => {
    const db = setupFixtureDb()

    const prices = getLastPrices(db, [1])
    expect(prices['1']).toBeDefined()
    // 最近一次入库价为 1200 分
    expect(prices['1'].lastInboundPriceCents).toBe(1200)
    // 最近一次出库售价为 3000 分
    expect(prices['1'].lastOutboundPriceCents).toBe(3000)
  })
})

// #endregion
