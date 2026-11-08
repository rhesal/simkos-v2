import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const QA_DIR = path.join(ROOT, 'qa')

function findTestFiles(dir) {
  let files = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(findTestFiles(fullPath))
    } else if (entry.isFile() && (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.test.js'))) {
      if (entry.name !== 'aset_browser_e2e.test.mjs') {
        const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/')
        files.push(relPath)
      }
    }
  }
  return files
}

const testFiles = findTestFiles(QA_DIR).sort()

console.log(`[TEST-RUNNER] Menemukan ${testFiles.length} file tes:`)
testFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
console.log(`------------------------------------------------------------\n`)

const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env }
})

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`\n[TEST-RUNNER] Pengujian gagal dengan exit code ${code}`)
    process.exit(code || 1)
  } else {
    console.log(`\n[TEST-RUNNER] Seluruh pengujian berhasil!`)
    process.exit(0)
  }
})
