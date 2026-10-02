import type { ContainerTypeDefinition } from './datasetTypes'

export const STARTER_CONTAINER_TYPES: readonly ContainerTypeDefinition[] = [
  { containerTypeId: 'container-20-standard', code: '20STD', name: '20ft Standard', category: 'standard', nominalLengthM: 6.058, widthM: 2.438, heightM: 2.591, tareWeightKg: 2200, maxGrossWeightKg: 30480, payloadCapacityKg: 28280, refrigerated: false, tank: false, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-40-standard', code: '40STD', name: '40ft Standard', category: 'standard', nominalLengthM: 12.192, widthM: 2.438, heightM: 2.591, tareWeightKg: 3700, maxGrossWeightKg: 30480, payloadCapacityKg: 26780, refrigerated: false, tank: false, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-40-high-cube', code: '40HC', name: '40ft High Cube', category: 'standard', nominalLengthM: 12.192, widthM: 2.438, heightM: 2.896, tareWeightKg: 3900, maxGrossWeightKg: 30480, payloadCapacityKg: 26580, refrigerated: false, tank: false, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-45-high-cube', code: '45HC', name: '45ft High Cube', category: 'standard', nominalLengthM: 13.716, widthM: 2.438, heightM: 2.896, tareWeightKg: 4800, maxGrossWeightKg: 30480, payloadCapacityKg: 25680, refrigerated: false, tank: false, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-20-reefer', code: '20RF', name: '20ft Reefer', category: 'reefer', nominalLengthM: 6.058, widthM: 2.438, heightM: 2.591, tareWeightKg: 3000, maxGrossWeightKg: 30480, payloadCapacityKg: 27480, refrigerated: true, tank: false, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-40-reefer', code: '40RF', name: '40ft Reefer', category: 'reefer', nominalLengthM: 12.192, widthM: 2.438, heightM: 2.896, tareWeightKg: 4800, maxGrossWeightKg: 34000, payloadCapacityKg: 29200, refrigerated: true, tank: false, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-tank', code: 'TANK', name: 'Tank Container', category: 'tank', nominalLengthM: 6.058, widthM: 2.438, heightM: 2.591, tareWeightKg: 3600, maxGrossWeightKg: 30480, payloadCapacityKg: 26880, refrigerated: false, tank: true, openTop: false, flatRack: false, active: true },
  { containerTypeId: 'container-open-top', code: 'OT', name: 'Open Top', category: 'open-top', nominalLengthM: 6.058, widthM: 2.438, heightM: 2.591, tareWeightKg: 2300, maxGrossWeightKg: 30480, payloadCapacityKg: 28180, refrigerated: false, tank: false, openTop: true, flatRack: false, active: true },
  { containerTypeId: 'container-flat-rack', code: 'FR', name: 'Flat Rack', category: 'flat-rack', nominalLengthM: 6.058, widthM: 2.438, heightM: 2.591, tareWeightKg: 2800, maxGrossWeightKg: 30480, payloadCapacityKg: 27680, refrigerated: false, tank: false, openTop: false, flatRack: true, active: true },
]

export function createStarterContainerTypes(): ContainerTypeDefinition[] {
  return STARTER_CONTAINER_TYPES.map((containerType) => ({ ...containerType }))
}
