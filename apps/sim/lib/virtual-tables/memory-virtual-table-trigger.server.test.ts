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

import { fireMemoryTableTrigger } from '@/lib/virtual-tables/memory-virtual-table.server'

describe('fireMemoryTableTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFireTableTrigger.mockResolvedValue(undefined)
  })

  it('maps an updated memory record to a virtual-table update event', async () => {
    const previousRecord = {
      id: 'memory-1',
      workspaceId: 'workspace-1',
      key: 'conversation-1',
      data: [{ role: 'user', content: 'Hello' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    }
    const updatedRecord = {
      ...previousRecord,
      data: [...previousRecord.data, { role: 'assistant', content: 'Hi' }],
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }

    await fireMemoryTableTrigger(updatedRecord, previousRecord, 'request-1')

    expect(mockFireTableTrigger).toHaveBeenCalledWith(
      'system_memory_workspace-1',
      'Memory',
      'update',
      [
        expect.objectContaining({
          id: 'memory-1',
          data: expect.objectContaining({
            conversation_id: 'conversation-1',
            message_count: 2,
            updated_at: '2026-01-02T00:00:00.000Z',
          }),
        }),
      ],
      new Map([
        [
          'memory-1',
          expect.objectContaining({
            conversation_id: 'conversation-1',
            message_count: 1,
            updated_at: '2026-01-01T00:00:00.000Z',
          }),
        ],
      ]),
      expect.objectContaining({ columns: expect.any(Array) }),
      'request-1'
    )
  })

  it('maps a newly inserted memory record to a virtual-table insert event', async () => {
    const insertedRecord = {
      id: 'memory-1',
      workspaceId: 'workspace-1',
      key: 'conversation-1',
      data: [{ role: 'user', content: 'Hello' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    }

    await fireMemoryTableTrigger(insertedRecord, null, 'request-1')

    expect(mockFireTableTrigger).toHaveBeenCalledWith(
      'system_memory_workspace-1',
      'Memory',
      'insert',
      [expect.objectContaining({ id: 'memory-1' })],
      null,
      expect.any(Object),
      'request-1'
    )
  })

  it('does not emit table events for deleted memory records hidden from the virtual table', async () => {
    await fireMemoryTableTrigger(
      {
        id: 'memory-1',
        workspaceId: 'workspace-1',
        key: 'conversation-1',
        data: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      null,
      'request-1'
    )

    expect(mockFireTableTrigger).not.toHaveBeenCalled()
  })
})
