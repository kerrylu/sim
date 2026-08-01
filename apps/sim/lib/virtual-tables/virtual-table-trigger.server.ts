import { fireTableTrigger } from '@/lib/table/trigger'
import type { RowData, TableDefinition, TableRow } from '@/lib/table/types'

export interface VirtualTableTriggerEvent {
  table: Pick<TableDefinition, 'id' | 'name' | 'schema'>
  eventType: 'insert' | 'update'
  rows: TableRow[]
  previousRows: Map<string, RowData> | null
  requestId: string
}

export async function fireVirtualTableTrigger({
  table,
  eventType,
  rows,
  previousRows,
  requestId,
}: VirtualTableTriggerEvent): Promise<void> {
  await fireTableTrigger(
    table.id,
    table.name,
    eventType,
    rows,
    previousRows,
    table.schema,
    requestId
  )
}
