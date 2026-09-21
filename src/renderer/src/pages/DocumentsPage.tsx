import type { ReactElement } from 'react'
import { useNav } from '@/app/navigation'
import { DocumentList } from '@/features/documents/DocumentList'
import { DocumentEditor } from '@/features/documents/DocumentEditor'
import { DocumentDetailView } from '@/features/documents/DocumentDetailView'

export function DocumentsPage(): ReactElement {
  const { location } = useNav()
  const view = location.params.documents ?? { view: 'list' }
  switch (view.view) {
    case 'new':
    case 'edit':
      return <DocumentEditor key={view.view === 'edit' ? `edit-${view.id}` : `new-${view.type}`} mode={view} />
    case 'detail':
      return <DocumentDetailView key={view.id} id={view.id} />
    default:
      return <DocumentList />
  }
}
