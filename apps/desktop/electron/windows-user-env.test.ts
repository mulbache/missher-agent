import assert from 'node:assert/strict'

import { test } from 'vitest'

import { expandWindowsEnvRefs, parseRegQueryValue, readWindowsUserEnvVar } from './windows-user-env'

// ── parseRegQueryValue ─────────────────────────────────────────────────────

test('parseRegQueryValue extracts a REG_SZ value', () => {
  const out = ['', 'HKEY_CURRENT_USER\\Environment', '    MISSHER_HOME    REG_SZ    F:\\Missher\\data', ''].join('\r\n')
  assert.equal(parseRegQueryValue(out, 'MISSHER_HOME'), 'F:\\Missher\\data')
})

test('parseRegQueryValue matches the name case-insensitively', () => {
  const out = 'HKEY_CURRENT_USER\\Environment\r\n    Missher_Home    REG_EXPAND_SZ    %USERPROFILE%\\h\r\n'
  assert.equal(parseRegQueryValue(out, 'MISSHER_HOME'), '%USERPROFILE%\\h')
})

test('parseRegQueryValue preserves spaces inside the value', () => {
  const out = '    MISSHER_HOME    REG_SZ    C:\\Program Files\\Missher\r\n'
  assert.equal(parseRegQueryValue(out, 'MISSHER_HOME'), 'C:\\Program Files\\Missher')
})

test('parseRegQueryValue returns null when the value line is absent', () => {
  const out = 'HKEY_CURRENT_USER\\Environment\r\n    Path    REG_SZ    C:\\x\r\n'
  assert.equal(parseRegQueryValue(out, 'MISSHER_HOME'), null)
  assert.equal(parseRegQueryValue('', 'MISSHER_HOME'), null)
  assert.equal(parseRegQueryValue('garbage', 'MISSHER_HOME'), null)
})

// ── expandWindowsEnvRefs ───────────────────────────────────────────────────

test('expandWindowsEnvRefs expands %VAR% case-insensitively', () => {
  assert.equal(expandWindowsEnvRefs('%UserProfile%\\h', { USERPROFILE: 'C:\\Users\\jeff' }), 'C:\\Users\\jeff\\h')
})

test('expandWindowsEnvRefs leaves literal paths and unknown refs intact', () => {
  assert.equal(expandWindowsEnvRefs('F:\\Missher\\data', {}), 'F:\\Missher\\data')
  assert.equal(expandWindowsEnvRefs('%NOPE%\\x', {}), '%NOPE%\\x')
})

// ── readWindowsUserEnvVar ──────────────────────────────────────────────────

test('readWindowsUserEnvVar returns null off Windows without spawning', () => {
  let spawned = false

  const exec = () => {
    spawned = true

    return ''
  }

  assert.equal(readWindowsUserEnvVar('MISSHER_HOME', { platform: 'linux', exec }), null)
  assert.equal(spawned, false)
})

test('readWindowsUserEnvVar queries HKCU\\Environment and expands the value', () => {
  const calls = []

  const exec = (cmd, args) => {
    calls.push([cmd, args])

    return 'HKEY_CURRENT_USER\\Environment\r\n    MISSHER_HOME    REG_EXPAND_SZ    %DRIVE%\\Missher\r\n'
  }

  const value = readWindowsUserEnvVar('MISSHER_HOME', {
    platform: 'win32',
    env: { DRIVE: 'F:' },
    exec
  })

  assert.equal(value, 'F:\\Missher')
  assert.deepEqual(calls, [['reg', ['query', 'HKCU\\Environment', '/v', 'MISSHER_HOME']]])
})

test('readWindowsUserEnvVar returns null when reg exits non-zero (value missing)', () => {
  const exec = () => {
    throw new Error('reg exited 1')
  }

  assert.equal(readWindowsUserEnvVar('MISSHER_HOME', { platform: 'win32', exec }), null)
})

test('readWindowsUserEnvVar returns null for an empty value', () => {
  const exec = () => '    MISSHER_HOME    REG_SZ    \r\n'
  assert.equal(readWindowsUserEnvVar('MISSHER_HOME', { platform: 'win32', exec }), null)
})
