import { recalculateDatasetIntegrity, validateOperationsDataset } from './datasetFactory.ts'

const STORAGE_KEY = 'dockflow.datasets.v1'
const HIDDEN_DEMO_KEY = 'dockflow.datasets.hidden-demo.v1'

const storage = () => {
  try {
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.')
    return localStorage
  } catch (error) {
    throw new Error(`Unable to access saved datasets: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const parseSaved = () => {
  let raw
  try {
    raw = storage().getItem(STORAGE_KEY)
  } catch (error) {
    throw new Error(`Unable to read saved datasets: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (raw === null) return []
  let values
  try {
    values = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Saved datasets are not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(values)) throw new Error('Saved datasets must be stored as a list.')
  values.forEach((dataset, index) => {
    const result = validateOperationsDataset(dataset)
    if (!result.valid) throw new Error(`Saved dataset ${index + 1} is invalid: ${result.errors.join(' ')}`)
  })
  return values
}

const writeSaved = (datasets) => {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(datasets))
  } catch (error) {
    throw new Error(`Unable to save datasets: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const readHiddenDemoIds = () => {
  let raw
  try {
    raw = storage().getItem(HIDDEN_DEMO_KEY)
  } catch (error) {
    throw new Error(`Unable to read dataset visibility settings: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (raw === null) return []
  let values
  try {
    values = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Dataset visibility settings are corrupted: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new Error('Dataset visibility settings are invalid.')
  return values
}

const writeHiddenDemoIds = (ids) => {
  try {
    storage().setItem(HIDDEN_DEMO_KEY, JSON.stringify(ids))
  } catch (error) {
    throw new Error(`Unable to update dataset visibility: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const requireValid = (dataset) => {
  const result = validateOperationsDataset(dataset)
  if (!result.valid) throw new Error(`Dataset is invalid: ${result.errors.join(' ')}`)
}

export function loadDatasets(bundledDemo) {
  const saved = parseSaved()
  const demoItems = bundledDemo === undefined || bundledDemo === null ? [] : Array.isArray(bundledDemo) ? bundledDemo : [bundledDemo]
  demoItems.forEach(requireValid)
  const hiddenDemoIds = new Set(readHiddenDemoIds())
  const byId = new Map()
  demoItems.filter((dataset) => !hiddenDemoIds.has(dataset.datasetId)).forEach((dataset) => byId.set(dataset.datasetId, dataset))
  saved.forEach((dataset) => byId.set(dataset.datasetId, dataset))
  return Array.from(byId.values())
}

export function saveDataset(dataset) {
  requireValid(dataset)
  const saved = parseSaved()
  if (saved.some((item) => item.datasetId === dataset.datasetId)) throw new Error(`Dataset ID ${dataset.datasetId} already exists.`)
  writeSaved([...saved, dataset])
  writeHiddenDemoIds(readHiddenDemoIds().filter((id) => id !== dataset.datasetId))
  return dataset
}

export function updateDataset(dataset) {
  requireValid(dataset)
  const saved = parseSaved()
  const index = saved.findIndex((item) => item.datasetId === dataset.datasetId)
  const updated = [...saved]
  if (index < 0) updated.push(dataset)
  else updated[index] = dataset
  writeSaved(updated)
  writeHiddenDemoIds(readHiddenDemoIds().filter((id) => id !== dataset.datasetId))
  return dataset
}

export function deleteDataset(datasetId, bundledDemo) {
  if (typeof datasetId !== 'string' || !datasetId) throw new Error('A dataset ID is required.')
  const saved = parseSaved()
  const updated = saved.filter((item) => item.datasetId !== datasetId)
  writeSaved(updated)
  const demoItems = bundledDemo === undefined || bundledDemo === null ? [] : Array.isArray(bundledDemo) ? bundledDemo : [bundledDemo]
  const isBundledDemo = demoItems.some((dataset) => dataset.datasetId === datasetId)
  if (isBundledDemo) writeHiddenDemoIds(Array.from(new Set([...readHiddenDemoIds(), datasetId])))
  return updated.length !== saved.length || isBundledDemo
}

export function duplicateDataset(dataset) {
  requireValid(dataset)
  const copy = JSON.parse(JSON.stringify(dataset))
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  copy.datasetId = `df-copy-${suffix}`
  copy.datasetName = `${dataset.datasetName || dataset.warehouse.name} (copy)`
  if (copy.simulationConfig) copy.simulationConfig.datasetName = copy.datasetName
  recalculateDatasetIntegrity(copy)
  return saveDataset(copy)
}

export function parseImportedDataset(text) {
  if (typeof text !== 'string') throw new Error('Imported dataset must be provided as JSON text.')
  let dataset
  try {
    dataset = JSON.parse(text)
  } catch (error) {
    throw new Error(`Could not parse imported dataset JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  requireValid(dataset)
  return dataset
}
