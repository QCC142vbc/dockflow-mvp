import type {
  CargoComplianceData,
  CargoRecord,
  HandlingRequirementDefinition,
  PackagingTypeDefinition,
  TemperatureProfileDefinition,
} from './datasetTypes'
import { createStarterContainerTypes } from './containerTypeDefaults.ts'

export const CARGO_MASTER_DATA_DEFAULTS_VERSION = '1'

const packageDefaults: PackagingTypeDefinition[] = [
  { packagingTypeId: 'pack-cardboard-box', name: 'Cardboard Box', material: 'Cardboard', reusable: false, stackable: true, typicalCargo: ['Consumer electronics', 'Automotive filters'], active: true },
  { packagingTypeId: 'pack-wooden-crate', name: 'Wooden Crate', material: 'Wood', reusable: true, stackable: true, typicalCargo: ['Industrial spare parts', 'Laboratory equipment'], active: true },
  { packagingTypeId: 'pack-plastic-crate', name: 'Plastic Crate', material: 'Plastic', reusable: true, stackable: true, typicalCargo: ['Fresh dairy products', 'Packaged food'], active: true },
  { packagingTypeId: 'pack-steel-drum', name: 'Steel Drum', material: 'Steel', reusable: true, stackable: true, typicalCargo: ['Industrial liquids', 'Chemical products'], active: true },
  { packagingTypeId: 'pack-plastic-drum', name: 'Plastic Drum', material: 'Plastic', reusable: true, stackable: true, typicalCargo: ['Industrial liquids', 'Cleaning products'], active: true },
  { packagingTypeId: 'pack-ibc', name: 'IBC', material: 'Composite or metal (configure per unit)', reusable: true, stackable: true, typicalCargo: ['Bulk liquids', 'Industrial materials'], active: true },
  { packagingTypeId: 'pack-bag', name: 'Bag', material: 'Paper or woven material', reusable: false, stackable: true, typicalCargo: ['Grain', 'Powdered materials'], active: true },
  { packagingTypeId: 'pack-big-bag', name: 'Big Bag', material: 'Woven polypropylene', reusable: false, stackable: false, typicalCargo: ['Grain', 'Mineral aggregate'], active: true },
  { packagingTypeId: 'pack-pallet', name: 'Pallet', material: 'Configure per pallet', reusable: true, stackable: true, typicalCargo: ['Packaged food', 'Industrial spare parts'], active: true },
  { packagingTypeId: 'pack-wooden-pallet', name: 'Wooden Pallet', material: 'Wood', reusable: true, stackable: true, typicalCargo: ['Industrial spare parts', 'Consumer goods'], active: true },
  { packagingTypeId: 'pack-euro-pallet', name: 'Euro Pallet', material: 'Wood (configure pallet specification)', reusable: true, stackable: true, typicalCargo: ['Bottled water', 'Packaged food'], active: true },
  { packagingTypeId: 'pack-intermediate-bulk-container', name: 'Intermediate Bulk Container', material: 'Configure per unit', reusable: true, stackable: true, typicalCargo: ['Bulk liquids', 'Industrial materials'], active: true },
]

const temperatureDefaults: TemperatureProfileDefinition[] = [
  { temperatureProfileId: 'temp-ambient', name: 'Ambient', minimumCelsius: 15, maximumCelsius: 25, active: true },
  { temperatureProfileId: 'temp-cool', name: 'Cool', minimumCelsius: 8, maximumCelsius: 15, active: true },
  { temperatureProfileId: 'temp-refrigerated', name: 'Refrigerated', minimumCelsius: 2, maximumCelsius: 8, active: true },
  { temperatureProfileId: 'temp-frozen', name: 'Frozen', minimumCelsius: -18, maximumCelsius: -10, active: true, notes: 'Cargo-specific target may be narrower; configure as required.' },
  { temperatureProfileId: 'temp-deep-frozen', name: 'Deep Frozen', minimumCelsius: -25, maximumCelsius: -18, active: true },
  { temperatureProfileId: 'temp-controlled', name: 'Controlled Temperature', active: true, notes: 'Set minimum and maximum for the cargo or customer requirement.' },
  { temperatureProfileId: 'temp-protect-heat', name: 'Protect From Heat', active: true, notes: 'Set a maximum temperature for the cargo requirement.' },
  { temperatureProfileId: 'temp-custom', name: 'Custom Temperature Range', active: true, notes: 'Configure a minimum, maximum, or both.' },
]

