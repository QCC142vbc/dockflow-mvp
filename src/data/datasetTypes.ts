export type SimulationScenario = 'normal' | 'busy-day' | 'disruption' | 'maintenance'

export interface SimulationInputConfig {
  datasetName: string
  scenario: SimulationScenario
  simulationDateTime: string
  dockCount: number
  vehicleCount: number
  utilizationTarget: number
  averageServiceMinutes: number
  averageArrivalIntervalMinutes: number
  warehouseName: string
  incomingShipments: number
  outgoingShipments: number
  priorityPercent: number
  carrierName: string
  optionalNotes: string
  maintenanceDockCount: number
  disruptionDelayMinutes: number
  seed: number
}

export interface SimulationPreview {
  scenario: SimulationScenario
  datasetName: string
  simulationDateTime: string
  dockCount: number
  vehicleCount: number
  availableCapacity: number
  expectedActiveDocks: number
  queueLength: number
  arrivalsToday: number
  estimatedAverageWaitMinutes: number
  capacityUtilization: number
}

export interface VehicleRecord {
  vehicleId: string
  plate: string
  carrier: string
  direction: 'Inbound' | 'Outbound'
  loadType: string
  palletCount: number
  appointmentTime: string
}

export interface QueueRecord {
  queueId: string
  position: number
  vehicleId: string
  plate: string
  carrier: string
  loadType: string
  arrivalTime: string
  estimatedCallTime: string
  priority: 'Priority' | 'Delayed' | 'Documentation check' | 'Standard'
}

export interface DockRecord {
  dockId: string
  state: 'Available' | 'Loading' | 'Unloading' | 'Cleaning' | 'Maintenance' | 'Delayed'
  status: 'available' | 'loading' | 'unloading' | 'cleaning' | 'maintenance' | 'delayed' | 'called'
  vehicleId: string | null
  plate: string
  carrier: string
  direction: 'Inbound' | 'Outbound' | 'All'
  progress: number
  elapsedSeconds: number
  appointmentTime: string
  notes: string
  capabilityCodes?: string[]
}

export interface AlertRecord {
  alertId?: string
  id?: string
  dockId: string
  severity: 'critical' | 'warning' | 'info'
  code: string
  description: string
  action: string
  elapsedSeconds: number
}

export interface SimulationKpis {
  arrivalsToday: number
  averageWaitMinutes: number
  activeDocks: number
  delayedShipments: number
  throughputEstimate: number
  averageProcessingMinutes: number
  queueLength: number
  onTimeRate: number
  availableCapacity: number
  capacityUtilization: number
}

export interface DatasetIntegrity {
  checksum: string
  recordCounts: {
    vehicles: number
    queue: number
    docks: number
    alerts: number
  }
}

export type ContainerCategory = 'standard' | 'reefer' | 'tank' | 'open-top' | 'flat-rack' | 'other'

export interface ContainerTypeDefinition {
  containerTypeId: string
  code: string
  name: string
  category: ContainerCategory
  nominalLengthM: number
  widthM: number
  heightM: number
  maxGrossWeightKg: number
  tareWeightKg?: number
  payloadCapacityKg?: number
  refrigerated: boolean
  tank: boolean
  openTop: boolean
  flatRack: boolean
  active: boolean
  isoCategory?: string
  typicalUse?: string
  temperatureControlled?: boolean
  adrCompatible?: boolean
  requiredDockCapabilityCode?: string
  notes?: string
}

export type ADRStatus = 'applicable' | 'not-applicable' | 'unknown'
export type ADRHazardClass = '1' | '2' | '3' | '4.1' | '4.2' | '4.3' | '5.1' | '5.2' | '6.1' | '6.2' | '7' | '8' | '9'
export type ADRPackingGroup = 'I' | 'II' | 'III'

export interface ADRRecord {
  adrRecordId: string
  status: ADRStatus
  active?: boolean
  requiredDockCapabilityCode?: string
  unNumber?: string
  properShippingName?: string
  hazardClass?: ADRHazardClass
  classificationCode?: string
  packingGroup?: ADRPackingGroup
  tunnelRestrictionCode?: string
  category?: string
  source?: string
  referenceVersion?: string
  notes?: string
  additionalNotes?: string
}

