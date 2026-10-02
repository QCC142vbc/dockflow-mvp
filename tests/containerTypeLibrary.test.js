import test from 'node:test'
import assert from 'node:assert/strict'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { validateCargoComplianceData } from '../src/data/cargoComplianceValidation.ts'
import { createStarterContainerTypes } from '../src/data/containerTypeDefaults.ts'
import {
  deleteContainerType,
  duplicateContainerType,
  getContainerTypeReferences,
  setContainerTypeActive,
  upsertContainerType,
} from '../src/data/containerTypeLibrary.ts'
import { recalculateDatasetIntegrity } from '../src/data/datasetFactory.ts'
import { loadDatasets, updateDataset } from '../src/data/datasetStore.js'

const emptyData = () => ({ cargo: [], containerTypes: [], adrRecords: [], handlingRequirements: [] })

function container(overrides = {}) {
  return {
    containerTypeId: 'container-custom',
    code: 'CUST1',
    name: 'Custom container',
    category: 'other',
    nominalLengthM: 6,
    widthM: 2.4,
    heightM: 2.5,
    tareWeightKg: 2000,
    maxGrossWeightKg: 30000,
    payloadCapacityKg: 28000,
    refrigerated: false,
    tank: false,
    openTop: false,
    flatRack: false,
    active: true,
    ...overrides,
  }
}

test('creates and edits container type definitions with validated unique codes', () => {
  const created = upsertContainerType(emptyData(), container())
  assert.equal(created.containerTypes.length, 1)
  assert.deepEqual(validateCargoComplianceData(created, new Set()), [])

  const edited = upsertContainerType(created, container({ name: 'Custom container rev 2', code: 'CUST2' }))
  assert.equal(edited.containerTypes.length, 1)
  assert.equal(edited.containerTypes[0].name, 'Custom container rev 2')

  assert.throws(
    () => upsertContainerType(edited, container({ containerTypeId: 'second', code: 'cust2' })),
    /duplicate container type code/i,
  )
})

test('container edits preserve valid optional vehicle references on cargo records', () => {
  const initial = {
    ...emptyData(),
    containerTypes: [container()],
    cargo: [{
      cargoId: 'cargo-vehicle',
      cargoType: 'General',
      description: 'Cargo on a vehicle',
      quantity: 1,
      quantityUnit: 'unit',
      handlingRequirementIds: [],
      containerTypeId: 'container-custom',
      vehicleId: 'vehicle-1',
    }],
  }
  const updated = upsertContainerType(initial, container({ name: 'Edited type' }), new Set(['vehicle-1']))
  assert.equal(updated.containerTypes[0].name, 'Edited type')
})

test('duplicates definitions using a new ID and code while retaining editable values', () => {
  const original = container()
  const copy = duplicateContainerType(original, [original])
  assert.notEqual(copy.containerTypeId, original.containerTypeId)
  assert.notEqual(copy.code.toUpperCase(), original.code.toUpperCase())
  assert.equal(copy.name, `${original.name} (Copy)`)
  assert.equal(copy.active, true)
  const saved = upsertContainerType({ ...emptyData(), containerTypes: [original] }, copy)
  assert.equal(saved.containerTypes.length, 2)
  assert.deepEqual(validateCargoComplianceData(saved, new Set()), [])
})

test('validates dimensions, gross weight, tare weight, and payload relationships', () => {
  for (const invalid of [
    container({ nominalLengthM: 0 }),
    container({ maxGrossWeightKg: 0 }),
    container({ tareWeightKg: 30000 }),
    container({ payloadCapacityKg: 28001 }),
    container({ code: 'invalid code' }),
  ]) {
    assert.ok(validateCargoComplianceData({ ...emptyData(), containerTypes: [invalid] }, new Set()).length > 0)
  }
})

test('deactivation preserves references and safe deletion refuses referenced types', () => {
  const initial = {
    ...emptyData(),
    containerTypes: [container()],
    cargo: [{
      cargoId: 'cargo-1',
      cargoType: 'General',
      description: 'Referenced cargo',
      quantity: 1,
      quantityUnit: 'pallet',
      containerTypeId: 'container-custom',
      handlingRequirementIds: [],
    }],
  }
  assert.equal(getContainerTypeReferences(initial, 'container-custom').length, 1)
  assert.throws(() => deleteContainerType(initial, 'container-custom'), /1 cargo record/)

  const deactivated = setContainerTypeActive(initial, 'container-custom', false)
  assert.equal(deactivated.containerTypes[0].active, false)
  assert.equal(deactivated.cargo[0].containerTypeId, 'container-custom')
  assert.equal(deleteContainerType({ ...deactivated, cargo: [] }, 'container-custom').containerTypes.length, 0)
})

test('starter types are normal configurable and independently mutable records', () => {
  const first = createStarterContainerTypes()
  const second = createStarterContainerTypes()
  assert.equal(first.length, 9)
  assert.equal(new Set(first.map((item) => item.code)).size, first.length)
  assert.deepEqual(validateCargoComplianceData({ ...emptyData(), containerTypes: first }, new Set()), [])
  first[0].name = 'Changed in working copy'
  assert.notEqual(first[0].name, second[0].name)
})

test('container catalog creation and edits persist through the existing dataset store', () => {
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  })
  try {
    const createdCatalog = upsertContainerType(
      { ...emptyData(), containerTypes: createStarterContainerTypes() },
      container(),
    )
    const firstSave = recalculateDatasetIntegrity({ ...structuredClone(demoDataset), cargoCompliance: createdCatalog })
    updateDataset(firstSave)
    assert.equal(loadDatasets(demoDataset).find((item) => item.datasetId === demoDataset.datasetId).cargoCompliance.containerTypes.length, 10)

    const editedCatalog = upsertContainerType(createdCatalog, container({ name: 'Persisted edit', code: 'CUST2' }))
    const secondSave = recalculateDatasetIntegrity({ ...firstSave, cargoCompliance: editedCatalog })
    updateDataset(secondSave)
    const reloaded = loadDatasets(demoDataset).find((item) => item.datasetId === demoDataset.datasetId)
    assert.equal(reloaded.cargoCompliance.containerTypes.find((item) => item.containerTypeId === 'container-custom').name, 'Persisted edit')
  } finally {
    delete globalThis.localStorage
  }
})
