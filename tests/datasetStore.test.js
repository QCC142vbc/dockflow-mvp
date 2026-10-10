import test from 'node:test'
import assert from 'node:assert/strict'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { recalculateDatasetIntegrity } from '../src/data/datasetFactory.ts'
import {
  deleteDataset,
  duplicateDataset,
  loadDatasets,
  parseImportedDataset,
  saveDataset,
  updateDataset,
} from '../src/data/datasetStore.js'

function withStorage(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map()

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        values.set(key, String(value))
      },
      removeItem(key) {
        values.delete(key)
      },
      clear() {
        values.clear()
      },
    },
  })

  try {
    return run(values)
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete globalThis.localStorage
    }
  }
}

function makeDataset(datasetId, overrides = {}) {
  const dataset = structuredClone(demoDataset)

  dataset.datasetId = datasetId.startsWith('df-') ? datasetId : `df-${datasetId}`
  dataset.datasetName = `Test ${datasetId}`

  if (dataset.simulationConfig) {
    dataset.simulationConfig.datasetName = dataset.datasetName
  }

  Object.assign(dataset, overrides)
  return recalculateDatasetIntegrity(dataset)
}

test('saveDataset persists a valid dataset and rejects duplicate IDs', () => {
  withStorage(() => {
    const dataset = makeDataset('df-test-save')

    saveDataset(dataset)

    assert.equal(
      loadDatasets(demoDataset).find((item) => item.datasetId === 'df-test-save').datasetName,
      'Test df-test-save',
    )

    assert.throws(
      () => saveDataset(dataset),
      /already exists/i,
    )
  })
})

test('updateDataset creates or replaces a saved dataset', () => {
  withStorage(() => {
    const first = makeDataset('df-test-update')
    updateDataset(first)

    const second = makeDataset('df-test-update', {
      datasetName: 'Updated dataset',
    })
    if (second.simulationConfig) {
      second.simulationConfig.datasetName = second.datasetName
    }
    recalculateDatasetIntegrity(second)

    updateDataset(second)

    const loaded = loadDatasets(demoDataset).find(
      (item) => item.datasetId === 'df-test-update',
    )

    assert.equal(loaded.datasetName, 'Updated dataset')
    assert.equal(
      loadDatasets(demoDataset).filter((item) => item.datasetId === 'df-test-update').length,
      1,
    )
  })
})

test('duplicateDataset creates a separate valid copy', () => {
  withStorage(() => {
    const original = makeDataset('df-test-original')
    saveDataset(original)

    const copy = duplicateDataset(original)

    assert.notEqual(copy.datasetId, original.datasetId)
    assert.match(copy.datasetId, /^df-copy-/)
    assert.equal(copy.datasetName, `${original.datasetName} (copy)`)
    assert.ok(
      loadDatasets(demoDataset).some((item) => item.datasetId === copy.datasetId),
    )
  })
})

test('deleteDataset removes saved datasets', () => {
  withStorage(() => {
    const dataset = makeDataset('df-test-delete')
    saveDataset(dataset)

    assert.equal(deleteDataset('df-test-delete', demoDataset), true)
    assert.equal(
      loadDatasets(demoDataset).some((item) => item.datasetId === 'df-test-delete'),
      false,
    )
    assert.equal(deleteDataset('df-test-delete', demoDataset), false)
  })
})

test('deleteDataset hides a bundled demo without deleting other datasets', () => {
  withStorage(() => {
    const custom = makeDataset('df-test-keep')
    saveDataset(custom)

    assert.equal(deleteDataset(demoDataset.datasetId, demoDataset), true)

    const loaded = loadDatasets(demoDataset)

    assert.equal(
      loaded.some((item) => item.datasetId === demoDataset.datasetId),
      false,
    )
    assert.ok(loaded.some((item) => item.datasetId === 'df-test-keep'))
  })
})

test('loadDatasets lets a saved dataset override a bundled demo with the same ID', () => {
  withStorage(() => {
    const saved = makeDataset(demoDataset.datasetId, {
      datasetName: 'Saved version',
    })
    if (saved.simulationConfig) {
      saved.simulationConfig.datasetName = saved.datasetName
    }
    recalculateDatasetIntegrity(saved)

    updateDataset(saved)

    const loaded = loadDatasets(demoDataset)
    const matching = loaded.filter(
      (item) => item.datasetId === demoDataset.datasetId,
    )

    assert.equal(matching.length, 1)
    assert.equal(matching[0].datasetName, 'Saved version')
  })
})

test('parseImportedDataset accepts valid JSON and rejects malformed input', () => {
  const imported = parseImportedDataset(JSON.stringify(demoDataset))

  assert.equal(imported.datasetId, demoDataset.datasetId)

  assert.throws(
    () => parseImportedDataset('{invalid json'),
    /Could not parse imported dataset JSON/i,
  )

  assert.throws(
    () => parseImportedDataset(JSON.stringify({ datasetId: 'invalid' })),
    /Dataset is invalid/i,
  )

  assert.throws(
    () => parseImportedDataset(null),
    /must be provided as JSON text/i,
  )
})

test('loadDatasets reports corrupted saved JSON', () => {
  withStorage((values) => {
    values.set('dockflow.datasets.v1', '{not valid json')

    assert.throws(
      () => loadDatasets(demoDataset),
      /not valid JSON/i,
    )
  })
})

test('loadDatasets rejects saved data that is not a list', () => {
  withStorage((values) => {
    values.set('dockflow.datasets.v1', JSON.stringify({ datasetId: 'invalid' }))

    assert.throws(
      () => loadDatasets(demoDataset),
      /must be stored as a list/i,
    )
  })
})

test('saveDataset reports storage write failures', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem() {
        return null
      },
      setItem() {
        throw new Error('Storage quota exceeded')
      },
    },
  })

  try {
    assert.throws(
      () => saveDataset(makeDataset('df-test-storage-error')),
      /Unable to save datasets.*Storage quota exceeded/i,
    )
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete globalThis.localStorage
    }
  }
})

