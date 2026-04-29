import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { cp, mkdir, readdir, rm, writeFile } from 'fs/promises'
import { basename, extname, join, relative, resolve } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import {
  readConfigYaml, writeConfigYaml,
  safeReadFile, extractDescription, listFilesRecursive, getHermesDir,
} from '../../services/config-helpers'
import { resolveProfileDir } from '../../services/hermes/hermes-profile'
import { getGatewayManagerInstance } from '../../services/gateway-bootstrap'

const execFileAsync = promisify(execFile)
const MAX_SKILL_ARCHIVE_SIZE = 50 * 1024 * 1024

export async function list(ctx: any) {
  const skillsDir = join(getHermesDir(), 'skills')
  try {
    const config = await readConfigYaml()
    const disabledList: string[] = config.skills?.disabled || []
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const categories: any[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const catDir = join(skillsDir, entry.name)
      const catDesc = await safeReadFile(join(catDir, 'DESCRIPTION.md'))
      const catDescription = catDesc ? catDesc.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 100) : ''
      const skillEntries = await readdir(catDir, { withFileTypes: true })
      const skills: any[] = []
      for (const se of skillEntries) {
        if (!se.isDirectory()) continue
        const skillMd = await safeReadFile(join(catDir, se.name, 'SKILL.md'))
        if (skillMd) {
          skills.push({ name: se.name, description: extractDescription(skillMd), enabled: !disabledList.includes(se.name) })
        }
      }
      if (skills.length > 0) {
        categories.push({ name: entry.name, description: catDescription, skills })
      }
    }
    categories.sort((a, b) => a.name.localeCompare(b.name))
    for (const cat of categories) { cat.skills.sort((a: any, b: any) => a.name.localeCompare(b.name)) }
    ctx.body = { categories }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: `Failed to read skills directory: ${err.message}` }
  }
}

