import { accessSync, constants, existsSync } from 'fs'
import { homedir } from 'os'
import { delimiter, isAbsolute, join } from 'path'

export interface HermesBinStatus {
  hermes_cli_path: string
  hermes_cli_available: boolean
  resolution_source: string
  error_message: string
}

function canExecute(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function executableCandidates(name: string): string[] {
  if (isAbsolute(name)) return [name]
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : ['']
  return (process.env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap(dir => extensions.map(ext => join(dir, `${name}${ext}`)))
}

function knownHermesCandidates(): string[] {
  const home = homedir()
  return [
    join(home, '.local', 'bin', 'hermes'),
    join(home, '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
    join(home, '.hermes', 'hermes-agent', 'node_modules', '.bin', 'hermes'),
    '/opt/homebrew/bin/hermes',
    '/usr/local/bin/hermes',
  ]
}

export function getHermesBinStatus(): HermesBinStatus {
  const envBin = process.env.HERMES_BIN?.trim()
  if (envBin) {
    const available = existsSync(envBin) && canExecute(envBin)
    return {
      hermes_cli_path: envBin,
      hermes_cli_available: available,
      resolution_source: 'HERMES_BIN',
      error_message: available ? '' : `HERMES_BIN points to a missing or non-executable file: ${envBin}`,
    }
  }

  for (const candidate of executableCandidates('hermes')) {
    if (existsSync(candidate) && canExecute(candidate)) {
      return {
        hermes_cli_path: candidate,
        hermes_cli_available: true,
        resolution_source: 'PATH',
        error_message: '',
      }
    }
  }

  for (const candidate of knownHermesCandidates()) {
    if (existsSync(candidate) && canExecute(candidate)) {
      return {
        hermes_cli_path: candidate,
        hermes_cli_available: true,
        resolution_source: 'known_path',
        error_message: '',
      }
    }
  }

  return {
    hermes_cli_path: 'hermes',
    hermes_cli_available: false,
    resolution_source: 'fallback',
    error_message: 'Hermes CLI was not found. Set HERMES_BIN or add hermes to PATH.',
  }
}

export function resolveHermesBin(): string {
  return getHermesBinStatus().hermes_cli_path
}

export function hermesExecutionEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const home = homedir()
  const extraPath = [
    join(home, '.local', 'bin'),
    join(home, '.hermes', 'hermes-agent', 'venv', 'bin'),
    join(home, '.hermes', 'hermes-agent', 'node_modules', '.bin'),
    process.env.PATH || '',
  ].filter(Boolean).join(delimiter)
  return { ...process.env, PATH: extraPath, ...extra }
}

