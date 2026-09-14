import { describe, expect, it } from 'vitest'

import { formatDesktopLogLine } from './desktop-log-line'

describe('formatDesktopLogLine', () => {
  it('prefixes each line with an ISO-8601 timestamp and the missher tag', () => {
    const line = formatDesktopLogLine('[boot] Resolving Missher backend')

    // Shape contract (not a snapshot): every desktop log line starts with
    // an ISO timestamp so multi-surface logs are chronologically readable.
    // See #84405.
    expect(line).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[missher\] \[boot\] Resolving Missher backend$/
    )
  })

  it('keeps the message verbatim after the prefix', () => {
    const line = formatDesktopLogLine('Missher backend exited (0)')

    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[missher\] Missher backend exited \(0\)$/)
  })
})
