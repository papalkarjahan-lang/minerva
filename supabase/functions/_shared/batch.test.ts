import { describe, it, expect } from 'vitest'
import { chunk } from './batch'

describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk when size exceeds the array length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]])
  })

  it('returns an empty array for an empty input', () => {
    expect(chunk([], 5)).toEqual([])
  })

  it('divides evenly with no short final chunk when it divides exactly', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it('throws for a zero or negative chunk size rather than looping forever', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow()
    expect(() => chunk([1, 2, 3], -1)).toThrow()
  })

  it('works for a chunk size of 1', () => {
    expect(chunk(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
  })
})
