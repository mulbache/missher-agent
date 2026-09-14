import { spawn } from 'node:child_process'

export interface LaunchResult {
  code: null | number
  error?: string
}

const resolveMissherBin = () => process.env.MISSHER_BIN?.trim() || 'missher'

export const launchMissherCommand = (args: string[]): Promise<LaunchResult> =>
  new Promise(resolve => {
    const child = spawn(resolveMissherBin(), args, { stdio: 'inherit' })

    child.on('error', err => resolve({ code: null, error: err.message }))
    child.on('exit', code => resolve({ code }))
  })
