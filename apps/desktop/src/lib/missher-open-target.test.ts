import { describe, expect, it } from 'vitest'

import {
  normalizeMissherOpenString,
  pathFromMissherDeepLink,
  pathFromOpenDeepLink,
  resolveMissherOpenPath
} from './missher-open-target'

describe('normalizeMissherOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeMissherOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeMissherOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped missher:// deep links to the same path', () => {
    expect(normalizeMissherOpenString('missher://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeMissherOpenString('missher://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps missher://open/… deep links by stripping the open host', () => {
    expect(normalizeMissherOpenString('missher://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeMissherOpenString('missher://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved missher kinds and unsafe paths', () => {
    expect(normalizeMissherOpenString('missher://blueprint/morning-brief')).toBeNull()
    expect(normalizeMissherOpenString('missher://plugin/install')).toBeNull()
    expect(normalizeMissherOpenString('https://example.com/x')).toBeNull()
    expect(normalizeMissherOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeMissherOpenString('index-network')).toBeNull()
  })
})

describe('resolveMissherOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveMissherOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveMissherOpenPath({ href: 'missher://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromMissherDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromMissherDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from missher://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromMissherDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromMissherDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromMissherDeepLink('plugin', 'install')).toBeNull()
  })
})
