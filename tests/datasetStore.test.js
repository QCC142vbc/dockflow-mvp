
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

  const tampered = structuredClone(demoDataset)
  tampered.datasetName = 'Modified without checksum update'

  assert.throws(
    () => parseImportedDataset(JSON.stringify(tampered)),
    /checksum does not match/i,
  )

  const invalidCounts = structuredClone(demoDataset)
  invalidCounts.integrity.recordCounts.vehicles += 1

  assert.throws(
    () => parseImportedDataset(JSON.stringify(invalidCounts)),
    /integrity vehicles count does not match/i,
  )

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

test('loadDatasets rejects duplicate IDs in saved datasets', () => {
  withStorage((values) => {
    const first = makeDataset('df-duplicate-id', {
      datasetName: 'First copy',
    })
    const second = makeDataset('df-duplicate-id', {
      datasetName: 'Second copy',
    })

    values.set(
      'dockflow.datasets.v1',
      JSON.stringify([first, second]),
    )

    assert.throws(
      () => loadDatasets(demoDataset),
      /duplicate dataset ID/i,
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

test('loadDatasets handles corrupted hidden demo IDs gracefully', () => {
  withStorage((values) => {
    values.set('dockflow.datasets.hidden-demo.v1', '{corrupted}')

    // Should not throw, should load demo datasets as visible
    const loaded = loadDatasets(demoDataset)
    assert.ok(loaded.some((item) => item.datasetId === demoDataset.datasetId))
  })
})

test('loadDatasets handles invalid hidden demo IDs structure gracefully', () => {
  withStorage((values) => {
    values.set('dockflow.datasets.hidden-demo.v1', JSON.stringify({ invalid: 'structure' }))

    // Should not throw, should load demo datasets as visible
    const loaded = loadDatasets(demoDataset)
    assert.ok(loaded.some((item) => item.datasetId === demoDataset.datasetId))
  })
})


test('saveDataset rolls back saved data when visibility update fails', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map([
    ['dockflow.datasets.v1', '[]'],
    ['dockflow.datasets.hidden-demo.v1', '[]'],
  ])

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        if (key === 'dockflow.datasets.hidden-demo.v1') {
          throw new Error('Visibility storage failure')
        }

        values.set(key, String(value))
      },
    },
  })

  try {
    assert.throws(
      () => saveDataset(makeDataset('df-rollback-test')),
      /Visibility storage failure/i,
    )

    assert.equal(
      values.get('dockflow.datasets.v1'),
      '[]',
      'Saved datasets should be restored after a failed visibility update.',
    )
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete globalThis.localStorage
    }
  }
})


test('updateDataset rolls back saved data when visibility update fails', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const initialDataset = makeDataset('df-rollback-update', {
    datasetName: 'Original version',
  })
  const updatedDataset = makeDataset('df-rollback-update', {
    datasetName: 'Updated version',
  })

  const values = new Map([
    ['dockflow.datasets.v1', JSON.stringify([initialDataset])],
    ['dockflow.datasets.hidden-demo.v1', '[]'],
  ])

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        if (key === 'dockflow.datasets.hidden-demo.v1') {
          throw new Error('Visibility storage failure')
        }

        values.set(key, String(value))
      },
      removeItem(key) {
        values.delete(key)
      },
    },
  })

  try {
    assert.throws(
      () => updateDataset(updatedDataset),
      /Visibility storage failure/i,
    )

    const stored = JSON.parse(values.get('dockflow.datasets.v1'))

    assert.equal(stored.length, 1)
    assert.equal(stored[0].datasetName, 'Original version')
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete globalThis.localStorage
    }
  }
})

test('deleteDataset rolls back deletion when visibility update fails', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const dataset = makeDataset(demoDataset.datasetId)

  const values = new Map([
    ['dockflow.datasets.v1', JSON.stringify([dataset])],
    ['dockflow.datasets.hidden-demo.v1', '[]'],
  ])

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        if (key === 'dockflow.datasets.hidden-demo.v1') {
          throw new Error('Visibility storage failure')
        }

        values.set(key, String(value))
      },
      removeItem(key) {
        values.delete(key)
      },
    },
  })

  try {
    assert.throws(
      () => deleteDataset(demoDataset.datasetId, demoDataset),
      /Visibility storage failure/i,
    )

    const stored = JSON.parse(values.get('dockflow.datasets.v1'))

    assert.equal(stored.length, 1)
    assert.equal(stored[0].datasetId, demoDataset.datasetId)
    assert.equal(values.get('dockflow.datasets.hidden-demo.v1'), '[]')
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete globalThis.localStorage
    }
  }
})

test('writeTransaction reports rollback failures', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map([
    ['dockflow.datasets.v1', '[]'],
    ['dockflow.datasets.hidden-demo.v1', '[]'],
  ])

  let savedWriteAttempted = false

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        if (key === 'dockflow.datasets.v1') {
          if (!savedWriteAttempted) {
            savedWriteAttempted = true
            values.set(key, String(value))
            return
          }

          throw new Error('Rollback storage failure')
        }

        if (key === 'dockflow.datasets.hidden-demo.v1') {
          throw new Error('Visibility storage failure')
        }

        values.set(key, String(value))
      },
      removeItem(key) {
        values.delete(key)
      },
    },
  })

  try {
    assert.throws(
      () => saveDataset(makeDataset('df-rollback-failure')),
      (error) => {
        assert.match(error.message, /Visibility storage failure/i)
        assert.match(error.message, /Rollback also failed/i)
        assert.match(error.message, /Rollback storage failure/i)
        return true
      },
    )
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete globalThis.localStorage
    }
  }
})
