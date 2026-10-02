import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Box, ClipboardList, FileWarning, Package, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { recalculateDatasetIntegrity, validateOperationsDataset } from './data/datasetFactory.ts'
import { validateCargoComplianceData } from './data/cargoComplianceValidation.ts'
import { createStarterContainerTypes } from './data/containerTypeDefaults.ts'
import { deleteContainerType, duplicateContainerType, getContainerTypeReferences, setContainerTypeActive, upsertContainerType } from './data/containerTypeLibrary.ts'
import { appendAdrAuditHistory, deleteAdrRecord, duplicateAdrRecord, getAdrRecordReferences, recordAdrChanges, setAdrRecordActive } from './data/adrRecordManagement.ts'
import { appendCargoAssignmentChanges, validateOperationalCargoReferenceActivity } from './data/operationalCargo.ts'

const TABS = [
  { id: 'cargo', label: 'Cargo', icon: Package },
  { id: 'containerTypes', label: 'Containers', icon: Box },
  { id: 'adrRecords', label: 'ADR / Dangerous Goods', icon: FileWarning },
  { id: 'handlingRequirements', label: 'Handling Requirements', icon: ClipboardList },
]
const EMPTY_DATA = { cargo: [], containerTypes: [], adrRecords: [], handlingRequirements: [] }
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const numberValue = (value) => value === undefined || value === null || value === '' ? undefined : Number(value)
const title = (record, tab) => tab === 'cargo' ? record.description : tab === 'containerTypes' ? record.name : tab === 'adrRecords' ? record.properShippingName || record.adrRecordId : record.name
const recordId = (record, tab) => tab === 'cargo' ? record.cargoId : tab === 'containerTypes' ? record.containerTypeId : tab === 'adrRecords' ? record.adrRecordId : record.handlingRequirementId
const tabCollection = (tab) => tab

function TextField({ label, value, onChange, type = 'text', required = false, min, step, placeholder }) {
  const id = React.useId()
  return <label className="cc-field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required} min={min} step={step} placeholder={placeholder} /></label>
}

