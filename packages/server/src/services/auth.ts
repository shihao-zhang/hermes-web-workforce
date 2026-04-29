import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { homedir } from 'os'

const APP_HOME = join(homedir(), '.hermes-web-ui')
const TOKEN_FILE = join(APP_HOME, '.token')
const BUILTIN_EXTRA_TOKENS = ['lite']

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Get or create the auth token. Returns null if auth is disabled.
 */
export async function getToken(): Promise<string | null> {
  if (process.env.AUTH_DISABLED === '1' || process.env.AUTH_DISABLED === 'true') {
    return null
  }

  if (process.env.AUTH_TOKEN) {
    return process.env.AUTH_TOKEN
  }

  try {
    const token = await readFile(TOKEN_FILE, 'utf-8')
    return token.trim()
  } catch {
    const token = generateToken()
    await mkdir(APP_HOME, { recursive: true })
    await writeFile(TOKEN_FILE, token + '\n', { mode: 0o600 })
    return token
  }
}

export function getExtraTokens(): string[] {
  const envTokens = String(process.env.AUTH_EXTRA_TOKENS || process.env.EXTRA_AUTH_TOKENS || '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
  return Array.from(new Set([...BUILTIN_EXTRA_TOKENS, ...envTokens]))
}

export function isValidAuthToken(provided: string, primaryToken: string | null): boolean {
  if (!primaryToken) return true
  if (!provided) return false
  return provided === primaryToken || getExtraTokens().includes(provided)
}

/**
 * Koa middleware: check Authorization header or query token.
 * No path whitelisting — applied globally after public routes.
 */
export function requireAuth(token: string | null) {
  return async (ctx: any, next: () => Promise<void>) => {
    if (!token) {
      await next()
      return
    }

    const auth = ctx.headers.authorization || ''
    const provided = auth.startsWith('Bearer ')
      ? auth.slice(7)
      : (ctx.query.token as string) || ''

    if (!isValidAuthToken(provided, token)) {
      // Skip auth for non-API paths (SPA static files)
      const lowerPath = ctx.path.toLowerCase()
      if (!lowerPath.startsWith('/api') && !lowerPath.startsWith('/v1') && !lowerPath.startsWith('/upload')) {
        await next()
        return
      }
      ctx.status = 401
      ctx.set('Content-Type', 'application/json')
      ctx.body = { error: 'Unauthorized' }
      return
    }

    await next()
  }
}
