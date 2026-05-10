import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..')

export default async function globalTeardown() {
  try {
    execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'backend', 'sh', '-lc', 'PYTHONPATH=/app MODEL_REVIEW_VISUAL_SEED=1 python scripts/model_review_visual_seed.py cleanup'],
      { cwd: repoRoot, encoding: 'utf8', stdio: 'ignore' },
    )
  } catch {
    // Best-effort cleanup. The test failure, if any, is reported by the spec.
  }
}
