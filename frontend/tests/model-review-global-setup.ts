import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..')
const resultDir = path.resolve(currentDir, '..', 'test-results', 'model-review')

export default async function globalSetup() {
  mkdirSync(resultDir, { recursive: true })
  const stdout = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'backend', 'sh', '-lc', 'PYTHONPATH=/app MODEL_REVIEW_VISUAL_SEED=1 python scripts/model_review_visual_seed.py seed'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  writeFileSync(path.join(resultDir, 'seed.json'), stdout.trim(), 'utf8')
}
