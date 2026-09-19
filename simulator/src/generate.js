import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scenarios } from './scenarios/index.js'
import { SCHEMA_VERSION, validateDataset } from './validate.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(ROOT, 'data')
const mkdir = (directory) => fs.mkdirSync(directory, { recursive: true })
const writeJson = (file, value) => { mkdir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }
const seedRandom = (seed) => { let value = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0); return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296 } }
const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')
const timestampSlug = (date) => iso(date).replace(/[-:]/g, '').replace('T', 'T').replace('Z', 'Z')
const clockTime = (totalMinutes) => `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
const hungarianDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const hungarianMinutes = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  return Number(parts.find((part) => part.type === 'hour').value) * 60 + Number(parts.find((part) => part.type === 'minute').value)
}
const manifestPath = path.join(DATA, 'manifest', 'index.json')

const carriers = ['NorthLine Transport', 'Lynx Freight', 'Kardex Logistics', 'Redmark Haulage', 'TransPacific', 'Horizon Lines', 'Green Valley', 'Jettison Cargo', 'Novak Supply', 'Deltaline Haulage', 'QuickRoute Systems', 'Westland Trucking', 'Boxcar Express', 'MetroHaul', 'Pioneer Carriers']
const loadTypes = ['Inbound Pallets', 'Outbound Retail', 'Outbound Cases', 'Inbound Produce', 'Temperature Controlled']
const plates = ['ABC-482', 'LNX-728', 'KRD-915', 'RMV-304', 'TXP-611', 'HNL-448', 'GVC-839', 'JTX-490', 'NVK-201', 'DHL-779', 'QRS-582', 'WTR-664', 'BXC-117', 'MTR-305', 'PCL-923']

export function buildDataset({ scenarioName = 'normal', seed = Date.now(), now = new Date() } = {}) {
  const scenario = scenarios[scenarioName] || scenarios.normal
  const random = seedRandom(seed)
  const generatedAt = new Date(now)
  const simulatedAt = new Date(now)
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const warehouseDate = hungarianDate(generatedAt)
  const operationalNow = hungarianMinutes(generatedAt)
  const vehicles = plates.map((plate, index) => ({ vehicleId: `veh-${String(index + 1).padStart(3, '0')}`, plate, carrier: carriers[index], direction: index % 2 ? 'Outbound' : 'Inbound', loadType: loadTypes[index % loadTypes.length], palletCount: 12 + Math.floor(random() * 28), appointmentTime: clockTime(operationalNow - 80 + index * 11) }))
  const states = ['Available', 'Loading', 'Unloading', 'Loading', 'Cleaning', 'Loading', 'Called', 'Unloading', 'Loading', 'Maintenance', 'Delayed', 'Loading']
  const docks = states.map((state, index) => {
    const dockId = String(index + 1).padStart(2, '0')
    const vehicle = state === 'Available' || state === 'Cleaning' || state === 'Maintenance' ? null : vehicles[index]
    const override = scenario.dockOverrides[dockId] || {}
    const actualState = override.state || state
    const tone = override.status || actualState.toLowerCase()
    return { dockId, state: actualState, status: tone, vehicleId: vehicle?.vehicleId || null, plate: vehicle?.plate || '—', carrier: vehicle?.carrier || (actualState === 'Maintenance' ? 'Facilities team' : actualState === 'Cleaning' ? 'Bay sanitation team' : 'Ready for assignment'), direction: vehicle?.direction || 'All', progress: override.progress ?? (actualState === 'Loading' ? 28 + Math.floor(random() * 60) : actualState === 'Unloading' ? 30 + Math.floor(random() * 45) : actualState === 'Cleaning' ? 72 : actualState === 'Delayed' ? 18 : 0), elapsedSeconds: actualState === 'Available' ? 0 : 300 + Math.floor(random() * 3900), appointmentTime: vehicle?.appointmentTime || '—', notes: actualState === 'Delayed' ? 'Documentation mismatch. Operations lead notified.' : actualState === 'Maintenance' ? 'Leveler hydraulic service. Next review at 09:00.' : actualState === 'Cleaning' ? 'Post-spill sanitation. Estimated release 07:26.' : 'Operation progressing within planned window.' }
  })
  const called = vehicles[0]
  const calledDock = docks[6]
  calledDock.vehicleId = called.vehicleId; calledDock.plate = called.plate; calledDock.carrier = called.carrier; calledDock.direction = called.direction; calledDock.status = 'called'; calledDock.state = 'Available'; calledDock.progress = 0; calledDock.notes = 'Now calling: driver proceed to Dock 07. Follow safety signage.'
  const queue = vehicles.slice(1, 7).map((vehicle, index) => ({ queueId: `queue-${index + 1}`, position: index + 1, vehicleId: vehicle.vehicleId, plate: vehicle.plate, carrier: vehicle.carrier, loadType: vehicle.loadType, arrivalTime: clockTime(operationalNow - 38 + index * 9), estimatedCallTime: clockTime(operationalNow + index * 15), priority: index === 0 ? 'Priority' : index === 2 ? 'Delayed' : index === 3 ? 'Documentation check' : 'Standard' }))
  const alerts = docks.filter((dock) => ['delayed', 'maintenance', 'cleaning'].includes(dock.status)).map((dock) => ({ alertId: `alert-${dock.dockId}`, dockId: dock.dockId, severity: dock.status === 'delayed' ? 'critical' : dock.status === 'maintenance' ? 'warning' : 'info', code: dock.status === 'delayed' ? 'DOCUMENTATION_MISMATCH' : dock.status === 'maintenance' ? 'MAINTENANCE' : 'SAFETY_HOLD', description: dock.notes, action: dock.status === 'delayed' ? 'Operations lead notified' : dock.status === 'maintenance' ? 'Next review at 09:00' : 'Estimated release 07:26', elapsedSeconds: dock.elapsedSeconds }))
  alerts.push(...scenario.extraAlerts.map((alert) => ({ ...alert, elapsedSeconds: 1440 })))
  const kpis = { arrivalsToday: 86 + Math.floor(random() * 14), averageWaitMinutes: 18 + scenario.queueDelayMinutes, activeDocks: docks.filter((dock) => !['Available', 'called'].includes(dock.status)).length, delayedShipments: alerts.filter((alert) => alert.severity === 'critical').length }
  const dataset = { datasetId: `df-${warehouseDate.replace(/-/g, '')}-${scenarioName}-${String(seed).slice(-6)}`, schemaVersion: SCHEMA_VERSION, scenario: scenarioName, generatedAt: iso(generatedAt), simulatedAt: iso(simulatedAt), expiresAt: iso(expiresAt), warehouse: { name: 'Central Logistics Hub', date: warehouseDate, shift: 'Live operations · local time' }, nowCalling: { vehicleId: called.vehicleId, dockId: calledDock.dockId, instruction: 'PROCEED TO DOCK', estimatedStart: clockTime(operationalNow) }, vehicles, queue, docks, alerts, kpis }
  const canonical = JSON.stringify(dataset)
  dataset.integrity = { checksum: crypto.createHash('sha256').update(canonical).digest('hex'), recordCounts: { vehicles: vehicles.length, queue: queue.length, docks: docks.length, alerts: alerts.length } }
  return dataset
}

function parseArgs(argv) { const args = Object.fromEntries(argv.slice(2).map((arg, index, all) => arg.startsWith('--') ? [arg.slice(2), all[index + 1]?.startsWith('--') ? true : all[index + 1] || true] : [])); return args }
export function persistDataset(dataset, source = 'generated', { selectCurrent = true } = {}) {
  const result = validateDataset(dataset)
  if (!result.valid) throw new Error(`Generated dataset is invalid:\n${result.errors.join('\n')}`)
  const stamp = timestampSlug(new Date(dataset.generatedAt))
  const filename = `snapshot_${stamp}_${dataset.scenario}_morning-01.json`
  const snapshotPath = path.join(DATA, source === 'imported' ? 'imports' : 'snapshots', filename)
  if (fs.existsSync(snapshotPath)) throw new Error(`Refusing to overwrite existing dataset file: ${filename}`)
  writeJson(snapshotPath, dataset)
  const index = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { schemaVersion: SCHEMA_VERSION, datasets: [] }
  index.datasets = index.datasets.filter((record) => record.datasetId !== dataset.datasetId)
  if (selectCurrent) {
    for (const record of index.datasets) if (record.status === 'current') record.status = 'archived'
    writeJson(path.join(DATA, 'current', 'latest.json'), dataset)
  }
  index.datasets.push({ datasetId: dataset.datasetId, filePath: path.relative(ROOT, snapshotPath).replaceAll('\\', '/'), source, scenario: dataset.scenario, createdAt: dataset.generatedAt, simulatedAt: dataset.simulatedAt, expiresAt: dataset.expiresAt, schemaVersion: dataset.schemaVersion, status: selectCurrent ? 'current' : 'archived', recordCounts: dataset.integrity.recordCounts })
  writeJson(manifestPath, index)
  return { dataset, filename, snapshotPath }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv)
  const scenario = args.scenario || 'normal'
  if (!scenarios[scenario]) { console.error(`Unknown scenario "${scenario}". Choose: ${Object.keys(scenarios).join(', ')}`); process.exit(1) }
  try { const result = persistDataset(buildDataset({ scenarioName: scenario, seed: args.seed || Date.now() })); console.log(`Generated ${result.dataset.datasetId}\n${result.snapshotPath}`) } catch (error) { console.error(error.message); process.exit(1) }
}