export async function toggle(ctx: any) {
  const { name, enabled } = ctx.request.body as { name?: string; enabled?: boolean }
  if (!name || typeof enabled !== 'boolean') {
    ctx.status = 400
    ctx.body = { error: 'Missing name or enabled flag' }
    return
  }
  try {
    const config = await readConfigYaml()
    if (!config.skills) config.skills = {}
    if (!Array.isArray(config.skills.disabled)) config.skills.disabled = []
    const disabled = config.skills.disabled as string[]
    const idx = disabled.indexOf(name)
    if (enabled) { if (idx !== -1) disabled.splice(idx, 1) }
    else { if (idx === -1) disabled.push(name) }
    await writeConfigYaml(config)
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

export async function importSkill(ctx: any) {
  const upload = await readSingleUpload(ctx, MAX_SKILL_ARCHIVE_SIZE)
  if (!upload) return
  if (extname(upload.filename).toLowerCase() !== '.zip') {
    ctx.status = 400
    ctx.body = { error: 'Only .zip skill archives are supported' }
    return
  }

  const tmpRoot = join(tmpdir(), `hermes-skill-import-${randomUUID()}`)
  const archivePath = join(tmpRoot, basename(upload.filename))
  const extractDir = join(tmpRoot, 'extract')
  try {
    await mkdir(extractDir, { recursive: true })
    await writeFile(archivePath, upload.data)
    await validateZipEntries(archivePath)
    await execFileAsync('unzip', ['-q', archivePath, '-d', extractDir], { timeout: 30000 })

    const skillRoots = await findSkillRoots(extractDir)
    if (skillRoots.length === 0) {
      ctx.status = 400
      ctx.body = { error: 'No SKILL.md found in archive' }
      return
    }

    const targetProfiles = await resolveTargetProfiles(ctx)
    const installed: Array<{ profile: string; category: string; name: string }> = []
    const planned: Array<{ profile: string; skillsDir: string; category: string; name: string; source: string; target: string }> = []
    for (const profile of targetProfiles) {
      const skillsDir = join(profile === '__current__' ? getHermesDir() : resolveProfileDir(profile), 'skills')
      for (const root of skillRoots) {
        const placement = await resolveSkillPlacement(extractDir, root, upload.filename)
        const target = resolve(skillsDir, placement.category, placement.name)
        planned.push({ profile, skillsDir, ...placement, source: root, target })
      }
    }

    for (const item of planned) {
      if (!item.target.startsWith(resolve(item.skillsDir))) throw new Error('Invalid skill target path')
      if (existsSync(item.target)) {
        ctx.status = 409
        ctx.body = { error: `Skill already exists in ${displayProfile(item.profile)}: ${item.category}/${item.name}` }
        return
      }
    }

    for (const item of planned) {
      await mkdir(resolve(item.skillsDir, item.category), { recursive: true })
      await cp(item.source, item.target, { recursive: true })
      installed.push({ profile: displayProfile(item.profile), category: item.category, name: item.name })
    }

    ctx.body = { success: true, installed }
  } catch (err: any) {
    ctx.status = ctx.status && ctx.status !== 200 ? ctx.status : 500
    ctx.body = ctx.body || { error: err.message || 'Failed to import skill archive' }
  } finally {
    try { await rm(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

export async function listFiles(ctx: any) {
  const { category, skill } = ctx.params
  const skillDir = join(getHermesDir(), 'skills', category, skill)
  try {
    const allFiles = await listFilesRecursive(skillDir, '')
    const files = allFiles.filter(f => f.path !== 'SKILL.md')
    ctx.body = { files }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

export async function readFile_(ctx: any) {
  const filePath = (ctx.params as any).path
  const hd = getHermesDir()
  const fullPath = resolve(join(hd, 'skills', filePath))
  if (!fullPath.startsWith(join(hd, 'skills'))) {
    ctx.status = 403
    ctx.body = { error: 'Access denied' }
    return
  }
  const content = await safeReadFile(fullPath)
  if (content === null) {
    ctx.status = 404
    ctx.body = { error: 'File not found' }
    return
  }
  ctx.body = { content }
}

async function validateZipEntries(archivePath: string) {
  const { stdout } = await execFileAsync('unzip', ['-Z', '-1', archivePath], { timeout: 30000 })
  const entries = stdout.split('\n').map(line => line.trim()).filter(Boolean)
  if (entries.length === 0) throw new Error('Archive is empty')
  for (const entry of entries) {
    if (entry.startsWith('/') || entry.includes('..') || entry.includes('\\')) {
      throw new Error(`Unsafe archive path: ${entry}`)
    }
  }
}

async function findSkillRoots(root: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md')) {
      results.push(dir)
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await walk(join(dir, entry.name))
      }
    }
  }
  await walk(root)
  return results
}

async function resolveSkillPlacement(extractDir: string, skillRoot: string, archiveName: string) {
  const rel = relative(extractDir, skillRoot).split('/').filter(Boolean)
  const archiveBase = basename(archiveName, extname(archiveName)).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'uploaded-skill'
  const clean = (value: string, fallback: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || fallback
  const skillMd = await safeReadFile(join(skillRoot, 'SKILL.md'))
  const canonicalName = skillMd?.match(/^name:\s*["']?([^"'\n]+)["']?/m)?.[1]?.trim()
  if (rel.length === 0) return { category: 'uploaded', name: clean(canonicalName || archiveBase, 'uploaded-skill') }
  if (rel.length === 1) return { category: 'uploaded', name: clean(canonicalName || rel[0], archiveBase) }
  return { category: clean(rel[0], 'uploaded'), name: clean(canonicalName || rel[1], archiveBase) }
}

async function resolveTargetProfiles(ctx: any): Promise<string[]> {
  const value = String(ctx.query.target_profile || ctx.request.body?.target_profile || 'current').trim()
  if (!value || value === 'current') return ['__current__']
  if (value === 'all') {
    const mgr = getGatewayManagerInstance()
    if (mgr?.listProfiles) return mgr.listProfiles()
    return ['default']
  }
  return [value]
}

function displayProfile(profile: string) {
  return profile === '__current__' ? 'current' : profile
}

async function readSingleUpload(ctx: any, maxSize: number): Promise<{ filename: string; data: Buffer } | null> {
  const contentType = ctx.get('content-type') || ''
  if (!contentType.startsWith('multipart/form-data')) {
    ctx.status = 400
    ctx.body = { error: 'Expected multipart/form-data' }
    return null
  }
  const boundary = '--' + contentType.split('boundary=')[1]
  if (!boundary || boundary === '--undefined') {
    ctx.status = 400
    ctx.body = { error: 'Missing boundary' }
    return null
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of ctx.req) {
    size += chunk.length
    if (size > maxSize) {
      ctx.status = 413
      ctx.body = { error: `Archive too large (max ${Math.round(maxSize / 1024 / 1024)}MB)` }
      return null
    }
    chunks.push(chunk)
  }
  const parts = splitMultipart(Buffer.concat(chunks), Buffer.from(boundary))
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd === -1) continue
    const header = part.subarray(0, headerEnd).toString('utf-8')
    const data = part.subarray(headerEnd + 4, part.length - 2)
    const filenameStarMatch = header.match(/filename\*=UTF-8''(.+)/i)
    const filenameMatch = header.match(/filename="([^"]+)"/)
    const filename = filenameStarMatch ? decodeURIComponent(filenameStarMatch[1]) : filenameMatch?.[1]
    if (filename) return { filename, data }
  }
  ctx.status = 400
  ctx.body = { error: 'No file found' }
  return null
}

function splitMultipart(raw: Buffer, boundary: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let start = 0
  while (true) {
    const idx = raw.indexOf(boundary, start)
    if (idx === -1) break
    if (start > 0) parts.push(raw.subarray(start + 2, idx))
    start = idx + boundary.length
  }
  return parts
}
