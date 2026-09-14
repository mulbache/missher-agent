export function logError(error: unknown): void {
  if (!process.env.MISSHER_INK_DEBUG_ERRORS) {
    return
  }

  console.error(error)
}