const examples: [string, string][] = [
  ['Consumer electronics', 'Precision electronics'],
  ['Packaged food pallet', 'Bottled water pallet'],
  ['Automotive filters', 'Mechanical components'],
  ['Industrial liquids', 'Cleaning products'],
  ['Grain', 'Mineral aggregate'],
  ['General non-dangerous freight', 'Non-ADR packaged goods'],
  ['Frozen food', 'Fresh dairy products'],
  ['Industrial generator', 'Construction machinery'],
  ['Glass products', 'Laboratory equipment'],
  ['Server equipment', 'Precision electronics'],
  ['Industrial generator', 'Machine assembly'],
  ['Palletized freight', 'Cartoned spare parts'],
  ['Temperature-sensitive food', 'Cool-chain pharmaceuticals'],
  ['Outdoor equipment', 'Moisture-sensitive cartons'],
  ['Upright machinery', 'Glass products'],
]

const handlingNames = [
  'Standard Handling', 'Fragile', 'Heavy Lift', 'Forklift Required', 'Crane Required',
  'No Forklift', 'Manual Handling Only', 'Temperature Controlled', 'Keep Dry',
  'Keep Upright', 'Protect From Heat', 'Protect From Sunlight',
  'Dangerous Goods Handling', 'Spill Protection', 'Grounding Required',
]

const handlingCategories: HandlingRequirementDefinition['category'][] = [
  'other', 'physical', 'physical', 'physical', 'physical', 'physical', 'physical',
  'temperature', 'environment', 'physical', 'environment', 'environment',
  'safety', 'safety', 'safety',
]

