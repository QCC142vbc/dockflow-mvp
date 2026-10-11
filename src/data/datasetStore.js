
import {
  recalculateDatasetIntegrity,
  validateOperationsDataset,
} from './datasetFactory.ts'

const STORAGE_KEY = 'dockflow.datasets.v1'
const HIDDEN_DEMO_KEY = 'dockflow.datasets.hidden-demo.v1'

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error)

const storage = () => {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable.')
    }

    return localStorage
  } catch (error) {
    throw new Error(
      `Unable to access saved datasets: ${getErrorMessage(error)}`,
    )
  }
}

const parseSaved = () => {
  let raw

  try {
    raw = storage().getItem(STORAGE_KEY)
  } catch (error) {
    throw new Error(
      `Unable to read saved datasets: ${getErrorMessage(error)}`,
    )
  }

  if (raw === null) {
    return []
  }

  let values

  try {
    values = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Saved datasets are not valid JSON: ${getErrorMessage(error)}`,
    )
  }

  if (!Array.isArray(values)) {
    throw new Error('Saved datasets must be stored as a list.')
  }

  const seenIds = new Set()

  values.forEach((dataset, index) => {
    const result = validateOperationsDataset(dataset)

    if (!result.valid) {
      throw new Error(
        `Saved dataset ${index + 1} is invalid: ${result.errors.join(' ')}`,
      )
    }

    if (seenIds.has(dataset.datasetId)) {
      throw new Error(
        `Saved datasets contain a duplicate dataset ID: ${dataset.datasetId}`,
      )
    }

    seenIds.add(dataset.datasetId)
  })

  return values
}

/**
 * Applies multiple LocalStorage writes as one logical transaction.
 * If any write fails, all affected keys are restored to their
 * original values.
 */
const writeTransaction = (operations) => {
  const store = storage()
  const snapshots = new Map()

  try {
    for (const operation of operations) {
      if (!snapshots.has(operation.key)) {
        snapshots.set(
          operation.key,
          store.getItem(operation.key),
        )
      }
    }
  } catch (error) {
    throw new Error(
      `Unable to prepare storage update: ${getErrorMessage(error)}`,
    )
  }

  try {
    for (const operation of operations) {
      try {
        store.setItem(operation.key, operation.value)
      } catch (error) {
        throw new Error(
          `${operation.errorPrefix}: ${getErrorMessage(error)}`,
        )
      }
    }
  } catch (writeError) {
    const rollbackErrors = []

    for (const [key, originalValue] of Array.from(snapshots).reverse()) {
      try {
        if (originalValue === null) {
          store.removeItem(key)
        } else {
          store.setItem(key, originalValue)
        }
      } catch (rollbackError) {
        rollbackErrors.push(
          `${key}: ${getErrorMessage(rollbackError)}`,
        )
      }
    }

    if (rollbackErrors.length > 0) {
      throw new Error(
        `${getErrorMessage(writeError)} Rollback also failed: ${rollbackErrors.join('; ')}`,
      )
    }

    throw writeError
  }
}

const readHiddenDemoIds = () => {
  let raw

  try {
    raw = storage().getItem(HIDDEN_DEMO_KEY)
  } catch (error) {
    console.warn(
      `Unable to read dataset visibility settings: ${getErrorMessage(error)}`,
    )
    return []
  }

  if (raw === null) {
    return []
  }

  let values

  try {
    values = JSON.parse(raw)
  } catch (error) {
    console.warn(
      `Dataset visibility settings are corrupted: ${getErrorMessage(error)}. Resetting to all visible.`,
    )
    return []
  }

  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string')
  ) {
    console.warn(
      'Dataset visibility settings are invalid. Resetting to all visible.',
    )
    return []
  }

  return values
}

const requireValid = (dataset) => {
  const result = validateOperationsDataset(dataset)

  if (!result.valid) {
    throw new Error(`Dataset is invalid: ${result.errors.join(' ')}`)
  }
}

const normalizeDemoItems = (bundledDemo) => {
  if (bundledDemo === undefined || bundledDemo === null) {
    return []
  }

  return Array.isArray(bundledDemo) ? bundledDemo : [bundledDemo]
}

export function loadDatasets(bundledDemo) {
  const saved = parseSaved()
  const demoItems = normalizeDemoItems(bundledDemo)

  demoItems.forEach(requireValid)

  const hiddenDemoIds = new Set(readHiddenDemoIds())
  const byId = new Map()

  demoItems
    .filter((dataset) => !hiddenDemoIds.has(dataset.datasetId))
    .forEach((dataset) => {
      byId.set(dataset.datasetId, dataset)
    })

  // Saved datasets intentionally override bundled demos with matching IDs.
  saved.forEach((dataset) => {
    byId.set(dataset.datasetId, dataset)
  })

  return Array.from(byId.values())
}

export function saveDataset(dataset) {
  requireValid(dataset)

  const saved = parseSaved()

  if (saved.some((item) => item.datasetId === dataset.datasetId)) {
    throw new Error(`Dataset ID ${dataset.datasetId} already exists.`)
  }

  const hiddenIds = readHiddenDemoIds().filter(
    (id) => id !== dataset.datasetId,
  )

  writeTransaction([
    {
      key: STORAGE_KEY,
      value: JSON.stringify([...saved, dataset]),
      errorPrefix: 'Unable to save datasets',
    },
    {
      key: HIDDEN_DEMO_KEY,
      value: JSON.stringify(hiddenIds),
      errorPrefix: 'Unable to update dataset visibility',
    },
  ])

  return dataset
}

export function updateDataset(dataset) {
  requireValid(dataset)

  const saved = parseSaved()
  const index = saved.findIndex(
    (item) => item.datasetId === dataset.datasetId,
  )
  const updated = [...saved]

  if (index < 0) {
    updated.push(dataset)
  } else {
    updated[index] = dataset
  }

  const hiddenIds = readHiddenDemoIds().filter(
    (id) => id !== dataset.datasetId,
  )

  writeTransaction([
    {
      key: STORAGE_KEY,
      value: JSON.stringify(updated),
      errorPrefix: 'Unable to save datasets',
    },
    {
      key: HIDDEN_DEMO_KEY,
      value: JSON.stringify(hiddenIds),
      errorPrefix: 'Unable to update dataset visibility',
    },
  ])

  return dataset
}

export function deleteDataset(datasetId, bundledDemo) {
  if (typeof datasetId !== 'string' || !datasetId) {
    throw new Error('A dataset ID is required.')
  }

  const saved = parseSaved()
  const updated = saved.filter(
    (item) => item.datasetId !== datasetId,
  )

  const demoItems = normalizeDemoItems(bundledDemo)
  const isBundledDemo = demoItems.some(
    (dataset) => dataset.datasetId === datasetId,
  )

  const operations = [
    {
      key: STORAGE_KEY,
      value: JSON.stringify(updated),
      errorPrefix: 'Unable to save datasets',
    },
  ]

  if (isBundledDemo) {
    const hiddenIds = readHiddenDemoIds()

    operations.push({
      key: HIDDEN_DEMO_KEY,
      value: JSON.stringify(
        Array.from(new Set([...hiddenIds, datasetId])),
      ),
      errorPrefix: 'Unable to update dataset visibility',
    })
  }

  writeTransaction(operations)

  return updated.length !== saved.length || isBundledDemo
}

export function duplicateDataset(dataset) {
  requireValid(dataset)

  const copy = JSON.parse(JSON.stringify(dataset))
  const suffix = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

  copy.datasetId = `df-copy-${suffix}`
  copy.datasetName = `${dataset.datasetName || dataset.warehouse.name} (copy)`

  if (copy.simulationConfig) {
    copy.simulationConfig.datasetName = copy.datasetName
  }

  recalculateDatasetIntegrity(copy)

  return saveDataset(copy)
}

export function parseImportedDataset(text) {
  if (typeof text !== 'string') {
    throw new Error('Imported dataset must be provided as JSON text.')
  }

  let dataset

  try {
    dataset = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `Could not parse imported dataset JSON: ${getErrorMessage(error)}`,
    )
  }

  requireValid(dataset)

  return dataset
}
