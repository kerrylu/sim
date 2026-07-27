/**
 * @vitest-environment jsdom
 */
import { act, type ChangeEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSetStoreValue } = vi.hoisted(() => ({
  mockSetStoreValue: vi.fn(),
}))

const initialFilters = [
  {
    id: 'filter-1',
    tagName: '',
    tagId: 'tag-text',
    tagSlot: 'tag1',
    fieldType: 'text',
    operator: 'contains',
    tagValue: 'api',
    valueTo: 'secondary',
    collapsed: false,
  },
]

vi.mock(
  '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/workflow-search-highlight',
  () => ({
    getActiveWorkflowSearchHighlight: () => undefined,
  })
)

vi.mock(
  '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-depends-on-gate',
  () => ({
    useDependsOnGate: () => ({
      dependencyValues: { knowledgeBaseSelector: 'kb-1' },
    }),
  })
)

vi.mock(
  '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-input',
  () => ({
    useSubBlockInput: () => ({
      fieldHelpers: {
        getFieldState: () => ({ showTags: false }),
        createFieldHandlers: (_key: string, _value: string, onChange: (value: string) => void) => ({
          onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
          onKeyDown: vi.fn(),
          onDrop: vi.fn(),
          onDragOver: vi.fn(),
          onFocus: vi.fn(),
        }),
        createTagSelectHandler: vi.fn(),
        hideFieldDropdowns: vi.fn(),
      },
    }),
  })
)

vi.mock(
  '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/providers/active-search-target-provider',
  () => ({
    useActiveSearchTarget: () => null,
  })
)

vi.mock(
  '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-accessible-reference-prefixes',
  () => ({
    useAccessibleReferencePrefixes: () => null,
  })
)

vi.mock('@/hooks/kb/use-knowledge-base-tag-definitions', () => ({
  useKnowledgeBaseTagDefinitions: () => ({
    tagDefinitions: [
      { id: 'tag-text', tagSlot: 'tag1', displayName: 'category', fieldType: 'text' },
      { id: 'tag-number', tagSlot: 'number1', displayName: 'score', fieldType: 'number' },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/hooks/kb/use-tag-selection', () => ({
  useTagSelection: () => vi.fn(),
}))

vi.mock(
  '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value',
  () => ({
    useSubBlockValue: () => [JSON.stringify(initialFilters), mockSetStoreValue],
  })
)

import { KnowledgeTagFilters } from './knowledge-tag-filters'

let container: HTMLDivElement
let root: Root

describe('KnowledgeTagFilters Tag ID editing', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockSetStoreValue.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  const renderTagFilters = async () => {
    await act(async () => {
      root.render(
        <KnowledgeTagFilters
          blockId='knowledge-1'
          subBlock={{
            id: 'manualTagFilters',
            title: 'Tag Filters',
            type: 'knowledge-tag-filters',
            mode: 'advanced',
            canonicalParamId: 'tagFilters',
          }}
        />
      )
    })

    return container.querySelector<HTMLInputElement>('input[placeholder="Enter tag ID"]')
  }

  const changeTagId = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const serializedFilters = mockSetStoreValue.mock.lastCall?.[0] as string
    return JSON.parse(serializedFilters)[0]
  }

  it('preserves values for unresolved edits and resets them once a different literal ID resolves', async () => {
    const input = await renderTagFilters()
    expect(input).not.toBeNull()

    const unresolvedFilter = await changeTagId(input as HTMLInputElement, 'tag-numbe')
    expect(unresolvedFilter).toMatchObject({
      tagId: 'tag-numbe',
      operator: 'contains',
      tagValue: 'api',
      valueTo: 'secondary',
    })

    const resolvedFilter = await changeTagId(input as HTMLInputElement, 'tag-number')
    expect(resolvedFilter).toMatchObject({
      tagId: 'tag-number',
      tagSlot: 'number1',
      fieldType: 'number',
      operator: 'eq',
      tagValue: '',
    })
    expect(resolvedFilter.valueTo).toBeUndefined()
  })
})
