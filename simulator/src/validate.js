import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { scenarios } from './scenarios/index.js'

export const SCHEMA_VERSION = '1.0.0'
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const label = (value) => typeof value === 'string' ? value : '(invalid)'

const fail = (errors, message) => errors.push(message)
const CARGO_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const CARGO_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/
const ADR_UN_NUMBER = /^UN [0-9]{4}$/
const ADR_CLASSES = ['1', '2', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9']
const CONTAINER_CATEGORIES = ['standard', 'reefer', 'tank', 'open-top', 'flat-rack', 'other']
const HANDLING_CATEGORIES = ['temperature', 'environment', 'security', 'safety', 'physical', 'other']
const cargoId = (value) => typeof value === 'string' && CARGO_ID.test(value)
const cargoText = (value) => typeof value === 'string' && value.trim().length > 0
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
const nonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const optionalText = (record, key) => record[key] === undefined || typeof record[key] === 'string'
const optionalNonNegative = (record, key) => record[key] === undefined || nonNegative(record[key])
const optionalPositive = (record, key) => record[key] === undefined || positive(record[key])

function validateCargoCompliance(data, vehicleIds, errors) {
  const prefix = (message) => fail(errors, `cargoCompliance: ${message}`)
  if (!isRecord(data)) return prefix('must be an object.')
  const collections = ['cargo', 'containerTypes', 'adrRecords', 'handlingRequirements']
  for (const name of collections) if (!Array.isArray(data[name])) prefix(`${name} must be an array.`)
  if (collections.some((name) => !Array.isArray(data[name]))) return

  const containerIds = new Set()
  const containerCodes = new Set()
  const adrIds = new Set()
  const handlingIds = new Set()
  const handlingCodes = new Set()
  const cargoIds = new Set()
  for (const item of data.containerTypes) {
    if (!isRecord(item)) { prefix('container type entries must be objects.'); continue }
    const valid = cargoId(item.containerTypeId) && cargoText(item.code) && CARGO_CODE.test(item.code) &&
      cargoText(item.name) && CONTAINER_CATEGORIES.includes(item.category) &&
      positive(item.nominalLengthM) && positive(item.widthM) && positive(item.heightM) &&
      positive(item.maxGrossWeightKg) &&
      ['refrigerated', 'tank', 'openTop', 'flatRack', 'active'].every((key) => typeof item[key] === 'boolean') &&
      optionalNonNegative(item, 'tareWeightKg') && optionalPositive(item, 'payloadCapacityKg') && optionalText(item, 'notes') &&
      (item.requiredDockCapabilityCode === undefined || cargoText(item.requiredDockCapabilityCode) && CARGO_CODE.test(item.requiredDockCapabilityCode)) &&
      !(nonNegative(item.tareWeightKg) && positive(item.maxGrossWeightKg) && item.tareWeightKg >= item.maxGrossWeightKg) &&
      !(positive(item.payloadCapacityKg) && positive(item.maxGrossWeightKg) && item.payloadCapacityKg > item.maxGrossWeightKg - (nonNegative(item.tareWeightKg) ? item.tareWeightKg : 0))
    if (!valid) prefix(`container type ${label(item.containerTypeId)} is malformed or has invalid dimensions/weights.`)
    if (cargoId(item.containerTypeId)) {
      if (containerIds.has(item.containerTypeId)) prefix(`duplicate containerTypeId ${item.containerTypeId}.`)
      containerIds.add(item.containerTypeId)
    }
    if (cargoText(item.code)) {
      const normalizedCode = item.code.toUpperCase()
      if (containerCodes.has(normalizedCode)) prefix(`duplicate container type code ${item.code}.`)
      containerCodes.add(normalizedCode)
    }
  }
  for (const item of data.adrRecords) {
    if (!isRecord(item)) { prefix('ADR entries must be objects.'); continue }
    const statusValid = ['applicable', 'not-applicable', 'unknown'].includes(item.status)
    const valid = cargoId(item.adrRecordId) && statusValid &&
      (item.active === undefined || typeof item.active === 'boolean') &&
      (item.requiredDockCapabilityCode === undefined || cargoText(item.requiredDockCapabilityCode) && CARGO_CODE.test(item.requiredDockCapabilityCode)) &&
      optionalText(item, 'unNumber') && optionalText(item, 'properShippingName') &&
      optionalText(item, 'tunnelRestrictionCode') && optionalText(item, 'additionalNotes') &&
      (item.unNumber === undefined || ADR_UN_NUMBER.test(item.unNumber)) &&
      (item.hazardClass === undefined || ADR_CLASSES.includes(item.hazardClass)) &&
      (item.packingGroup === undefined || ['I', 'II', 'III'].includes(item.packingGroup)) &&
      (item.status !== 'applicable' || ADR_UN_NUMBER.test(item.unNumber ?? '') &&
        cargoText(item.properShippingName) && ADR_CLASSES.includes(item.hazardClass))
    if (!valid) prefix(`ADR record ${label(item.adrRecordId)} is malformed or incomplete.`)
    if (cargoId(item.adrRecordId)) {
      if (adrIds.has(item.adrRecordId)) prefix(`duplicate adrRecordId ${item.adrRecordId}.`)
      adrIds.add(item.adrRecordId)
    }
  }
  if (data.adrAuditHistory !== undefined) {
    if (!Array.isArray(data.adrAuditHistory)) {
      prefix('adrAuditHistory must be an array when provided.')
    } else {
      if (data.adrAuditHistory.length > 500) prefix('adrAuditHistory cannot contain more than 500 events.')
      const eventIds = new Set()
      const eventTypes = ['record-created', 'record-activated', 'record-deactivated', 'adr-enabled', 'adr-status-changed', 'un-number-changed', 'proper-shipping-name-changed', 'hazard-class-changed', 'packing-group-changed', 'tunnel-restriction-changed']
      for (const item of data.adrAuditHistory) {
        if (!isRecord(item)) { prefix('ADR audit events must be objects.'); continue }
        const valid = cargoId(item.eventId) && cargoId(item.adrRecordId) &&
          typeof item.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item.timestamp) &&
          !Number.isNaN(Date.parse(item.timestamp)) &&
          eventTypes.includes(item.eventType) && optionalText(item, 'previousValue') && optionalText(item, 'newValue')
        if (!valid) prefix(`ADR audit event ${label(item.eventId)} is malformed.`)
        if (cargoId(item.eventId)) {
          if (eventIds.has(item.eventId)) prefix(`duplicate ADR audit event ID ${item.eventId}.`)
          eventIds.add(item.eventId)
        }
      }
    }
  }
  if (data.cargoAssignmentHistory !== undefined) {
    if (!Array.isArray(data.cargoAssignmentHistory)) {
      prefix('cargoAssignmentHistory must be an array when provided.')
    } else {
      if (data.cargoAssignmentHistory.length > 500) prefix('cargoAssignmentHistory cannot contain more than 500 events.')
      const eventIds = new Set()
      const eventTypes = ['cargo-assigned', 'cargo-unassigned', 'container-type-changed', 'adr-information-changed', 'handling-requirement-changed']
      for (const item of data.cargoAssignmentHistory) {
        if (!isRecord(item)) { prefix('cargo assignment events must be objects.'); continue }
        const valid = cargoId(item.eventId) && cargoId(item.vehicleId) && cargoId(item.cargoId) &&
          typeof item.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item.timestamp) &&
          !Number.isNaN(Date.parse(item.timestamp)) && eventTypes.includes(item.type) && cargoText(item.description)
        if (!valid) prefix(`cargo assignment event ${label(item.eventId)} is malformed.`)
        if (cargoId(item.eventId)) {
          if (eventIds.has(item.eventId)) prefix(`duplicate cargo assignment event ID ${item.eventId}.`)
          eventIds.add(item.eventId)
        }
      }
    }
  }
  for (const item of data.handlingRequirements) {
    if (!isRecord(item)) { prefix('handling requirement entries must be objects.'); continue }
    const validAttributes = item.attributes === undefined || isRecord(item.attributes) &&
      Object.values(item.attributes).every((value) => typeof value === 'string' || typeof value === 'boolean' ||
        typeof value === 'number' && Number.isFinite(value))
    const valid = cargoId(item.handlingRequirementId) && cargoText(item.code) && CARGO_CODE.test(item.code) &&
      cargoText(item.name) && HANDLING_CATEGORIES.includes(item.category) && typeof item.active === 'boolean' &&
      optionalText(item, 'description') &&
      (item.requiredDockCapabilityCode === undefined || cargoText(item.requiredDockCapabilityCode) && CARGO_CODE.test(item.requiredDockCapabilityCode)) &&
      validAttributes
    if (!valid) prefix(`handling requirement ${label(item.handlingRequirementId)} is malformed.`)
    if (cargoId(item.handlingRequirementId)) {
      if (handlingIds.has(item.handlingRequirementId)) prefix(`duplicate handlingRequirementId ${item.handlingRequirementId}.`)
      handlingIds.add(item.handlingRequirementId)
    }
    if (cargoText(item.code)) {
      if (handlingCodes.has(item.code)) prefix(`duplicate handling requirement code ${item.code}.`)
      handlingCodes.add(item.code)
    }
  }
  for (const item of data.cargo) {
    if (!isRecord(item)) { prefix('cargo entries must be objects.'); continue }
    const requirements = Array.isArray(item.handlingRequirementIds) ? item.handlingRequirementIds : null
    const valid = cargoId(item.cargoId) && cargoText(item.cargoType) && cargoText(item.description) &&
      positive(item.quantity) && cargoText(item.quantityUnit) && optionalNonNegative(item, 'weightKg') &&
      optionalNonNegative(item, 'volumeM3') && requirements !== null && optionalText(item, 'notes') &&
      ['shipmentId', 'operationId', 'vehicleId'].every((key) => item[key] === undefined || cargoId(item[key]))
    if (!valid) prefix(`cargo record ${label(item.cargoId)} is malformed or has invalid quantities/measurements.`)
    if (cargoId(item.cargoId)) {
      if (cargoIds.has(item.cargoId)) prefix(`duplicate cargoId ${item.cargoId}.`)
      cargoIds.add(item.cargoId)
    }
    if (item.containerTypeId !== undefined && (!cargoId(item.containerTypeId) || !containerIds.has(item.containerTypeId))) prefix(`cargo ${label(item.cargoId)} references unknown containerTypeId ${label(item.containerTypeId)}.`)
    if (item.adrRecordId !== undefined && (!cargoId(item.adrRecordId) || !adrIds.has(item.adrRecordId))) prefix(`cargo ${label(item.cargoId)} references unknown adrRecordId ${label(item.adrRecordId)}.`)
    if (item.vehicleId !== undefined && (!cargoId(item.vehicleId) || !vehicleIds.has(item.vehicleId))) prefix(`cargo ${label(item.cargoId)} references unknown vehicleId ${label(item.vehicleId)}.`)
    if (requirements) {
      const seen = new Set()
      for (const reference of requirements) {
        if (!cargoId(reference) || !handlingIds.has(reference)) prefix(`cargo ${label(item.cargoId)} references unknown handlingRequirementId ${label(reference)}.`)
        else if (seen.has(reference)) prefix(`cargo ${label(item.cargoId)} contains duplicate handlingRequirementId ${reference}.`)
        else seen.add(reference)
      }
    }
  }
}

