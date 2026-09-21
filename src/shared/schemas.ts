import { z } from 'zod'

// 表单、IPC、CSV 共用的校验规则。

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), '日期无效')

export const centsInt = z.number().int('金额精度到分').min(0, '金额不能为负')
export const qtyInt = z.number().int('数量必须是整数')

export const productUpdateSchema = z.object({
  code: z.string().trim().min(1, '编码不能为空').max(32, '编码过长'),
  name: z.string().trim().min(1, '名称不能为空').max(64, '名称过长'),
  unit: z.string().trim().min(1, '单位不能为空').max(8, '单位过长'),
  defaultCostCents: centsInt,
  defaultPriceCents: centsInt,
  lowStockThreshold: z.number().int().min(0, '预警值不能为负')
})
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

export const openingStockSchema = z.object({
  skuId: z.number().int().positive(),
  quantity: qtyInt.min(1, '期初数量至少为 1'),
  unitCostCents: centsInt,
  docDate: dateString,
  note: z.string().trim().max(200, '备注过长').default('')
})
export type OpeningStockInput = z.infer<typeof openingStockSchema>
