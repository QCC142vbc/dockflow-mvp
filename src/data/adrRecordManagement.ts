import type { ADRAuditEvent, ADRRecord, CargoComplianceData } from './datasetTypes'

const ADR_AUDIT_LIMIT = 500

export function duplicateAdrRecord(source: ADRRecord, existing: readonly ADRRecord[]): ADRRecord {
  const ids = new Set(existing.map((record) => record.adrRecordId))
  let suffix = 1
  let adrRecordId = `${source.adrRecordId.slice(0, 75)}-copy-${suffix}`
  while (ids.has(adrRecordId)) {
    suffix += 1
    adrRecordId = `${source.adrRecordId.slice(0, 75)}-copy-${suffix}`
  }
  return { ...source, adrRecordId, active: true }
}

export function getAdrRecordReferences(data: CargoComplianceData, adrRecordId: string) {
  return data.cargo.filter((cargo) => cargo.adrRecordId === adrRecordId)
}

export function setAdrRecordActive(
  data: CargoComplianceData,
  adrRecordId: string,
  active: boolean,
): CargoComplianceData {
  return {
    ...data,
    adrRecords: data.adrRecords.map((record) =>
      record.adrRecordId === adrRecordId ? { ...record, active } : record),
  }
}

export function deleteAdrRecord(data: CargoComplianceData, adrRecordId: string): CargoComplianceData {
  const references = getAdrRecordReferences(data, adrRecordId)
  if (references.length) {
    throw new Error(`Cannot delete this ADR record while ${references.length} cargo record${references.length === 1 ? '' : 's'} reference it. Deactivate it instead.`)
  }
  return {
    ...data,
    adrRecords: data.adrRecords.filter((record) => record.adrRecordId !== adrRecordId),
  }
}

export function recordAdrChanges(
  previous: ADRRecord | undefined,
  next: ADRRecord,
  timestamp = new Date().toISOString(),
  sequence = 0,
): ADRAuditEvent[] {
  const events: ADRAuditEvent[] = []
  const add = (eventType: ADRAuditEvent['eventType'], previousValue?: string, newValue?: string) => {
    events.push({
      eventId: `adr-${Date.parse(timestamp).toString(36)}-${(sequence + events.length).toString(36)}-${next.adrRecordId.slice(-32)}`,
      timestamp,
      adrRecordId: next.adrRecordId,
      eventType,
      ...(previousValue !== undefined ? { previousValue } : {}),
      ...(newValue !== undefined ? { newValue } : {}),
    })
  }
  if (!previous) {
    add('record-created', undefined, next.status)
    if (next.active === true) add('record-activated', undefined, 'true')
    if (next.status === 'applicable') add('adr-enabled', undefined, 'applicable')
    return events
  }

  if (previous.status !== 'applicable' && next.status === 'applicable') {
    add('adr-enabled', previous.status, next.status)
  } else if (previous.status !== next.status) {
    add('adr-status-changed', previous.status, next.status)
  }
  if (previous.active !== next.active && next.active !== undefined) {
    add(next.active ? 'record-activated' : 'record-deactivated', String(previous.active ?? true), String(next.active))
  }
  if (previous.unNumber !== next.unNumber) add('un-number-changed', previous.unNumber, next.unNumber)
  if (previous.properShippingName !== next.properShippingName) {
    add('proper-shipping-name-changed', previous.properShippingName, next.properShippingName)
  }
  if (previous.hazardClass !== next.hazardClass) add('hazard-class-changed', previous.hazardClass, next.hazardClass)
  if (previous.packingGroup !== next.packingGroup) add('packing-group-changed', previous.packingGroup, next.packingGroup)
  if (previous.tunnelRestrictionCode !== next.tunnelRestrictionCode) {
    add('tunnel-restriction-changed', previous.tunnelRestrictionCode, next.tunnelRestrictionCode)
  }
  return events
}

export function appendAdrAuditHistory(
  data: CargoComplianceData,
  events: readonly ADRAuditEvent[],
): CargoComplianceData {
  if (!events.length) return data
  return {
    ...data,
    adrAuditHistory: [...(data.adrAuditHistory ?? []), ...events].slice(-ADR_AUDIT_LIMIT),
  }
}