export function validateDataset(dataset) {
  const errors = []
  if (!isRecord(dataset)) return { valid: false, errors: ['Dataset must be an object'] }
  for (const key of ['datasetId', 'schemaVersion', 'scenario', 'generatedAt', 'simulatedAt', 'expiresAt']) if (!dataset[key]) fail(errors, `Missing ${key}`)
  if (typeof dataset.datasetId !== 'string' || !/^df-[a-z0-9-]+$/.test(dataset.datasetId)) fail(errors, 'datasetId must match df-[a-z0-9-]+')
  if (dataset.schemaVersion !== SCHEMA_VERSION) fail(errors, `schemaVersion must be ${SCHEMA_VERSION}`)
  if (typeof dataset.scenario !== 'string' || !Object.hasOwn(scenarios, dataset.scenario)) fail(errors, `scenario must be one of: ${Object.keys(scenarios).join(', ')}`)
  for (const key of ['generatedAt', 'simulatedAt', 'expiresAt']) if (typeof dataset[key] !== 'string' || !ISO.test(dataset[key]) || Number.isNaN(Date.parse(dataset[key]))) fail(errors, `${key} must be an ISO UTC timestamp`)
  if (typeof dataset.expiresAt === 'string' && typeof dataset.generatedAt === 'string' && ISO.test(dataset.expiresAt) && ISO.test(dataset.generatedAt) && Date.parse(dataset.expiresAt) <= Date.parse(dataset.generatedAt)) fail(errors, 'expiresAt must be after generatedAt')
  if (!isRecord(dataset.warehouse) || typeof dataset.warehouse.name !== 'string' || !dataset.warehouse.name || typeof dataset.warehouse.date !== 'string' || !DATE.test(dataset.warehouse.date) || typeof dataset.warehouse.shift !== 'string' || !dataset.warehouse.shift) fail(errors, 'warehouse requires name, date, and valid date/shift')
  if (dataset.datasetName !== undefined && (typeof dataset.datasetName !== 'string' || !dataset.datasetName.trim())) fail(errors, 'datasetName must be non-empty text')
  if (dataset.simulationConfig !== undefined) {
    const config = dataset.simulationConfig
    const required = ['datasetName', 'scenario', 'simulationDateTime', 'dockCount', 'vehicleCount', 'utilizationTarget', 'averageServiceMinutes', 'averageArrivalIntervalMinutes', 'warehouseName', 'incomingShipments', 'outgoingShipments', 'priorityPercent', 'carrierName', 'optionalNotes', 'maintenanceDockCount', 'disruptionDelayMinutes', 'seed']
    if (!isRecord(config) || required.some((key) => !Object.hasOwn(config, key))) fail(errors, 'simulationConfig is missing required input fields')
    else {
      const localTime = typeof config.simulationDateTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(config.simulationDateTime) && !Number.isNaN(Date.parse(config.simulationDateTime))
      const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
      const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
      if (typeof config.datasetName !== 'string' || !config.datasetName.trim() || config.datasetName.length > 100 ||
          typeof config.scenario !== 'string' || !Object.hasOwn(scenarios, config.scenario) ||
          !localTime || !integer(config.dockCount, 1, 24) || !integer(config.vehicleCount, 0, 500) ||
          !number(config.utilizationTarget, 0, 100) || !number(config.averageServiceMinutes, Number.MIN_VALUE, 1440) ||
          !number(config.averageArrivalIntervalMinutes, Number.MIN_VALUE, 1440) ||
          typeof config.warehouseName !== 'string' || !config.warehouseName.trim() ||
          !integer(config.incomingShipments, 0, 500) || !integer(config.outgoingShipments, 0, 500) ||
          !number(config.priorityPercent, 0, 100) || typeof config.carrierName !== 'string' || !config.carrierName.trim() ||
          typeof config.optionalNotes !== 'string' || !integer(config.maintenanceDockCount, 0, 24) ||
          !number(config.disruptionDelayMinutes, 0, 1440) || !integer(config.seed, 0, 2147483647) ||
          config.incomingShipments + config.outgoingShipments > config.vehicleCount ||
          config.maintenanceDockCount > config.dockCount ||
          (config.vehicleCount > 0 && config.maintenanceDockCount === config.dockCount)) {
        fail(errors, 'simulationConfig contains invalid values or infeasible capacity')
      }
      if (Array.isArray(dataset.docks) && config.dockCount !== dataset.docks.length) fail(errors, 'simulationConfig dockCount does not match dock records')
      if (Array.isArray(dataset.vehicles) && config.vehicleCount !== dataset.vehicles.length) fail(errors, 'simulationConfig vehicleCount does not match vehicle records')
      if (config.scenario !== dataset.scenario) fail(errors, 'simulationConfig scenario does not match dataset scenario')
    }
  }
  for (const collection of ['vehicles', 'queue', 'docks', 'alerts']) if (!Array.isArray(dataset[collection])) fail(errors, `${collection} must be an array`)
  if (!Array.isArray(dataset.docks) || dataset.docks.length < 1 || dataset.docks.length > 24) fail(errors, 'docks must contain between 1 and 24 bays')
  if (Array.isArray(dataset.vehicles) && dataset.vehicles.length > 500) fail(errors, 'vehicles cannot contain more than 500 records')
  if (!isRecord(dataset.kpis) || !['arrivalsToday', 'averageWaitMinutes', 'activeDocks', 'delayedShipments'].every((key) => Number.isFinite(dataset.kpis[key]))) fail(errors, 'kpis must contain numeric arrivalsToday, averageWaitMinutes, activeDocks, delayedShipments')
  else for (const key of ['throughputEstimate', 'averageProcessingMinutes', 'queueLength', 'onTimeRate', 'availableCapacity', 'capacityUtilization']) {
    if (dataset.kpis[key] !== undefined && (!Number.isFinite(dataset.kpis[key]) || dataset.kpis[key] < 0 || (['onTimeRate', 'capacityUtilization'].includes(key) && dataset.kpis[key] > 100))) fail(errors, `kpis ${key} must be a valid non-negative number`)
  }
  const vehicleIds = new Set()
  const plates = new Set()
  for (const vehicle of Array.isArray(dataset.vehicles) ? dataset.vehicles : []) {
    if (!isRecord(vehicle)) { fail(errors, 'vehicles must contain object records'); continue }
    if (typeof vehicle.vehicleId !== 'string' || typeof vehicle.plate !== 'string' || typeof vehicle.carrier !== 'string' || typeof vehicle.direction !== 'string' || typeof vehicle.loadType !== 'string' || !Number.isFinite(vehicle.palletCount) || typeof vehicle.appointmentTime !== 'string') fail(errors, `Vehicle ${label(vehicle.vehicleId)} has an invalid record shape`)
    if (typeof vehicle.vehicleId !== 'string' || !vehicle.vehicleId || vehicleIds.has(vehicle.vehicleId)) fail(errors, `Duplicate or missing vehicleId: ${label(vehicle.vehicleId)}`)
    if (typeof vehicle.plate === 'string' && vehicle.plate && plates.has(vehicle.plate)) fail(errors, `Duplicate plate: ${vehicle.plate}`)
    vehicleIds.add(vehicle.vehicleId); plates.add(vehicle.plate)
  }
  if (dataset.cargoCompliance !== undefined) validateCargoCompliance(dataset.cargoCompliance, vehicleIds, errors)
  const dockIds = new Set()
  const dockVehicleIds = new Set()
  for (const dock of Array.isArray(dataset.docks) ? dataset.docks : []) {
    if (!isRecord(dock)) { fail(errors, 'docks must contain object records'); continue }
    if (typeof dock.dockId !== 'string' || typeof dock.state !== 'string' || typeof dock.status !== 'string' || (dock.vehicleId !== null && typeof dock.vehicleId !== 'string') || typeof dock.plate !== 'string' || !Number.isFinite(dock.elapsedSeconds) || dock.capabilityCodes !== undefined && (!Array.isArray(dock.capabilityCodes) || new Set(dock.capabilityCodes).size !== dock.capabilityCodes.length || dock.capabilityCodes.some((code) => typeof code !== 'string' || !CARGO_CODE.test(code)))) fail(errors, `Dock ${label(dock.dockId)} has an invalid record shape`)
    if (typeof dock.dockId !== 'string' || !/^(?:0[1-9]|1[0-9]|2[0-4])$/.test(dock.dockId) || dockIds.has(dock.dockId)) fail(errors, `Duplicate or invalid dockId: ${label(dock.dockId)}`)
    dockIds.add(dock.dockId)
    if (typeof dock.vehicleId === 'string' && dock.vehicleId) {
      if (!vehicleIds.has(dock.vehicleId)) fail(errors, `Dock ${label(dock.dockId)} references unknown vehicle ${label(dock.vehicleId)}`)
      if (dockVehicleIds.has(dock.vehicleId)) fail(errors, `Vehicle ${label(dock.vehicleId)} is assigned to multiple docks`)
      dockVehicleIds.add(dock.vehicleId)
    }
    if (!Number.isFinite(dock.progress) || dock.progress < 0 || dock.progress > 100) fail(errors, `Dock ${dock.dockId} progress must be 0-100`)
  }
  for (const item of Array.isArray(dataset.queue) ? dataset.queue : []) {
    if (!isRecord(item)) { fail(errors, 'queue must contain object records'); continue }
    if (typeof item.queueId !== 'string' || !Number.isFinite(item.position) || typeof item.vehicleId !== 'string' || typeof item.plate !== 'string' || typeof item.carrier !== 'string' || typeof item.loadType !== 'string' || typeof item.arrivalTime !== 'string' || typeof item.estimatedCallTime !== 'string' || typeof item.priority !== 'string') fail(errors, `Queue position ${typeof item.position === 'number' ? item.position : '(invalid)'} has an invalid record shape`)
    if (typeof item.vehicleId !== 'string' || !vehicleIds.has(item.vehicleId)) fail(errors, `Queue position ${typeof item.position === 'number' ? item.position : '(invalid)'} references unknown vehicle ${label(item.vehicleId)}`)
    if (typeof item.vehicleId === 'string' && dockVehicleIds.has(item.vehicleId)) fail(errors, `Vehicle ${label(item.vehicleId)} cannot be both queued and assigned to a dock`)
  }
  for (const alert of Array.isArray(dataset.alerts) ? dataset.alerts : []) {
    if (!isRecord(alert)) { fail(errors, 'alerts must contain object records'); continue }
    const hasAlertId = Object.hasOwn(alert, 'alertId')
    const hasLegacyId = Object.hasOwn(alert, 'id')
    const alertId = hasAlertId ? alert.alertId : alert.id
    const validId = typeof alertId === 'string' && alertId.length > 0 && hasAlertId !== hasLegacyId
    if (!validId) fail(errors, `Alert ${label(alertId)} must have exactly one non-empty alertId or id`)
    if (!['critical', 'warning', 'info'].includes(alert.severity)) fail(errors, `Alert ${label(alertId)} severity must be critical, warning, or info`)
    if (typeof alert.dockId !== 'string' || !dockIds.has(alert.dockId) || typeof alert.code !== 'string' || !alert.code || typeof alert.description !== 'string' || !alert.description || typeof alert.action !== 'string' || !alert.action || !Number.isInteger(alert.elapsedSeconds) || alert.elapsedSeconds < 0) fail(errors, `Alert ${label(alertId)} has an invalid record shape`)
  }
  if (dataset.nowCalling === null) {
    if ((Array.isArray(dataset.vehicles) && dataset.vehicles.length > 0) || (Array.isArray(dataset.queue) && dataset.queue.length > 0)) fail(errors, 'nowCalling may be null only when there are no vehicles or queued work')
  } else if (!isRecord(dataset.nowCalling) || typeof dataset.nowCalling.vehicleId !== 'string' || !dataset.nowCalling.vehicleId || typeof dataset.nowCalling.dockId !== 'string' || !dataset.nowCalling.dockId || typeof dataset.nowCalling.instruction !== 'string' || !dataset.nowCalling.instruction || typeof dataset.nowCalling.estimatedStart !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dataset.nowCalling.estimatedStart)) {
    fail(errors, 'nowCalling requires vehicleId, dockId, instruction, and a valid estimatedStart')
  } else if (isRecord(dataset.nowCalling)) {
    const dock = (Array.isArray(dataset.docks) ? dataset.docks : []).find((item) => isRecord(item) && item.dockId === dataset.nowCalling.dockId)
    const vehicle = (Array.isArray(dataset.vehicles) ? dataset.vehicles : []).find((item) => isRecord(item) && item.vehicleId === dataset.nowCalling.vehicleId)
    if (!dock || !vehicle) fail(errors, 'nowCalling must reference an existing dock and vehicle')
    else if (dock.vehicleId !== vehicle.vehicleId || dock.plate !== vehicle.plate) fail(errors, 'nowCalling vehicle must match the assigned dock vehicle')
  }
  if (isRecord(dataset.kpis) && Array.isArray(dataset.docks)) {
    const activeDocks = dataset.docks.filter((dock) => isRecord(dock) && dock.state !== 'Available').length
    if (dataset.kpis.activeDocks !== activeDocks) fail(errors, 'kpis activeDocks does not match active dock records')
  }
  if (!isRecord(dataset.integrity) || !dataset.integrity.checksum || !isRecord(dataset.integrity.recordCounts)) fail(errors, 'integrity checksum and recordCounts are required')
  if (isRecord(dataset.integrity?.recordCounts) && dataset.integrity.recordCounts.vehicles !== dataset.vehicles?.length) fail(errors, 'integrity vehicle count does not match records')
  if (isRecord(dataset.integrity?.recordCounts) && dataset.integrity.recordCounts.vehicles !== dataset.vehicles?.length) fail(errors, 'integrity vehicle count does not match records')
  if (isRecord(dataset.integrity?.recordCounts) && dataset.integrity.recordCounts.queue !== dataset.queue?.length) fail(errors, 'integrity queue count does not match records')
  if (isRecord(dataset.integrity?.recordCounts) && dataset.integrity.recordCounts.docks !== dataset.docks?.length) fail(errors, 'integrity dock count does not match records')
  if (isRecord(dataset.integrity?.recordCounts) && dataset.integrity.recordCounts.alerts !== dataset.alerts?.length) fail(errors, 'integrity alert count does not match records')
  if (isRecord(dataset.integrity) && dataset.integrity.checksum) {
    const { integrity, ...withoutIntegrity } = dataset
    try {
      const expected = crypto.createHash('sha256').update(JSON.stringify(withoutIntegrity)).digest('hex')
      if (expected !== integrity.checksum) fail(errors, 'integrity checksum does not match dataset content')
    } catch { fail(errors, 'integrity checksum cannot be verified for dataset content') }
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
