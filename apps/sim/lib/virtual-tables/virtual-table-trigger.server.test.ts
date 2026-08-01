/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFireTableTrigger } = vi.hoisted(() => ({
  mockFireTableTrigger: vi.fn(),
}))

vi.mock('@/lib/table/trigger', () => ({
  fireTableTrigger: mockFireTableTrigger,
}))

import type { RowData, TableDefinition, TableRow } from '@/lib/table/types'
import { fireVirtualTableTrigger } from '@/lib/virtual-tables/virtual-table-trigger.server'

describe('fireVirtualTableTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFireTableTrigger.mockResolvedValue(undefined)
  })

  it('forwards a virtual-table mutation through the shared table trigger pipeline', async () => {
    const table: Pick<TableDefinition, 'id' | 'name' | 'schema'> = {
      id: 'virtual-1',
      name: 'Virtual records',
      schema: { columns: [{ id: 'status', name: 'Status', type: 'string' }] },
    }
    const row: TableRow = {
      id: 'row-1',
      data: { status: 'closed' },
      executions: {},
      position: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }
    const previousRows = new Map<string, RowData>([['row-1', { status: 'open' }]])

    await fireVirtualTableTrigger({
      table,
      eventType: 'update',
      rows: [row],
      previousRows,
      requestId: 'request-1',
    })

    expect(mockFireTableTrigger).toHaveBeenCalledWith(
      table.id,
      table.name,
      'update',
      [row],
      previousRows,
      table.schema,
      'request-1'
    )
  })
})