const handlingDefaults: HandlingRequirementDefinition[] = handlingNames.map((name, index) => ({
  handlingRequirementId: `handling-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
  code: `HAND-${String(index + 1).padStart(2, '0')}`,
  name,
  category: handlingCategories[index],
  active: true,
  cargoExamples: examples[index],
}))

const cargoDefaults: CargoRecord[] = [
  ['Consumer Electronics', 'General Cargo', 'pack-cardboard-box', 'container-40-high-cube', [], 'temp-ambient'],
  ['Industrial Spare Parts', 'General Cargo', 'pack-wooden-pallet', 'container-40-standard', [], 'temp-ambient'],
  ['Bottled Water Pallet', 'Palletized Cargo', 'pack-euro-pallet', 'container-40-standard', [], 'temp-ambient'],
  ['Packaged Food Pallet', 'Palletized Cargo', 'pack-euro-pallet', 'container-40-standard', [], 'temp-ambient'],
  ['Automotive Filters', 'Boxed Cargo', 'pack-cardboard-box', 'container-40-standard', [], 'temp-ambient'],
  ['Mechanical Components', 'Boxed Cargo', 'pack-cardboard-box', 'container-40-standard', [], 'temp-ambient'],
  ['Grain', 'Bulk Cargo', 'pack-big-bag', 'container-40-standard', [], 'temp-ambient'],
  ['Mineral Aggregate', 'Bulk Cargo', 'pack-big-bag', 'container-40-standard', [], 'temp-ambient'],
  ['Frozen Food', 'Refrigerated Cargo', 'pack-plastic-crate', 'container-40-reefer', ['Temperature Controlled', 'Keep Upright'], 'temp-frozen'],
  ['Fresh Dairy Products', 'Refrigerated Cargo', 'pack-plastic-crate', 'container-40-reefer', ['Temperature Controlled'], 'temp-refrigerated'],
  ['Industrial Generator', 'Oversized Cargo', 'pack-pallet', 'container-flat-rack', ['Heavy Lift', 'Crane Required'], 'temp-ambient'],
  ['Construction Machinery', 'Oversized Cargo', 'pack-pallet', 'container-flat-rack', ['Heavy Lift', 'Crane Required'], 'temp-ambient'],
  ['Glass Products', 'Fragile Cargo', 'pack-wooden-crate', 'container-flat-rack', ['Fragile', 'Keep Upright'], 'temp-ambient'],
  ['Laboratory Equipment', 'Fragile Cargo', 'pack-wooden-crate', 'container-40-high-cube', ['Fragile', 'Keep Upright'], 'temp-ambient'],
  ['Server Equipment', 'High Value Cargo', 'pack-cardboard-box', 'container-40-high-cube', ['Fragile', 'Keep Dry'], 'temp-ambient'],
  ['Precision Electronics', 'High Value Cargo', 'pack-cardboard-box', 'container-40-high-cube', ['Fragile', 'Keep Dry'], 'temp-ambient'],
].map(([name, category, packagingId, containerId, handlingNamesForCargo, temperatureId], index) => ({
  cargoId: `cargo-profile-${String(index + 1).padStart(2, '0')}`,
  cargoType: category,
  name,
  category: category as CargoRecord['category'],
  description: `${name} master-data profile`,
  quantity: 1,
  quantityUnit: 'load',
  containerTypeId: containerId,
  packagingTypeId: packagingId,
  temperatureProfileId: temperatureId,
  handlingRequirementIds: (handlingNamesForCargo as string[]).map((requirementName) =>
    handlingDefaults.find((item) => item.name === requirementName)!.handlingRequirementId),
  adrRequired: false,
  active: true,
  notes: 'Starter profile; set consignment-specific quantities and measurements when creating an operational cargo record.',
}))

export function createStarterMasterData(): CargoComplianceData {
  const containerTypes = createStarterContainerTypes().map((container) => ({
    ...container,
    isoCategory: container.category === 'standard' ? 'Standard dry' : container.category,
    typicalUse: container.refrigerated ? 'Temperature-controlled cargo' : container.category === 'tank' ? 'Liquid cargo; configure per tank specification' : 'General cargo; confirm fit for load',
    temperatureControlled: container.refrigerated,
    notes: container.category === 'tank' ? 'Dimensions and capacities vary by equipment; verify the individual unit.' : container.notes,
  }))
  const twentyFootTank = containerTypes.find((container) => container.containerTypeId === 'container-tank')!
  const flatRack = containerTypes.find((container) => container.containerTypeId === 'container-flat-rack')!
  containerTypes.push(
    {
      ...twentyFootTank,
      containerTypeId: 'container-20-tank',
      code: '20TANK',
      name: '20ft Tank Container',
      typicalUse: 'Liquid cargo; confirm tank specification for the individual unit',
    },
    {
      ...twentyFootTank,
      containerTypeId: 'container-chemical-tank',
      code: 'CHEMTANK',
      name: 'Chemical Tank Container',
      typicalUse: 'Chemical liquid cargo; confirm tank specification and material compatibility',
      notes: 'Illustrative catalog definition only. Confirm dimensions, pressure rating, material, and approvals for the individual tank.',
    },
    {
      ...flatRack,
      containerTypeId: 'container-platform',
      code: 'PLATFORM',
      name: 'Platform Container',
      flatRack: false,
      isoCategory: 'Platform',
      typicalUse: 'Project cargo; confirm platform dimensions and lashing points for the individual unit',
      notes: 'Illustrative catalog definition only. Confirm dimensions and ratings for the individual unit.',
    },
  )
  return {
    cargo: cargoDefaults.map((record) => ({ ...record, handlingRequirementIds: [...record.handlingRequirementIds] })),
    containerTypes,
    adrRecords: [],
    handlingRequirements: handlingDefaults.map((item) => ({ ...item, cargoExamples: [...(item.cargoExamples ?? [])] })),
    packagingTypes: packageDefaults.map((item) => ({ ...item, typicalCargo: [...item.typicalCargo] })),
    temperatureProfiles: temperatureDefaults.map((item) => ({ ...item })),
    catalogDefaultsVersion: CARGO_MASTER_DATA_DEFAULTS_VERSION,
  }
}

function mergeById<T>(
  existing: T[] | undefined,
  defaults: T[],
  getId: (record: T) => string,
  conflicts: (candidate: T, existing: T[]) => boolean = () => false,
): T[] {
  const saved = existing ?? []
  const ids = new Set(saved.map(getId))
  return [...saved, ...defaults.filter((record) => !ids.has(getId(record)) && !conflicts(record, saved))]
}

export function mergeStarterMasterData(existing?: CargoComplianceData): CargoComplianceData {
  const current: CargoComplianceData = existing ?? { cargo: [], containerTypes: [], adrRecords: [], handlingRequirements: [] }
  if (current.catalogDefaultsVersion === CARGO_MASTER_DATA_DEFAULTS_VERSION) return current

  const defaults = createStarterMasterData()
  return {
    ...defaults,
    ...current,
    cargo: mergeById(current.cargo, defaults.cargo, (record) => record.cargoId),
    containerTypes: mergeById(
      current.containerTypes,
      defaults.containerTypes,
      (record) => record.containerTypeId,
      (candidate, saved) => saved.some((record) => record.code.toUpperCase() === candidate.code.toUpperCase()),
    ),
    adrRecords: current.adrRecords ?? defaults.adrRecords,
    handlingRequirements: mergeById(
      current.handlingRequirements,
      defaults.handlingRequirements,
      (record) => record.handlingRequirementId,
      (candidate, saved) => saved.some((record) => record.code === candidate.code),
    ),
    packagingTypes: mergeById(current.packagingTypes, defaults.packagingTypes ?? [], (record) => record.packagingTypeId),
    temperatureProfiles: mergeById(current.temperatureProfiles, defaults.temperatureProfiles ?? [], (record) => record.temperatureProfileId),
    catalogDefaultsVersion: CARGO_MASTER_DATA_DEFAULTS_VERSION,
  }
}
