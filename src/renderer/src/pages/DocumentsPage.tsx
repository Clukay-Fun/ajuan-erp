import type { ReactElement } from 'react'
import { useNav } from '@/app/navigation'
import { DocumentList } from '@/features/documents/DocumentList'

export function DocumentsPage(): ReactElement {
  const { location } = useNav()
  const view = location.params.documents ?? { view: 'list' }
  switch (view.view) {
    case 'new':
      return <DocumentList key={`new-${view.type}-${location.seq}`} initialEditor={{ view: 'new', type: view.type }} />
    case 'edit':
      return <DocumentList key={`edit-${view.id}`} initialEditor={{ view: 'edit', id: view.id }} />
    case 'detail':
      return <DocumentList initialSelectedId={view.id} />
    default:
      return <DocumentList />
  }
}
