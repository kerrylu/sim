/**
 * @vitest-environment node
 */
import {
  dbChainMockFns,
  flattenMockConditions,
  queueTableRows,
  resetDbChainMock,
  schemaMock,
} from '@sim/testing'
import { sql as drizzleSql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBuildFilterClause, mockBuildPredicateClause, mockBuildSortClause } = vi.hoisted(() => ({
  mockBuildFilterClause: vi.fn(() => ({ type: 'filter' })),
  mockBuildPredicateClause: vi.fn(() => ({ type: 'predicate' })),
  mockBuildSortClause: vi.fn(() => ({ type: 'sort' })),
}))

vi.mock('@/lib/table/sql', () => ({
  buildFilterClause: mockBuildFilterClause,
  buildPredicateClause: mockBuildPredicateClause,
  buildSortClause: mockBuildSortClause,
}))

vi.mock('drizzle-orm', () => {
  const operator = (type: string) =>
    vi.fn((...values: unknown[]) => ({ type, values, left: values[0], right: values[1] }))
  const expression = () => ({
    type: 'sql',
    mapWith: vi.fn(() => expression()),
    as: vi.fn(() => ({ type: 'sql' })),
  })
  const sql = vi.fn(expression)

  return {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    count: operator('count'),
    desc: operator('desc'),
    eq: operator('eq'),
    isNull: operator('isNull'),
    lt: operator('lt'),
    max: operator('max'),
    or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
    sql,
  }
})

import {
  getMemoryTableDefinition,
  queryMemoryTableRows,
} from '@/lib/virtual-tables/memory-virtual-table.server'

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')
const UPDATED_AT = new Date('2026-01-02T00:00:00.000Z')