export type ADRAuditEventType =
  | 'record-created'
  | 'record-activated'
  | 'record-deactivated'
  | 'adr-enabled'
  | 'adr-status-changed'
  | 'un-number-changed'
  | 'proper-shipping-name-changed'
  | 'hazard-class-changed'
  | 'packing-group-changed'
  | 'tunnel-restriction-changed'

export interface ADRAuditEvent {
  eventId: string
  timestamp: string
  adrRecordId: string
  eventType: ADRAuditEventType
  previousValue?: string
  newValue?: string
}

export type CargoAssignmentEventType =
  | 'cargo-assigned'
  | 'cargo-unassigned'
  | 'container-type-changed'
  | 'adr-information-changed'
  | 'handling-requirement-changed'

export interface CargoAssignmentEvent {
  eventId: string
  timestamp: string
  type: CargoAssignmentEventType
  vehicleId: string
  cargoId: string
  description: string
}

export type HandlingRequirementCategory = 'temperature' | 'environment' | 'security' | 'safety' | 'physical' | 'other'
export type HandlingRequirementValue = string | number | boolean

export interface HandlingRequirementDefinition {
  handlingRequirementId: string
  code: string
  name: string
  category: HandlingRequirementCategory
  active: boolean
  requiredDockCapabilityCode?: string
  description?: string
  cargoExamples?: string[]
  attributes?: Record<string, HandlingRequirementValue>
}

export interface PackagingTypeDefinition {
  packagingTypeId: string
  name: string
  material: string
  reusable: boolean
  stackable: boolean
  adrCompatible?: boolean | null
  typicalCargo: string[]
  active: boolean
}

export interface TemperatureProfileDefinition {
  temperatureProfileId: string
  name: string
  minimumCelsius?: number
  maximumCelsius?: number
  active: boolean
  notes?: string
}

export type CargoCategory =
  | 'General Cargo'
  | 'Palletized Cargo'
  | 'Boxed Cargo'
  | 'Liquid Cargo'
  | 'Bulk Cargo'
  | 'Dangerous Goods'
  | 'Refrigerated Cargo'
  | 'Oversized Cargo'
  | 'Fragile Cargo'
  | 'High Value Cargo'

export interface CargoRecord {
  cargoId: string
  cargoType: string
  description: string
  quantity: number
  quantityUnit: string
  weightKg?: number
  volumeM3?: number
  containerTypeId?: string
  adrRecordId?: string
  handlingRequirementIds: string[]
  vehicleId?: string
  shipmentId?: string
  operationId?: string
  name?: string
  category?: CargoCategory
  adrRequired?: boolean
  packagingTypeId?: string
  temperatureProfileId?: string
  specialHandling?: string
  active?: boolean
  notes?: string
}

export interface CargoComplianceData {
  cargo: CargoRecord[]
  containerTypes: ContainerTypeDefinition[]
  adrRecords: ADRRecord[]
  adrAuditHistory?: ADRAuditEvent[]
  cargoAssignmentHistory?: CargoAssignmentEvent[]
  handlingRequirements: HandlingRequirementDefinition[]
  packagingTypes?: PackagingTypeDefinition[]
  temperatureProfiles?: TemperatureProfileDefinition[]
  catalogDefaultsVersion?: string
}

export interface DatasetMetadata {
  datasetId: string
  schemaVersion: '1.0.0'
  scenario: SimulationScenario
  generatedAt: string
  simulatedAt: string
  expiresAt: string
  datasetName?: string
  warehouse: {
    name: string
    date: string
    shift: string
  }
}

export interface OperationalEntities {
  nowCalling: {
    vehicleId: string
    dockId: string
    instruction: string
    estimatedStart: string
  } | null
  vehicles: VehicleRecord[]
  queue: QueueRecord[]
  docks: DockRecord[]
  alerts: AlertRecord[]
}

export interface SimulationResults {
  kpis: SimulationKpis
  integrity: DatasetIntegrity
}

export interface OperationsDataset extends DatasetMetadata, OperationalEntities, SimulationResults {
  simulationConfig?: SimulationInputConfig
  cargoCompliance?: CargoComplianceData
}
