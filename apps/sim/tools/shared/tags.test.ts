import { describe, expect, it } from 'vitest'
import { isEmptyTagValue, parseTagFilters } from './tags'

describe('tag filter parsing', () => {
  it('preserves name-based tag filters', () => {
    expect(
      parseTagFilters([
        {
          tagName: 'category',
          tagId: '',
          tagValue: 'api',
          tagSlot: 'tag1',
          fieldType: 'text',
          operator: 'contains',
        },
      ])
    ).toEqual([
      {
        tagName: 'category',
        tagSlot: 'tag1',
        fieldType: 'text',
        operator: 'contains',
        value: 'api',
        valueTo: undefined,
      },
    ])
  })

  it('preserves ID-based tag filters for server-side resolution', () => {
    expect(
      parseTagFilters([
        {
          tagName: '',
          tagId: 'tag-definition-id',
          tagValue: 42,
          fieldType: 'number',
          operator: 'gte',
        },
      ])
    ).toEqual([
      {
        tagId: 'tag-definition-id',
        tagSlot: '',
        fieldType: 'number',
        operator: 'gte',
        value: 42,
        valueTo: undefined,
      },
    ])
  })

  it('drops filters without a tag name or tag ID', () => {
    expect(parseTagFilters([{ tagValue: 'api', operator: 'eq' }])).toEqual([])
  })

  it('emits exactly one identifier when stale input contains both', () => {
    expect(
      parseTagFilters([
        {
          tagName: 'category',
          tagId: 'tag-definition-id',
          tagValue: 'api',
        },
      ])
    ).toEqual([
      {
        tagId: 'tag-definition-id',
        tagSlot: '',
        fieldType: 'text',
        operator: 'eq',
        value: 'api',
        valueTo: undefined,
      },
    ])
  })

  it('treats a tag ID filter as non-empty', () => {
    expect(isEmptyTagValue([{ tagId: 'tag-definition-id', tagValue: '' }])).toBe(false)
  })

  it('preserves a configured filter whose dynamic tag ID resolved empty for API validation', () => {
    const filter = { tagName: '', tagId: '', tagValue: 'api', operator: 'eq' }

    expect(isEmptyTagValue([filter])).toBe(false)
    expect(parseTagFilters([filter])).toEqual([
      {
        tagSlot: '',
        fieldType: 'text',
        operator: 'eq',
        value: 'api',
        valueTo: undefined,
      },
    ])
  })
})
