import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

export const SCHEMA_VERSION = '1.0.0'
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const fail = (errors, message) => errors.push(message)

export function validateDataset(dataset) {
  const errors = []
  if (!dataset || typeof dataset !== 'object') return { valid: false, errors: ['Dataset must be an object'] }
  for (const key of ['datasetId', 'schemaVersion', 'scenario', 'generatedAt', 'simulatedAt', 'expiresAt']) if (!dataset[key]) fail(errors, `Missing ${key}`)
  if (typeof dataset.datasetId !== 'string' || !/^df-[a-z0-9-]+$/.test(dataset.datasetId)) fail(errors, 'datasetId must match df-[a-z0-9-]+')
  if (dataset.schemaVersion !== SCHEMA_VERSION) fail(errors, `schemaVersion must be ${SCHEMA_VERSION}`)
  for (const key of ['generatedAt', 'simulatedAt', 'expiresAt']) if (!ISO.test(dataset[key]) || Number.isNaN(Date.parse(dataset[key]))) fail(errors, `${key} must be an ISO UTC timestamp`)
  if (Date.parse(dataset.expiresAt) <= Date.parse(dataset.generatedAt)) fail(errors, 'expiresAt must be after generatedAt')
  if (!dataset.warehouse || !dataset.warehouse.name || !DATE.test(dataset.warehouse.date) || !dataset.warehouse.shift) fail(errors, 'warehouse requires name, date, and valid date/shift')
  for (const collection of ['vehicles', 'queue', 'docks', 'alerts']) if (!Array.isArray(dataset[collection])) fail(errors, `${collection} must be an array`)
  if (dataset.docks?.length !== 12) fail(errors, 'docks must contain exactly 12 bays')
  if (!dataset.kpis || !['arrivalsToday', 'averageWaitMinutes', 'activeDocks', 'delayedShipments'].every((key) => Number.isFinite(dataset.kpis[key]))) fail(errors, 'kpis must contain numeric arrivalsToday, averageWaitMinutes, activeDocks, delayedShipments')
  const vehicleIds = new Set()
  const plates = new Set()
  for (const vehicle of dataset.vehicles || []) {
    if (!vehicle.vehicleId || vehicleIds.has(vehicle.vehicleId)) fail(errors, `Duplicate or missing vehicleId: ${vehicle.vehicleId || '(empty)'}`)
    if (vehicle.plate && plates.has(vehicle.plate)) fail(errors, `Duplicate plate: ${vehicle.plate}`)
    vehicleIds.add(vehicle.vehicleId); plates.add(vehicle.plate)
  }
  const dockIds = new Set()
  for (const dock of dataset.docks || []) {
    if (!dock.dockId || dockIds.has(dock.dockId)) fail(errors, `Duplicate or missing dockId: ${dock.dockId || '(empty)'}`)
    dockIds.add(dock.dockId)
    if (dock.vehicleId && !vehicleIds.has(dock.vehicleId)) fail(errors, `Dock ${dock.dockId} references unknown vehicle ${dock.vehicleId}`)
    if (dock.progress < 0 || dock.progress > 100) fail(errors, `Dock ${dock.dockId} progress must be 0-100`)
  }
  for (const item of dataset.queue || []) if (!vehicleIds.has(item.vehicleId)) fail(errors, `Queue position ${item.position} references unknown vehicle ${item.vehicleId}`)
  if (dataset.nowCalling) {
    const dock = (dataset.docks || []).find((item) => item.dockId === dataset.nowCalling.dockId)
    const vehicle = (dataset.vehicles || []).find((item) => item.vehicleId === dataset.nowCalling.vehicleId)
    if (!dock || !vehicle) fail(errors, 'nowCalling must reference an existing dock and vehicle')
    else if (dock.vehicleId !== vehicle.vehicleId || dock.plate !== vehicle.plate) fail(errors, 'nowCalling vehicle must match the assigned dock vehicle')
  }
  if (!dataset.integrity?.checksum || !dataset.integrity?.recordCounts) fail(errors, 'integrity checksum and recordCounts are required')
  if (dataset.integrity?.recordCounts && dataset.integrity.recordCounts.vehicles !== dataset.vehicles?.length) fail(errors, 'integrity vehicle count does not match records')
  if (dataset.integrity?.recordCounts && dataset.integrity.recordCounts.queue !== dataset.queue?.length) fail(errors, 'integrity queue count does not match records')
  if (dataset.integrity?.recordCounts && dataset.integrity.recordCounts.docks !== dataset.docks?.length) fail(errors, 'integrity dock count does not match records')
  if (dataset.integrity?.recordCounts && dataset.integrity.recordCounts.alerts !== dataset.alerts?.length) fail(errors, 'integrity alert count does not match records')
  if (dataset.integrity?.checksum) {
    const { integrity, ...withoutIntegrity } = dataset
    const expected = crypto.createHash('sha256').update(JSON.stringify(withoutIntegrity)).digest('hex')
    if (expected !== integrity.checksum) fail(errors, 'integrity checksum does not match dataset content')
  }
  return { valid: errors.length === 0, errors }
}

export function readAndValidate(filePath) {
  let dataset
  try { dataset = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch (error) { return { valid: false, errors: [`Cannot read JSON: ${error.message}`] } }
  return { dataset, ...validateDataset(dataset) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) { console.error('Usage: npm run simulate:validate -- path/to/dataset.json'); process.exit(1) }
  const result = readAndValidate(path.resolve(file))
  if (!result.valid) { console.error(result.errors.map((error) => `✗ ${error}`).join('\n')); process.exit(1) }
  console.log(`✓ Valid DockFlow dataset: ${result.dataset.datasetId}`)
}
