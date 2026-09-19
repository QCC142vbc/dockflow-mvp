import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(ROOT, 'data')
const manifestFile = path.join(DATA, 'manifest', 'index.json')
const dryRun = process.argv.includes('--dry-run')
const graceArg = process.argv.find((arg) => arg.startsWith('--grace-days='))
const graceDays = Number(graceArg?.split('=')[1] || 2)
const now = Date.now()
const safeDataPath = (relative) => {
  const resolved = path.resolve(ROOT, relative)
  if (!resolved.startsWith(`${DATA}${path.sep}`)) throw new Error(`Unsafe data path: ${relative}`)
  return resolved
}
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { schemaVersion: '1.0.0', datasets: [] }
const logFile = path.join(DATA, 'cleanup.log')
const events = []
for (const record of manifest.datasets) {
  if (record.status === 'deleted') continue
  const expired = Date.parse(record.expiresAt) <= now
  if (expired && record.status !== 'archived') {
    const sourcePath = safeDataPath(record.filePath)
    const archiveName = path.basename(sourcePath)
    const archiveRelative = path.join('data', 'archive', archiveName).replaceAll('\\', '/')
    const archivePath = safeDataPath(archiveRelative)
    events.push({ action: 'archive', datasetId: record.datasetId, filename: archiveName, reason: 'retention expired', date: new Date(now).toISOString() })
    if (!dryRun && fs.existsSync(sourcePath)) { fs.mkdirSync(path.dirname(archivePath), { recursive: true }); fs.renameSync(sourcePath, archivePath); record.filePath = archiveRelative; record.status = 'archived' }
  }
  if ((record.status === 'archived' || expired) && Date.parse(record.expiresAt) + graceDays * 86400000 <= now) {
    events.push({ action: 'delete', datasetId: record.datasetId, filename: path.basename(record.filePath), reason: `archive grace period expired (${graceDays} days)`, date: new Date(now).toISOString() })
    if (!dryRun) { const archivedPath = safeDataPath(record.filePath); if (fs.existsSync(archivedPath)) fs.unlinkSync(archivedPath); record.status = 'deleted' }
  }
}
if (!dryRun) {
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  if (events.length) fs.appendFileSync(logFile, events.map((event) => JSON.stringify(event)).join('\n') + '\n')
}
console.log(`${dryRun ? '[dry-run] ' : ''}${events.length} cleanup operation(s)${events.length ? `:\n${events.map((event) => `- ${event.action} ${event.datasetId} (${event.reason})`).join('\n')}` : ''}`)