describe('Memory virtual table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('builds the synthetic definition from workspace metadata and a bounded aggregate', async () => {
    queueTableRows(schemaMock.workspace, [
      {
        id: 'workspace-1',
        ownerId: 'user-1',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      },
    ])
    queueTableRows(schemaMock.memory, [
      { rowCount: 2, lastMemoryUpdatedAt: new Date('2026-01-03T00:00:00.000Z') },
    ])

    const definition = await getMemoryTableDefinition('workspace-1')

    expect(definition).toMatchObject({
      id: 'system_memory_workspace-1',
      workspaceId: 'workspace-1',
      rowCount: 2,
      name: 'Memory',
    })
  })

  it('returns null when the workspace does not exist', async () => {
    queueTableRows(schemaMock.workspace, [])
    queueTableRows(schemaMock.memory, [])

    await expect(getMemoryTableDefinition('workspace-missing')).resolves.toBeNull()
  })

  it('casts JSON object keys so Postgres can infer bound parameter types', async () => {
    queueTableRows(schemaMock.memory, [])

    await queryMemoryTableRows({ workspaceId: 'workspace-1', includeTotal: false })

    const jsonObjectCall = vi
      .mocked(drizzleSql)
      .mock.calls.find(([strings]) => Array.from(strings).join('').includes('jsonb_build_object'))
    expect(Array.from(jsonObjectCall?.[0] ?? []).join('')).toContain('::text')
  })

  it.each([
    { filter: { transcript: { $contains: 'hello' } } },
    { sort: { transcript: 'asc' as const } },
  ])('rejects transcript filtering and sorting before reading Memory rows', async (options) => {
    await expect(queryMemoryTableRows({ workspaceId: 'workspace-1', ...options })).rejects.toThrow(
      'Transcript filtering and sorting are not supported for this table'
    )
    expect(dbChainMockFns.select).not.toHaveBeenCalled()
  })

  it('filters metadata with nested predicates and counts the filtered view', async () => {
    queueTableRows(schemaMock.memory, [])
    queueTableRows(schemaMock.memory, [{ value: 0 }])

    await queryMemoryTableRows({
      workspaceId: 'workspace-1',
      predicate: {
        all: [
          { field: 'conversation_id', op: 'contains', value: 'customer' },
          { field: 'message_count', op: 'gte', value: 2 },
        ],
      },
      includeTotal: true,
    })

    expect(mockBuildPredicateClause).toHaveBeenCalledWith(
      {
        all: [
          { field: 'conversation_id', op: 'contains', value: 'customer' },
          { field: 'message_count', op: 'gte', value: 2 },
        ],
      },
      'memory_rows',
      expect.any(Array)
    )
    const candidateConditions = flattenMockConditions(dbChainMockFns.where.mock.calls[0]?.[0])
    const countConditions = flattenMockConditions(dbChainMockFns.where.mock.calls[1]?.[0])
    expect(candidateConditions).toContainEqual({ type: 'predicate' })
    expect(countConditions).toContainEqual({ type: 'predicate' })
  })

  it('sorts metadata with a deterministic tie-breaker and disables keyset pagination', async () => {
    queueTableRows(schemaMock.memory, [
      {
        id: 'memory-1',
        key: 'conversation-1',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        data: [{ role: 'user', content: 'Hello' }],
        messageCount: 2,
      },
      {
        id: 'memory-2',
        key: 'conversation-2',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        data: [{ role: 'user', content: 'Second' }],
        messageCount: 1,
      },
    ])
    const result = await queryMemoryTableRows({
      workspaceId: 'workspace-1',
      sort: { message_count: 'asc' },
      limit: 1,
      includeTotal: false,
    })

    expect(dbChainMockFns.orderBy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sort' }),
      expect.objectContaining({ type: 'desc', left: 'id' })
    )
    expect(mockBuildSortClause).toHaveBeenCalledWith(
      { message_count: 'asc' },
      'memory_rows',
      expect.any(Array)
    )
    expect(result.keysetValid).toBe(false)
  })

  it('returns complete transcripts directly from a limited page', async () => {
    queueTableRows(schemaMock.memory, [
      {
        id: 'memory-2',
        key: 'conversation-2',
        createdAt: CREATED_AT,
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
        data: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
        messageCount: 2,
      },
      {
        id: 'memory-1',
        key: 'conversation-1',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        data: [{ role: 'user', content: 'First' }],
        messageCount: 1,
      },
    ])
    queueTableRows(schemaMock.memory, [{ value: 3 }])
    const result = await queryMemoryTableRows({
      workspaceId: 'workspace-1',
      limit: 2,
      offset: 0,
      includeTotal: true,
    })

    expect(result).toMatchObject({
      totalCount: 3,
      keysetValid: true,
    })
    expect(result.rows.map((row) => row.data)).toEqual([
      {
        conversation_id: 'conversation-2',
        transcript: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
        message_count: 2,
        created_at: CREATED_AT.toISOString(),
        updated_at: '2026-01-03T00:00:00.000Z',
      },
      {
        conversation_id: 'conversation-1',
        transcript: [{ role: 'user', content: 'First' }],
        message_count: 1,
        created_at: CREATED_AT.toISOString(),
        updated_at: UPDATED_AT.toISOString(),
      },
    ])

    const conditions = flattenMockConditions(dbChainMockFns.where.mock.calls[0]?.[0])
    expect(conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'eq', left: 'workspaceId', right: 'workspace-1' }),
        expect.objectContaining({ type: 'isNull', left: 'deletedAt' }),
      ])
    )
  })

  it('returns an empty page', async () => {
    queueTableRows(schemaMock.memory, [])

    await expect(
      queryMemoryTableRows({
        workspaceId: 'workspace-1',
        limit: 100,
        offset: 0,
        includeTotal: false,
      })
    ).resolves.toEqual({
      rows: [],
      totalCount: null,
      keysetValid: true,
    })

    expect(dbChainMockFns.select).toHaveBeenCalledTimes(2)
  })

  it('supports an initial offset and a subsequent keyset page', async () => {
    const candidate = {
      id: 'memory-1',
      key: 'conversation-1',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      data: [{ role: 'user', content: 'Hello' }],
      messageCount: 1,
    }
    queueTableRows(schemaMock.memory, [candidate])

    const offsetPage = await queryMemoryTableRows({
      workspaceId: 'workspace-1',
      limit: 1,
      offset: 5,
      includeTotal: false,
    })

    expect(offsetPage.rows[0]?.position).toBe(5)
    expect(dbChainMockFns.offset).toHaveBeenCalledWith(5)

    queueTableRows(schemaMock.memory, [candidate])

    const keysetWhereCall = dbChainMockFns.where.mock.calls.length
    await expect(
      queryMemoryTableRows({
        workspaceId: 'workspace-1',
        limit: 1,
        offset: 0,
        after: { orderKey: '2026-01-03T00:00:00.000Z', id: 'memory-2' },
        includeTotal: false,
      })
    ).resolves.toMatchObject({ rows: [expect.objectContaining({ id: 'memory-1' })] })

    const conditions = flattenMockConditions(dbChainMockFns.where.mock.calls[keysetWhereCall]?.[0])
    const keyset = conditions.find((condition) => condition.type === 'or')
    expect(keyset).toEqual({
      type: 'or',
      conditions: [
        expect.objectContaining({
          type: 'lt',
          left: 'updatedAt',
          right: new Date('2026-01-03T00:00:00.000Z'),
        }),
        {
          type: 'and',
          conditions: [
            expect.objectContaining({
              type: 'eq',
              left: 'updatedAt',
              right: new Date('2026-01-03T00:00:00.000Z'),
            }),
            expect.objectContaining({ type: 'lt', left: 'id', right: 'memory-2' }),
          ],
        },
      ],
    })
  })

  it('rejects a cursor combined with a positive offset before querying', async () => {
    await expect(
      queryMemoryTableRows({
        workspaceId: 'workspace-1',
        limit: 100,
        offset: 5,
        after: { orderKey: UPDATED_AT.toISOString(), id: 'memory-1' },
        includeTotal: false,
      })
    ).rejects.toThrow('cannot combine a cursor and offset')

    expect(dbChainMockFns.select).not.toHaveBeenCalled()
  })

  it('rejects an invalid keyset cursor before querying the database', async () => {
    await expect(
      queryMemoryTableRows({
        workspaceId: 'workspace-1',
        limit: 100,
        offset: 0,
        after: { orderKey: 'not-a-date', id: 'memory-1' },
        includeTotal: false,
      })
    ).rejects.toThrow('Invalid memory table cursor')

    expect(dbChainMockFns.select).not.toHaveBeenCalled()
  })
})