function SelectField({ label, value, onChange, children }) {
  const id = React.useId()
  return <label className="cc-field" htmlFor={id}><span>{label}</span><select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

function ToggleField({ label, checked, onChange }) {
  const id = React.useId()
  return <label className="cc-toggle" htmlFor={id}><input id={id} type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>
}

function CargoComplianceForm({ tab, initial, asNew = false, data, vehicles, onCancel, onSave }) {
  const isEdit = Boolean(initial && !asNew)
  const formEntity = tab === 'cargo' ? 'Cargo' : tab === 'containerTypes' ? 'Container Type' : tab === 'adrRecords' ? 'ADR Record' : 'Handling Requirement'
  const [form, setForm] = useState(() => initial
    ? { ...initial, ...(tab === 'adrRecords' && initial.active === undefined ? { active: true } : {}) }
    : createForm(tab))
  const [formError, setFormError] = useState('')
  const [attributesText, setAttributesText] = useState(() => JSON.stringify(initial?.attributes ?? {}, null, 2))
  const dialogRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  useEffect(() => {
    dialogRef.current?.querySelector('input:not([type="checkbox"]), select, textarea')?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') onCancelRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function submit(event) {
    event.preventDefault()
    setFormError('')
    let record = { ...form }
    if (tab === 'cargo') {
      record = {
        ...record,
        quantity: numberValue(form.quantity),
        weightKg: numberValue(form.weightKg),
        volumeM3: numberValue(form.volumeM3),
        containerTypeId: form.containerTypeId || undefined,
        adrRecordId: form.adrRecordId || undefined,
        vehicleId: form.vehicleId || undefined,
        shipmentId: form.shipmentId || undefined,
        operationId: form.operationId || undefined,
        handlingRequirementIds: form.handlingRequirementIds ?? [],
      }
    } else if (tab === 'containerTypes') {
      for (const key of ['nominalLengthM', 'widthM', 'heightM', 'maxGrossWeightKg', 'tareWeightKg', 'payloadCapacityKg']) record[key] = numberValue(form[key])
      if (!record.tareWeightKg) delete record.tareWeightKg
      if (!record.payloadCapacityKg) delete record.payloadCapacityKg
      if (!record.requiredDockCapabilityCode) delete record.requiredDockCapabilityCode
      if (!record.notes) delete record.notes
    } else if (tab === 'adrRecords') {
      for (const key of ['unNumber', 'properShippingName', 'hazardClass', 'packingGroup', 'tunnelRestrictionCode', 'additionalNotes', 'requiredDockCapabilityCode']) {
        if (!record[key]) delete record[key]
      }
    } else {
      if (!record.description) delete record.description
      if (!record.requiredDockCapabilityCode) delete record.requiredDockCapabilityCode
      try {
        const attributes = attributesText.trim() ? JSON.parse(attributesText) : {}
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
          setFormError('Attributes must be valid JSON containing an object of scalar values.')
          return
        }
        record.attributes = attributes
      } catch {
        setFormError('Attributes must be valid JSON containing an object of scalar values.')
        return
      }
      if (!Object.keys(record.attributes).length) delete record.attributes
    }
    const collection = tabCollection(tab)
    const editingId = isEdit ? recordId(initial, tab) : null
    const records = data[collection].map((item) => editingId !== null && recordId(item, tab) === editingId ? record : item)
    const updated = isEdit ? records : [...records, record]
    const nextData = { ...data, [collection]: updated }
    if (tab === 'cargo' && record.vehicleId) {
      const previousCargo = isEdit ? initial : undefined
      try {
        validateOperationalCargoReferenceActivity(
          data,
          previousCargo ?? { handlingRequirementIds: [] },
          {
            containerTypeId: record.containerTypeId,
            adrRecordId: record.adrRecordId,
            handlingRequirementIds: record.handlingRequirementIds,
          },
          !previousCargo?.vehicleId || previousCargo.vehicleId !== record.vehicleId,
        )
      } catch (referenceError) {
        setFormError(referenceError instanceof Error ? referenceError.message : 'Inactive references cannot be newly assigned.')
        return
      }
    }
    const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.vehicleId))
    const errors = validateCargoComplianceData(nextData, vehicleIds)
    if (errors.length) {
      setFormError(errors[0].replace(/^cargoCompliance:\s*/, ''))
      return
    }
    onSave(record, isEdit ? 'updated' : 'created')
  }

  return <div className="cc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="cc-form-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cc-form-title">
      <button type="button" className="cc-close" onClick={onCancel} aria-label="Close form"><X size={18} /></button>
      <div className="cc-eyebrow">Cargo &amp; Compliance records</div>
      <h2 id="cc-form-title">{isEdit ? 'Edit' : 'Add'} {formEntity}</h2>
      <form noValidate onSubmit={submit}>
        <div className="cc-form-grid">
          {tab === 'cargo' && <>
            <TextField label="Cargo ID" value={form.cargoId} onChange={(v) => set('cargoId', v)} required />
            <TextField label="Cargo type" value={form.cargoType} onChange={(v) => set('cargoType', v)} required />
            <TextField label="Description" value={form.description} onChange={(v) => set('description', v)} required />
            <TextField label="Quantity" type="number" min="0.001" step="any" value={form.quantity} onChange={(v) => set('quantity', v)} required />
            <TextField label="Quantity unit" value={form.quantityUnit} onChange={(v) => set('quantityUnit', v)} placeholder="pallets, cartons…" required />
            <TextField label="Weight (kg)" type="number" min="0" step="any" value={form.weightKg} onChange={(v) => set('weightKg', v)} />
            <TextField label="Volume (m³)" type="number" min="0" step="any" value={form.volumeM3} onChange={(v) => set('volumeM3', v)} />
            <SelectField label="Container type" value={form.containerTypeId} onChange={(v) => set('containerTypeId', v)}><option value="">Not specified</option>{data.containerTypes.filter((item) => item.active || item.containerTypeId === form.containerTypeId).map((item) => <option key={item.containerTypeId} value={item.containerTypeId}>{item.code} · {item.name}{item.active ? '' : ' · Inactive'}</option>)}</SelectField>
            <SelectField label="ADR record" value={form.adrRecordId} onChange={(v) => set('adrRecordId', v)}><option value="">Not specified</option>{data.adrRecords.filter((item) => item.active !== false || item.adrRecordId === form.adrRecordId).map((item) => <option key={item.adrRecordId} value={item.adrRecordId}>{item.status === 'applicable' ? item.unNumber : item.status} · {item.properShippingName || item.adrRecordId}{item.active === false ? ' · Inactive' : ''}</option>)}</SelectField>
            <SelectField label="Vehicle (optional)" value={form.vehicleId} onChange={(v) => set('vehicleId', v)}><option value="">Unassigned</option>{vehicles.map((item) => <option key={item.vehicleId} value={item.vehicleId}>{item.plate} · {item.vehicleId}</option>)}</SelectField>
            <TextField label="Shipment ID (optional)" value={form.shipmentId} onChange={(v) => set('shipmentId', v)} />
            <TextField label="Operation ID (optional)" value={form.operationId} onChange={(v) => set('operationId', v)} />
            <fieldset className="cc-checkbox-group"><legend>Handling requirements</legend>{data.handlingRequirements.filter((item) => item.active || (form.handlingRequirementIds ?? []).includes(item.handlingRequirementId)).map((item) => <ToggleField key={item.handlingRequirementId} label={`${item.name}${item.active ? '' : ' · Inactive'}`} checked={(form.handlingRequirementIds ?? []).includes(item.handlingRequirementId)} onChange={(checked) => set('handlingRequirementIds', checked ? [...(form.handlingRequirementIds ?? []), item.handlingRequirementId] : (form.handlingRequirementIds ?? []).filter((id) => id !== item.handlingRequirementId))} />)}{data.handlingRequirements.filter((item) => item.active || (form.handlingRequirementIds ?? []).includes(item.handlingRequirementId)).length === 0 && <small>No active requirements configured.</small>}</fieldset>
            <label className="cc-field cc-wide"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} rows="3" /></label>
          </>}
          {tab === 'containerTypes' && <>
            <TextField label="Container type ID" value={form.containerTypeId} onChange={(v) => set('containerTypeId', v)} required />
            <TextField label="Code" value={form.code} onChange={(v) => set('code', v)} required />
            <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} required />
            <SelectField label="Category" value={form.category} onChange={(v) => set('category', v)}>{['standard', 'reefer', 'tank', 'open-top', 'flat-rack', 'other'].map((v) => <option key={v} value={v}>{v.replace('-', ' ')}</option>)}</SelectField>
            <TextField label="Nominal length (m)" type="number" min="0.001" step="any" value={form.nominalLengthM} onChange={(v) => set('nominalLengthM', v)} required />
            <TextField label="Width (m)" type="number" min="0.001" step="any" value={form.widthM} onChange={(v) => set('widthM', v)} required />
            <TextField label="Height (m)" type="number" min="0.001" step="any" value={form.heightM} onChange={(v) => set('heightM', v)} required />
            <TextField label="Max gross weight (kg)" type="number" min="0.001" step="any" value={form.maxGrossWeightKg} onChange={(v) => set('maxGrossWeightKg', v)} required />
            <TextField label="Tare weight (kg)" type="number" min="0" step="any" value={form.tareWeightKg} onChange={(v) => set('tareWeightKg', v)} />
            <TextField label="Payload capacity (kg)" type="number" min="0.001" step="any" value={form.payloadCapacityKg} onChange={(v) => set('payloadCapacityKg', v)} />
            <TextField label="Required dock capability code (optional)" value={form.requiredDockCapabilityCode} onChange={(v) => set('requiredDockCapabilityCode', v)} placeholder="e.g. REEFER" />
            <div className="cc-toggle-grid"><ToggleField label="Refrigerated" checked={form.refrigerated} onChange={(v) => set('refrigerated', v)} /><ToggleField label="Tank" checked={form.tank} onChange={(v) => set('tank', v)} /><ToggleField label="Open top" checked={form.openTop} onChange={(v) => set('openTop', v)} /><ToggleField label="Flat rack" checked={form.flatRack} onChange={(v) => set('flatRack', v)} /><ToggleField label="Active" checked={form.active} onChange={(v) => set('active', v)} /></div>
            <label className="cc-field cc-wide"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} rows="3" /></label>
          </>}
          {tab === 'adrRecords' && <>
            <TextField label="ADR record ID" value={form.adrRecordId} onChange={(v) => set('adrRecordId', v)} required />
            <SelectField label="ADR status" value={form.status} onChange={(v) => set('status', v)}><option value="unknown">Unknown</option><option value="not-applicable">Not applicable</option><option value="applicable">Applicable</option></SelectField>
            <TextField label="UN number" value={form.unNumber} onChange={(v) => set('unNumber', v)} placeholder="UN 1203" required={form.status === 'applicable'} />
            <TextField label="Proper shipping name" value={form.properShippingName} onChange={(v) => set('properShippingName', v)} required={form.status === 'applicable'} />
            <SelectField label="Hazard class" value={form.hazardClass} onChange={(v) => set('hazardClass', v)}><option value="">Not specified</option>{['1', '2', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9'].map((v) => <option key={v} value={v}>Class {v}</option>)}</SelectField>
            <SelectField label="Packing group" value={form.packingGroup} onChange={(v) => set('packingGroup', v)}><option value="">Not specified</option>{['I', 'II', 'III'].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField>
            <TextField label="Tunnel restriction" value={form.tunnelRestrictionCode} onChange={(v) => set('tunnelRestrictionCode', v)} />
            <TextField label="Required dock capability code (optional)" value={form.requiredDockCapabilityCode} onChange={(v) => set('requiredDockCapabilityCode', v)} placeholder="Explicit configuration only" />
              <ToggleField label="Record active" checked={form.active} onChange={(v) => set('active', v)} />
              <label className="cc-field cc-wide"><span>Additional notes</span><textarea value={form.additionalNotes ?? ''} onChange={(event) => set('additionalNotes', event.target.value)} rows="3" /></label>
          </>}
          {tab === 'handlingRequirements' && <>
            <TextField label="Requirement ID" value={form.handlingRequirementId} onChange={(v) => set('handlingRequirementId', v)} required />
            <TextField label="Code" value={form.code} onChange={(v) => set('code', v)} required />
            <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} required />
            <SelectField label="Category" value={form.category} onChange={(v) => set('category', v)}>{['temperature', 'environment', 'security', 'safety', 'physical', 'other'].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField>
            <TextField label="Required dock capability code (optional)" value={form.requiredDockCapabilityCode} onChange={(v) => set('requiredDockCapabilityCode', v)} placeholder="e.g. SECURE" />
            <ToggleField label="Active" checked={form.active} onChange={(v) => set('active', v)} />
            <label className="cc-field cc-wide"><span>Description</span><textarea value={form.description ?? ''} onChange={(event) => set('description', event.target.value)} rows="2" /></label>
            <label className="cc-field cc-wide"><span>Attributes (JSON object, optional)</span><textarea value={attributesText} onChange={(event) => setAttributesText(event.target.value)} rows="4" spellCheck="false" /><small>Use scalar values such as temperature limits or security level.</small></label>
          </>}
        </div>
        {formError && <div className="cc-error" role="alert">{formError}</div>}
        <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onCancel}>Cancel</button><button type="submit" className="cc-primary">{isEdit ? 'Save changes' : 'Create record'}</button></div>
      </form>
    </section>
  </div>
}

function createForm(tab) {
  if (tab === 'cargo') return { cargoId: newId('cargo'), cargoType: '', description: '', quantity: '1', quantityUnit: 'units', weightKg: '', volumeM3: '', containerTypeId: '', adrRecordId: '', handlingRequirementIds: [], vehicleId: '', shipmentId: '', operationId: '', notes: '' }
  if (tab === 'containerTypes') return { containerTypeId: newId('container'), code: '', name: '', category: 'standard', nominalLengthM: '', widthM: '', heightM: '', maxGrossWeightKg: '', tareWeightKg: '', payloadCapacityKg: '', refrigerated: false, tank: false, openTop: false, flatRack: false, active: true, requiredDockCapabilityCode: '', notes: '' }
  if (tab === 'adrRecords') return { adrRecordId: newId('adr'), status: 'unknown', active: true, requiredDockCapabilityCode: '', unNumber: '', properShippingName: '', hazardClass: '', packingGroup: '', tunnelRestrictionCode: '', additionalNotes: '' }
  return { handlingRequirementId: newId('handling'), code: '', name: '', category: 'other', active: true, requiredDockCapabilityCode: '', description: '', attributes: {} }
}

function describeRecord(record, tab, data) {
  if (tab === 'cargo') {
    const container = data.containerTypes.find((item) => item.containerTypeId === record.containerTypeId)
    const adr = data.adrRecords.find((item) => item.adrRecordId === record.adrRecordId)
    const requirements = (record.handlingRequirementIds ?? []).map((id) => data.handlingRequirements.find((item) => item.handlingRequirementId === id)?.name).filter(Boolean)
    return `${record.cargoType || 'Cargo'} · ${record.weightKg === undefined ? 'Weight n/a' : `${record.weightKg} kg`} · ${container?.code ?? 'No container'} · ADR ${adr?.status ?? 'unknown'} · ${requirements.length ? requirements.join(', ') : 'No special handling'}`
  }
  if (tab === 'containerTypes') return `${record.code} · ${record.category} · ${record.nominalLengthM} × ${record.widthM} × ${record.heightM} m · ${record.payloadCapacityKg ?? '—'} kg payload${record.requiredDockCapabilityCode ? ` · Requires ${record.requiredDockCapabilityCode}` : ''}`
  if (tab === 'adrRecords') return `${record.status === 'applicable' ? `ADR · ${record.unNumber} · Class ${record.hazardClass}${record.packingGroup ? ` · PG ${record.packingGroup}` : ''}` : `ADR ${record.status}`} · ${record.tunnelRestrictionCode || 'No tunnel restriction'}${record.requiredDockCapabilityCode ? ` · Requires ${record.requiredDockCapabilityCode}` : ''}`
  return `${record.code} · ${record.category}${record.requiredDockCapabilityCode ? ` · Requires ${record.requiredDockCapabilityCode}` : ''}${record.active ? ' · Active' : ' · Inactive'}`
}

export default function CargoComplianceStudio({ dataset, onSave }) {
  const [tab, setTab] = useState('cargo')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [capabilityFilter, setCapabilityFilter] = useState('all')
  const [adrStatusFilter, setAdrStatusFilter] = useState('all')
  const [formMode, setFormMode] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const data = dataset.cargoCompliance ?? EMPTY_DATA
  const collection = data[tab] ?? []
  const selected = collection.find((item) => recordId(item, tab) === selectedId)
  const selectedCargoAdr = tab === 'cargo' && selected
    ? data.adrRecords.find((item) => item.adrRecordId === selected.adrRecordId)
    : undefined
  const vehicles = dataset.vehicles ?? []
  const currentTab = TABS.find((item) => item.id === tab)
  const filtered = useMemo(() => collection.filter((item) => {
    const normalized = search.trim().toLowerCase()
    const matches = !normalized || JSON.stringify(item).toLowerCase().includes(normalized)
    const active = item.active === undefined || item.active
    const categoryMatches = tab !== 'containerTypes' || categoryFilter === 'all' || item.category === categoryFilter
    const capabilityMatches = tab !== 'containerTypes' || capabilityFilter === 'all' || item[capabilityFilter] === true
    const adrStatusMatches = tab !== 'adrRecords' || adrStatusFilter === 'all' || item.status === adrStatusFilter
    return matches && categoryMatches && capabilityMatches && adrStatusMatches && (filter === 'all' || (filter === 'active' ? active : !active))
  }), [collection, filter, search, categoryFilter, capabilityFilter, adrStatusFilter, tab])

  const commit = (nextData, message) => {
    setError('')
    setNotice('')
    const nextDataset = recalculateDatasetIntegrity({ ...dataset, cargoCompliance: nextData })
    const validation = validateOperationsDataset(nextDataset)
    if (!validation.valid) {
      setError(validation.errors[0] ?? 'Cargo & Compliance record could not be saved.')
      return false
    }
    try {
      onSave(nextDataset)
      setNotice(message)
      setFormMode(null)
      setSelectedId('')
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Cargo & Compliance records.')
      return false
    }
  }

  useEffect(() => {
    if (dataset.cargoCompliance === undefined) {
      commit({ ...EMPTY_DATA, containerTypes: createStarterContainerTypes() }, 'Starter container types added to this dataset.')
    }
  }, [dataset.cargoCompliance, dataset.datasetId])

  const saveRecord = (record, operation) => {
    const editExisting = formMode.initial && !formMode.asNew
    let nextData
    try {
      if (tab === 'containerTypes') {
        nextData = upsertContainerType(data, record, new Set(vehicles.map((vehicle) => vehicle.vehicleId)))
      } else if (tab === 'adrRecords') {
        const adrRecords = editExisting
          ? collection.map((item) => item.adrRecordId === formMode.initial.adrRecordId ? record : item)
          : [...collection, record]
        const audit = recordAdrChanges(
          editExisting ? formMode.initial : undefined,
          record,
          new Date().toISOString(),
          data.adrAuditHistory?.length ?? 0,
        )
        nextData = appendAdrAuditHistory({ ...data, adrRecords }, audit)
      } else {
        const previousCargo = tab === 'cargo' && editExisting
          ? collection.find((item) => item.cargoId === formMode.initial.cargoId)
          : undefined
        nextData = { ...data, [tab]: editExisting ? collection.map((item) => recordId(item, tab) === recordId(formMode.initial, tab) ? record : item) : [...collection, record] }
        if (tab === 'cargo') nextData = appendCargoAssignmentChanges(nextData, previousCargo, record)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Container type could not be saved.')
      return
    }
    if (commit(nextData, `${currentTab.label} record ${operation}.`)) setSelectedId(recordId(record, tab))
  }

  const toggleActive = (record) => {
    const key = tab === 'containerTypes' ? 'containerTypeId' : 'handlingRequirementId'
    const updated = { ...record, active: !record.active }
    let nextData
    if (tab === 'containerTypes') nextData = setContainerTypeActive(data, record.containerTypeId, updated.active)
    else if (tab === 'adrRecords') {
      const adrRecords = collection.map((item) => item.adrRecordId === record.adrRecordId ? updated : item)
      nextData = appendAdrAuditHistory(
        { ...data, adrRecords },
        recordAdrChanges(record, updated, new Date().toISOString(), data.adrAuditHistory?.length ?? 0),
      )
    } else nextData = { ...data, [tab]: collection.map((item) => item[key] === record[key] ? updated : item) }
    commit(nextData, `${title(record, tab)} ${updated.active ? 'activated' : 'deactivated'}.`)
  }

  const deleteRecord = (record) => {
    const id = recordId(record, tab)
    const usedBy = tab === 'containerTypes' ? getContainerTypeReferences(data, id)
      : tab === 'adrRecords' ? getAdrRecordReferences(data, id)
        : tab === 'handlingRequirements' ? data.cargo.filter((item) => item.handlingRequirementIds.includes(id)) : []
    if (usedBy.length) {
      setError(`Cannot delete this record while ${usedBy.length} cargo record${usedBy.length === 1 ? '' : 's'} reference it. Deactivate it instead.`)
      return
    }
    if (!window.confirm(`Delete ${title(record, tab)}? This cannot be undone.`)) return
    let nextData
    try {
      nextData = tab === 'containerTypes'
        ? deleteContainerType(data, id)
        : tab === 'adrRecords'
          ? deleteAdrRecord(data, id)
        : { ...data, [tab]: collection.filter((item) => recordId(item, tab) !== id) }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'This record cannot be deleted.')
      return
    }
    if (commit(nextData, `${currentTab.label} record deleted.`)) setSelectedId('')
  }

  const openForm = (initial = null, asNew = false) => { setError(''); setNotice(''); setFormMode({ initial, asNew }) }
  const isCatalog = tab === 'containerTypes' || tab === 'handlingRequirements' || tab === 'adrRecords'
  const canDeactivate = isCatalog && selected
  const adrHistory = tab === 'adrRecords' && selected
    ? [...(data.adrAuditHistory ?? [])].filter((event) => event.adrRecordId === selected.adrRecordId).reverse()
    : []

  return <section className="cargo-studio" aria-labelledby="cargo-studio-title">
    <header className="cc-heading">
      <div><div className="cc-eyebrow"><ShieldCheck size={14} /> Master data management</div><h1 id="cargo-studio-title">Cargo &amp; Compliance</h1><p>Maintain cargo profiles and reusable operational definitions for this dataset.</p></div>
      <div className="cc-dataset-tag"><span>Active dataset</span><strong>{dataset.datasetName || dataset.warehouse?.name || dataset.datasetId}</strong><small>{dataset.datasetId}</small></div>
    </header>
    <div className="cc-tabs" role="tablist" aria-label="Cargo and compliance categories">{TABS.map(({ id, label, icon: Icon }, index) => <button type="button" role="tab" id={`cc-tab-${id}`} aria-selected={tab === id} aria-controls="cc-panel" tabIndex={tab === id ? 0 : -1} key={id} onKeyDown={(event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const direction = event.key === 'ArrowRight' ? 1 : -1
        const next = TABS[(index + direction + TABS.length) % TABS.length]
        setTab(next.id)
        setSelectedId('')
        setSearch('')
        setFilter('all')
        setCategoryFilter('all')
        setCapabilityFilter('all')
        setAdrStatusFilter('all')
        document.getElementById(`cc-tab-${next.id}`)?.focus()
      }
    }} onClick={() => { setTab(id); setSelectedId(''); setSearch(''); setFilter('all'); setCategoryFilter('all'); setCapabilityFilter('all'); setAdrStatusFilter('all'); setError(''); setNotice('') }}><Icon size={15} />{label}<span>{(data[id] ?? []).length}</span></button>)}</div>
    <div className="cc-feedback" aria-live="polite">{error && <div className="cc-error" role="alert">{error}</div>}{notice && <div className="cc-notice" role="status">{notice}</div>}</div>
    <div className="cc-workspace" id="cc-panel" role="tabpanel" aria-labelledby={`cc-tab-${tab}`}>
      <div className="cc-record-panel">
        <div className="cc-list-toolbar"><label className="cc-search"><Search size={15} /><input type="search" aria-label={`Search ${currentTab.label}`} placeholder={`Search ${currentTab.label.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label><button type="button" className="cc-primary" onClick={() => openForm()}><Plus size={15} />Add {tab === 'cargo' ? 'Cargo' : tab === 'containerTypes' ? 'Container Type' : tab === 'adrRecords' ? 'ADR Record' : 'Requirement'}</button></div>
        {isCatalog && <div className="cc-list-filters" aria-label="Record filters">{['all', 'active', 'inactive'].map((value) => <button key={value} type="button" className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All records' : value}</button>)}
          {tab === 'containerTypes' && <>
            <label className="cc-filter-select"><span>Category</span><select aria-label="Filter by container category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Any category</option>{['standard', 'reefer', 'tank', 'open-top', 'flat-rack', 'other'].map((value) => <option key={value} value={value}>{value.replace('-', ' ')}</option>)}</select></label>
            <label className="cc-filter-select"><span>Capability</span><select aria-label="Filter by container capability" value={capabilityFilter} onChange={(event) => setCapabilityFilter(event.target.value)}><option value="all">Any capability</option><option value="refrigerated">Refrigerated</option><option value="tank">Tank capable</option><option value="openTop">Open top</option><option value="flatRack">Flat rack</option></select></label>
          </>}
          {tab === 'adrRecords' && <label className="cc-filter-select"><span>ADR status</span><select aria-label="Filter by ADR status" value={adrStatusFilter} onChange={(event) => setAdrStatusFilter(event.target.value)}><option value="all">Any ADR status</option><option value="applicable">Applicable</option><option value="not-applicable">Not applicable</option><option value="unknown">Unknown</option></select></label>}
        </div>}
        {filtered.length === 0
          ? <div className="cc-empty"><Package size={24} /><strong>{collection.length ? 'No matching records' : `No ${currentTab.label.toLowerCase()} yet`}</strong><span>{collection.length ? 'Try changing the search or status filter.' : 'Create a record to start building this dataset’s logistics catalog.'}</span>{collection.length === 0 && <button type="button" className="cc-secondary" onClick={() => openForm()}><Plus size={14} />Create first record</button>}</div>
          : <div className="cc-record-list">{filtered.map((record) => {
            const id = recordId(record, tab)
            const inactive = record.active === false
            return <article key={id} className={`cc-record-card ${selectedId === id ? 'selected' : ''} ${inactive ? 'inactive' : ''}`}>
              <button type="button" className="cc-record-main" onClick={() => setSelectedId(id)} aria-pressed={selectedId === id}>
                <span className="cc-record-id">{id}</span><strong>{title(record, tab)}</strong><span>{describeRecord(record, tab, data)}</span>
              </button>
              <span className={`cc-status-pill ${inactive ? 'inactive' : tab === 'adrRecords' && record.status === 'applicable' ? 'warning' : 'active'}`}>{inactive ? 'Inactive' : tab === 'adrRecords' ? record.status === 'applicable' ? `ADR · ${record.unNumber} · Class ${record.hazardClass}${record.packingGroup ? ` · PG ${record.packingGroup}` : ''}` : `ADR ${record.status}` : tab === 'containerTypes' || tab === 'handlingRequirements' ? 'Active' : (data.adrRecords.find((adr) => adr.adrRecordId === record.adrRecordId)?.status ?? 'No ADR')}</span>
            </article>
          })}</div>}
      </div>
      <aside className="cc-detail-panel" aria-label={`${currentTab.label} details`}>
        {selected ? <>
          <div className="cc-detail-top"><div><span>Record detail</span><h2>{title(selected, tab)}</h2><small>{recordId(selected, tab)}</small></div><button type="button" className="cc-icon-button" onClick={() => setSelectedId('')} aria-label="Close details"><X size={16} /></button></div>
          {selected.requiredDockCapabilityCode && <p className="cc-storage-note">Dispatch requires configured dock capability <strong>{selected.requiredDockCapabilityCode}</strong>.</p>}
          {tab === 'cargo' && <dl className="cc-detail-list"><dt>Type</dt><dd>{selected.cargoType}</dd><dt>Description</dt><dd>{selected.description}</dd><dt>Quantity</dt><dd>{selected.quantity} {selected.quantityUnit}</dd><dt>Weight</dt><dd>{selected.weightKg === undefined ? 'Not recorded' : `${selected.weightKg} kg`}</dd><dt>Volume</dt><dd>{selected.volumeM3 === undefined ? 'Not recorded' : `${selected.volumeM3} m³`}</dd><dt>Container</dt><dd>{data.containerTypes.find((item) => item.containerTypeId === selected.containerTypeId)?.name ?? 'Not specified'}</dd><dt>ADR details</dt><dd>{selectedCargoAdr ? selectedCargoAdr.status === 'applicable' ? `ADR · ${selectedCargoAdr.unNumber} · ${selectedCargoAdr.properShippingName} · Class ${selectedCargoAdr.hazardClass}${selectedCargoAdr.packingGroup ? ` · PG ${selectedCargoAdr.packingGroup}` : ''}` : `ADR ${selectedCargoAdr.status}` : 'Not specified'}</dd><dt>Handling</dt><dd>{selected.handlingRequirementIds.map((id) => data.handlingRequirements.find((item) => item.handlingRequirementId === id)?.name).filter(Boolean).join(', ') || 'None recorded'}</dd>{selected.notes && <><dt>Notes</dt><dd>{selected.notes}</dd></>}</dl>}
          {tab === 'containerTypes' && <dl className="cc-detail-list"><dt>Code / category</dt><dd>{selected.code} · {selected.category}</dd><dt>Dimensions</dt><dd>{selected.nominalLengthM} × {selected.widthM} × {selected.heightM} m</dd><dt>Max gross weight</dt><dd>{selected.maxGrossWeightKg} kg</dd><dt>Tare weight</dt><dd>{selected.tareWeightKg === undefined ? 'Not specified' : `${selected.tareWeightKg} kg`}</dd><dt>Payload capacity</dt><dd>{selected.payloadCapacityKg === undefined ? 'Not specified' : `${selected.payloadCapacityKg} kg`}</dd><dt>Characteristics</dt><dd>{['refrigerated', 'tank', 'openTop', 'flatRack'].filter((key) => selected[key]).map((key) => key === 'openTop' ? 'Open top' : key === 'flatRack' ? 'Flat rack' : key).join(', ') || 'Standard'}</dd><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Current cargo references</dt><dd>{getContainerTypeReferences(data, selected.containerTypeId).length} cargo records</dd>{selected.notes && <><dt>Notes</dt><dd>{selected.notes}</dd></>}</dl>}
          {tab === 'adrRecords' && <>
            <div className={`cc-adr-indicator ${selected.status === 'applicable' ? 'applicable' : ''}`}><ShieldCheck size={17} /><div><strong>{selected.status === 'applicable' ? 'ADR record' : `ADR ${selected.status}`}</strong><span>{selected.status === 'applicable' ? `${selected.unNumber} · Class ${selected.hazardClass}${selected.packingGroup ? ` · PG ${selected.packingGroup}` : ''}` : 'No mandatory dangerous-goods fields are required for this status.'}</span></div></div>
            <dl className="cc-detail-list"><dt>Status</dt><dd>{selected.status}</dd><dt>Record state</dt><dd>{selected.active === false ? 'Inactive' : 'Active'}</dd><dt>UN number</dt><dd>{selected.unNumber ?? 'Not recorded'}</dd><dt>Proper shipping name</dt><dd>{selected.properShippingName ?? 'Not recorded'}</dd><dt>Hazard class</dt><dd>{selected.hazardClass ? `Class ${selected.hazardClass}` : 'Not recorded'}</dd><dt>Packing group</dt><dd>{selected.packingGroup ? `PG ${selected.packingGroup}` : 'Not recorded'}</dd><dt>Tunnel restriction</dt><dd>{selected.tunnelRestrictionCode ?? 'Not recorded'}</dd><dt>Notes</dt><dd>{selected.additionalNotes ?? 'None'}</dd><dt>Cargo references</dt><dd>{getAdrRecordReferences(data, selected.adrRecordId).length} cargo records</dd></dl>
            <section className="cc-adr-history" aria-label="ADR change history"><h3>Record change history</h3>{adrHistory.length ? <ol>{adrHistory.map((event) => <li key={event.eventId}><time dateTime={event.timestamp}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Budapest' }).format(new Date(event.timestamp))}</time><span>{event.eventType.replaceAll('-', ' ')}</span>{(event.previousValue !== undefined || event.newValue !== undefined) && <small>{event.previousValue ?? '—'} → {event.newValue ?? '—'}</small>}</li>)}</ol> : <p>No changes recorded in this dataset.</p>}</section>
          </>}
          {tab === 'handlingRequirements' && <dl className="cc-detail-list"><dt>Code / category</dt><dd>{selected.code} · {selected.category}</dd><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Description</dt><dd>{selected.description || 'Not specified'}</dd><dt>Attributes</dt><dd><pre>{JSON.stringify(selected.attributes ?? {}, null, 2)}</pre></dd><dt>Used by cargo</dt><dd>{data.cargo.filter((item) => item.handlingRequirementIds.includes(selected.handlingRequirementId)).length} cargo records</dd></dl>}
          <div className="cc-detail-actions"><button type="button" className="cc-secondary" onClick={() => openForm(selected)}>Edit record</button>{tab === 'containerTypes' && <button type="button" className="cc-secondary" onClick={() => openForm(duplicateContainerType(selected, data.containerTypes), true)}><Plus size={14} />Duplicate</button>}{tab === 'adrRecords' && <button type="button" className="cc-secondary" onClick={() => openForm(duplicateAdrRecord(selected, data.adrRecords), true)}><Plus size={14} />Duplicate</button>}{canDeactivate && <button type="button" className="cc-secondary" onClick={() => toggleActive(selected)}><Archive size={14} />{selected.active === false ? 'Activate' : 'Deactivate'}</button>}<button type="button" className="cc-danger" onClick={() => deleteRecord(selected)}><Trash2 size={14} />Delete</button></div>
        </> : <div className="cc-empty cc-detail-empty"><Package size={24} /><strong>Select a record</strong><span>Choose an item to review its structured details and available actions.</span></div>}
      </aside>
    </div>
    <p className="cc-storage-note">Dispatch uses blocking cargo conflicts and only explicitly configured dock capability codes. This is operational guidance, not legal ADR compliance certification.</p>
    {formMode && <CargoComplianceForm key={`${tab}-${formMode.initial ? recordId(formMode.initial, tab) : 'new'}`} tab={tab} initial={formMode.initial} asNew={formMode.asNew} data={data} vehicles={vehicles} onCancel={() => setFormMode(null)} onSave={saveRecord} />}
  </section>
}
