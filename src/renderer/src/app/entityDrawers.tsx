/**
 * 描述: 全局实体抽屉入口 (useEntityDrawers)
 * 主要功能:
 *   - 任何地方（页面、命令面板、侧栏、其他抽屉）都能按 id 打开商品、单据等抽屉
 *   - 抽屉内写入成功后统一 emitDataChanged()，底下的页面自行刷新
 */

import { useCallback, useMemo } from 'react'
import type { DocumentType } from '@shared/types'
import { useDrawer } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { emitDataChanged } from '@/lib/dataEvents'
import { ProductDrawerContent } from '@/features/products/ProductDrawerContent'
import { DocumentDetailView } from '@/features/documents/DocumentDetailView'
import { AdjustmentDrawerContent } from '@/features/adjustments/AdjustmentDrawerContent'
import { ImportDialog } from '@/features/csv/ImportDialog'
import { useNav } from './navigation'

export interface NewDocumentOptions {
  /** 预先带出的商品（命令面板 ⌘Enter、商品抽屉） */
  productId?: number
}

export interface EntityDrawers {
  openProduct: (productId: number) => Promise<void>
  newProduct: () => void
  openDocument: (documentId: number) => void
  newDocument: (type: Extract<DocumentType, 'inbound' | 'outbound'>, options?: NewDocumentOptions) => void
  editDocument: (documentId: number) => void
  openAdjustment: (productId?: number) => void
  openImport: () => void
}

export function useEntityDrawers(): EntityDrawers {
  const { openDrawer, closeDrawer } = useDrawer()
  const { navigate } = useNav()
  const toast = useToast()

  const openProduct = useCallback(
    async (productId: number) => {
      try {
        const product = await unwrap(window.ajuan.products.getById(productId))
        openDrawer({
          id: `product-${productId}`,
          title: product.name,
          size: 'md',
          content: <ProductDrawerContent initialMode="view" product={product} onDataChanged={emitDataChanged} />
        })
      } catch (err) {
        toast(errorMessage(err), 'error')
      }
    },
    [openDrawer, toast]
  )

  const newProduct = useCallback(() => {
    openDrawer({
      id: 'product-new',
      title: '新建商品',
      size: 'md',
      content: <ProductDrawerContent initialMode="create" product={null} onDataChanged={emitDataChanged} />
    })
  }, [openDrawer])

  const openDocument = useCallback(
    (documentId: number) => {
      openDrawer({
        id: `document-${documentId}`,
        title: '单据',
        size: 'md',
        content: ({ close }) => (
          <DocumentDetailView
            id={documentId}
            onChanged={(changedId) => {
              emitDataChanged()
              if (changedId === null) close(true)
            }}
            onEdit={(editId) => {
              close(true)
              navigate('documents', { documents: { view: 'edit', id: editId } })
            }}
          />
        )
      })
    },
    [openDrawer, navigate]
  )

  const newDocument = useCallback(
    // 阶段 7 改为开单抽屉；在此之前沿用单据页的开单表单
    (type: Extract<DocumentType, 'inbound' | 'outbound'>, _options: NewDocumentOptions = {}) => {
      closeDrawer(true)
      navigate('documents', { documents: { view: 'new', type } })
    },
    [closeDrawer, navigate]
  )

  const editDocument = useCallback(
    (documentId: number) => {
      closeDrawer(true)
      navigate('documents', { documents: { view: 'edit', id: documentId } })
    },
    [closeDrawer, navigate]
  )

  const openAdjustment = useCallback(
    (productId?: number) => {
      openDrawer({
        id: 'adjustment-new',
        title: '库存调整',
        size: 'sm',
        content: <AdjustmentDrawerContent initialProductId={productId} />
      })
    },
    [openDrawer]
  )

  const openImport = useCallback(() => {
    openDrawer({
      id: 'csv-import',
      title: '导入 CSV',
      size: 'md',
      content: ({ close }) => <ImportDialog open embedded onClose={() => close()} onImported={emitDataChanged} />
    })
  }, [openDrawer])

  return useMemo(
    () => ({ openProduct, newProduct, openDocument, newDocument, editDocument, openAdjustment, openImport }),
    [openProduct, newProduct, openDocument, newDocument, editDocument, openAdjustment, openImport]
  )
}
