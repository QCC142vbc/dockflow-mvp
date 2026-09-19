import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { persistDataset } from './generate.js'
import { readAndValidate } from './validate.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifestFile = path.join(ROOT, 'data', 'manifest', 'index.json')
const args = process.argv.slice(2)
const source = args.find((arg) => !arg.startsWith('--'))
const makeCurrent = args.includes('--current')

if (!source) {
  console.error('Usage: npm run simulate:import -- path/to/dataset.json [--current]')
  process.exit(1)
}

const result = readAndValidate(path.resolve(source))
if (!result.valid) {
  console.error(`Import rejected:\n${result.errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { schemaVersion: '1.0.0', datasets: [] }
if (manifest.datasets.some((record) => record.datasetId === result.dataset.datasetId)) {
  console.error(`Import rejected: dataset ID already exists (${result.dataset.datasetId})`)
  process.exit(1)
}
try {
  const persisted = persistDataset(result.dataset, 'imported', { selectCurrent: makeCurrent })
  console.log(`Imported ${result.dataset.datasetId} to ${persisted.filename}${makeCurrent ? ' and selected as current' : ''}`)
} catch (error) {
  console.error(`Import failed: ${error.message}`)
  process.exit(1)
}
