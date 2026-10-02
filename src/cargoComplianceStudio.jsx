import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Box, ClipboardList, FileWarning, Package, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { recalculateDatasetIntegrity, validateOperationsDataset } from './data/datasetFactory.ts'
import { validateCargoComplianceData } from './data/cargoComplianceValidation.ts'
import { mergeStarterMasterData } from './data/masterDataDefaults.ts'
import { deleteContainerType, duplicateContainerType, getContainerTypeReferences, setContainerTypeActive, upsertContainerType } from './data/containerTypeLibrary.ts'
import { appendAdrAuditHistory, deleteAdrRecord, duplicateAdrRecord, getAdrRecordReferences, recordAdrChanges, setAdrRecordActive } from './data/adrRecordManagement.ts'
import { appendCargoAssignmentChanges, validateOperationalCargoReferenceActivity } from './data/operationalCargo.ts'

const TABS = [
  { id: 'cargo', label: 'Cargo', icon: Package },
  { id: 'containerTypes', label: 'Containers', icon: Box },
  { id: 'adrRecords', label: 'ADR / Dangerous Goods', icon: FileWarning },
  { id: 'packagingTypes', label: 'Packaging', icon: Box },
  { id: 'handlingRequirements', label: 'Handling Requirements', icon: ClipboardList },
  { id: 'temperatureProfiles', label: 'Temperature Profiles', icon: ShieldCheck },
]
const EMPTY_DATA = { cargo: [], containerTypes: [], adrRecords: [], handlingRequirements: [], packagingTypes: [], temperatureProfiles: [] }
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const numberValue = (value) => value === undefined || value === null || value === '' ? undefined : Number(value)
const title = (record, tab) => tab === 'cargo' ? record.name || record.description : tab === 'adrRecords' ? record.properShippingName || record.adrRecordId : record.name
const recordId = (record, tab) => ({
  cargo: record.cargoId,
  containerTypes: record.containerTypeId,
  adrRecords: record.adrRecordId,
  handlingRequirements: record.handlingRequirementId,
  packagingTypes: record.packagingTypeId,
  temperatureProfiles: record.temperatureProfileId,
})[tab]
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
  const formEntity = {
    cargo: 'Cargo',
    containerTypes: 'Container Type',
    adrRecords: 'ADR Record',
    handlingRequirements: 'Handling Requirement',
    packagingTypes: 'Packaging Type',
    temperatureProfiles: 'Temperature Profile',
  }[tab] ?? 'Record'
  const [form, setForm] = useState(() => initial
    ? { ...initial, ...(tab === 'adrRecords' && initial.active === undefined ? { active: true } : {}) }
    : createForm(tab))
  const [formError, setFormError] = useState('')
  const [attributesText, setAttributesText] = useState(() => JSON.stringify(initial?.attributes ?? {}, null, 2))
  const [examplesText, setExamplesText] = useState(() => (initial?.cargoExamples ?? []).join('\n'))
  const [adrSearch, setAdrSearch] = useState('')
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
    if (tab === 'cargo' && (!String(form.name ?? '').trim() || !String(form.category ?? '').trim())) {
      setFormError('Cargo name and category are required.')
      return
    }
    if (tab === 'containerTypes' && (!String(form.isoCategory ?? '').trim() || !String(form.typicalUse ?? '').trim())) {
      setFormError('Container ISO category and typical use are required.')
      return
    }
    if (tab === 'adrRecords' && form.status === 'applicable' &&
      ['unNumber', 'properShippingName', 'hazardClass', 'category', 'source', 'referenceVersion'].some((key) => !String(form[key] ?? '').trim())) {
      setFormError('Applicable ADR records require a UN number, proper shipping name, class, category, source, and reference version.')
      return
    }
    if (tab === 'cargo') {
      record = {
        ...record,
        cargoType: form.category || form.cargoType,
        quantity: numberValue(form.quantity),
        weightKg: numberValue(form.weightKg),
        volumeM3: numberValue(form.volumeM3),
        containerTypeId: form.containerTypeId || undefined,
        adrRecordId: form.adrRecordId || undefined,
        packagingTypeId: form.packagingTypeId || undefined,
        temperatureProfileId: form.temperatureProfileId || undefined,
        vehicleId: form.vehicleId || undefined,
        shipmentId: form.shipmentId || undefined,
        operationId: form.operationId || undefined,
        handlingRequirementIds: form.handlingRequirementIds ?? [],
        adrRequired: Boolean(form.adrRequired),
        active: form.active !== false,
      }
    } else if (tab === 'containerTypes') {
      for (const key of ['nominalLengthM', 'widthM', 'heightM', 'maxGrossWeightKg', 'tareWeightKg', 'payloadCapacityKg']) record[key] = numberValue(form[key])
      if (!record.tareWeightKg) delete record.tareWeightKg
      if (!record.payloadCapacityKg) delete record.payloadCapacityKg
      if (!record.requiredDockCapabilityCode) delete record.requiredDockCapabilityCode
      if (!record.notes) delete record.notes
    } else if (tab === 'adrRecords') {
      for (const key of ['unNumber', 'properShippingName', 'hazardClass', 'classificationCode', 'packingGroup', 'tunnelRestrictionCode', 'category', 'source', 'referenceVersion', 'notes', 'additionalNotes', 'requiredDockCapabilityCode']) {
        if (!record[key]) delete record[key]
      }
    } else if (tab === 'handlingRequirements') {
      if (!record.description) delete record.description
      if (!record.requiredDockCapabilityCode) delete record.requiredDockCapabilityCode
      record.cargoExamples = examplesText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
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
    } else if (tab === 'packagingTypes') {
      record.adrCompatible = form.adrCompatible === '' ? undefined : form.adrCompatible === 'unknown' ? null : form.adrCompatible === 'yes'
    } else if (tab === 'temperatureProfiles') {
      record.minimumCelsius = numberValue(form.minimumCelsius)
      record.maximumCelsius = numberValue(form.maximumCelsius)
      if (!record.notes) delete record.notes
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
            <TextField label="Cargo name" value={form.name ?? form.description} onChange={(v) => { set('name', v); set('description', v) }} required />
            <SelectField label="Cargo category" value={form.category ?? ''} onChange={(v) => { set('category', v); set('cargoType', v) }}><option value="">Select a category</option>{['General Cargo', 'Palletized Cargo', 'Boxed Cargo', 'Liquid Cargo', 'Bulk Cargo', 'Dangerous Goods', 'Refrigerated Cargo', 'Oversized Cargo', 'Fragile Cargo', 'High Value Cargo'].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField>
            <TextField label="Description" value={form.description} onChange={(v) => set('description', v)} required />
            <TextField label="Quantity" type="number" min="0.001" step="any" value={form.quantity} onChange={(v) => set('quantity', v)} required />
            <TextField label="Quantity unit" value={form.quantityUnit} onChange={(v) => set('quantityUnit', v)} placeholder="pallets, cartons…" required />
            <TextField label="Weight (kg)" type="number" min="0" step="any" value={form.weightKg} onChange={(v) => set('weightKg', v)} />
            <TextField label="Volume (m³)" type="number" min="0" step="any" value={form.volumeM3} onChange={(v) => set('volumeM3', v)} />
            <SelectField label="Container type" value={form.containerTypeId} onChange={(v) => set('containerTypeId', v)}><option value="">Not specified</option>{data.containerTypes.filter((item) => item.active || item.containerTypeId === form.containerTypeId).map((item) => <option key={item.containerTypeId} value={item.containerTypeId}>{item.code} · {item.name}{item.active ? '' : ' · Inactive'}</option>)}</SelectField>
            <SelectField label="Packaging type" value={form.packagingTypeId} onChange={(v) => set('packagingTypeId', v)}><option value="">Not specified</option>{(data.packagingTypes ?? []).filter((item) => item.active || item.packagingTypeId === form.packagingTypeId).map((item) => <option key={item.packagingTypeId} value={item.packagingTypeId}>{item.name}{item.active ? '' : ' · Inactive'}</option>)}</SelectField>
            <SelectField label="Temperature profile" value={form.temperatureProfileId} onChange={(v) => set('temperatureProfileId', v)}><option value="">Not specified</option>{(data.temperatureProfiles ?? []).filter((item) => item.active || item.temperatureProfileId === form.temperatureProfileId).map((item) => <option key={item.temperatureProfileId} value={item.temperatureProfileId}>{item.name}{item.active ? '' : ' · Inactive'}</option>)}</SelectField>
            <SelectField label="ADR record" value={form.adrRecordId} onChange={(v) => set('adrRecordId', v)}><option value="">Not specified</option>{data.adrRecords.filter((item) => item.active !== false || item.adrRecordId === form.adrRecordId).filter((item) => !adrSearch || `${item.unNumber ?? ''} ${item.properShippingName ?? ''} ${item.category ?? ''}`.toLowerCase().includes(adrSearch.toLowerCase())).map((item) => <option key={item.adrRecordId} value={item.adrRecordId}>{item.unNumber ?? item.status} · {item.properShippingName || item.adrRecordId} · {item.category ?? ''}{item.active === false ? ' · Inactive' : ''}</option>)}</SelectField>
            <TextField label="Search ADR by UN number, name, or category" value={adrSearch} onChange={setAdrSearch} placeholder="UN 1203, gasoline, corrosive…" />
            <ToggleField label="ADR reference required for this cargo profile" checked={form.adrRequired} onChange={(v) => set('adrRequired', v)} />
            <TextField label="Special handling" value={form.specialHandling} onChange={(v) => set('specialHandling', v)} />
            <SelectField label="Vehicle (optional)" value={form.vehicleId} onChange={(v) => set('vehicleId', v)}><option value="">Unassigned</option>{vehicles.map((item) => <option key={item.vehicleId} value={item.vehicleId}>{item.plate} · {item.vehicleId}</option>)}</SelectField>
            <TextField label="Shipment ID (optional)" value={form.shipmentId} onChange={(v) => set('shipmentId', v)} />
            <TextField label="Operation ID (optional)" value={form.operationId} onChange={(v) => set('operationId', v)} />
            <fieldset className="cc-checkbox-group"><legend>Handling requirements</legend>{data.handlingRequirements.filter((item) => item.active || (form.handlingRequirementIds ?? []).includes(item.handlingRequirementId)).map((item) => <ToggleField key={item.handlingRequirementId} label={`${item.name}${item.active ? '' : ' · Inactive'}`} checked={(form.handlingRequirementIds ?? []).includes(item.handlingRequirementId)} onChange={(checked) => set('handlingRequirementIds', checked ? [...(form.handlingRequirementIds ?? []), item.handlingRequirementId] : (form.handlingRequirementIds ?? []).filter((id) => id !== item.handlingRequirementId))} />)}{data.handlingRequirements.filter((item) => item.active || (form.handlingRequirementIds ?? []).includes(item.handlingRequirementId)).length === 0 && <small>No active requirements configured.</small>}</fieldset>
            <ToggleField label="Active" checked={form.active !== false} onChange={(v) => set('active', v)} />
            <label className="cc-field cc-wide"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} rows="3" /></label>
          </>}
          {tab === 'containerTypes' && <>
            <TextField label="Container type ID" value={form.containerTypeId} onChange={(v) => set('containerTypeId', v)} required />
            <TextField label="Code" value={form.code} onChange={(v) => set('code', v)} required />
            <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} required />
            <SelectField label="Category" value={form.category} onChange={(v) => set('category', v)}>{['standard', 'reefer', 'tank', 'open-top', 'flat-rack', 'other'].map((v) => <option key={v} value={v}>{v.replace('-', ' ')}</option>)}</SelectField>
            <TextField label="ISO category" value={form.isoCategory} onChange={(v) => set('isoCategory', v)} required />
            <TextField label="Typical use" value={form.typicalUse} onChange={(v) => set('typicalUse', v)} required />
            <TextField label="Nominal length (m)" type="number" min="0.001" step="any" value={form.nominalLengthM} onChange={(v) => set('nominalLengthM', v)} required />
            <TextField label="Width (m)" type="number" min="0.001" step="any" value={form.widthM} onChange={(v) => set('widthM', v)} required />
            <TextField label="Height (m)" type="number" min="0.001" step="any" value={form.heightM} onChange={(v) => set('heightM', v)} required />
            <TextField label="Max gross weight (kg)" type="number" min="0.001" step="any" value={form.maxGrossWeightKg} onChange={(v) => set('maxGrossWeightKg', v)} required />
            <TextField label="Tare weight (kg)" type="number" min="0" step="any" value={form.tareWeightKg} onChange={(v) => set('tareWeightKg', v)} />
            <TextField label="Payload capacity (kg)" type="number" min="0.001" step="any" value={form.payloadCapacityKg} onChange={(v) => set('payloadCapacityKg', v)} />
            <TextField label="Required dock capability code (optional)" value={form.requiredDockCapabilityCode} onChange={(v) => set('requiredDockCapabilityCode', v)} placeholder="e.g. REEFER" />
            <div className="cc-toggle-grid"><ToggleField label="Reefer" checked={form.refrigerated} onChange={(v) => set('refrigerated', v)} /><ToggleField label="Tank" checked={form.tank} onChange={(v) => set('tank', v)} /><ToggleField label="Open top" checked={form.openTop} onChange={(v) => set('openTop', v)} /><ToggleField label="Flat rack" checked={form.flatRack} onChange={(v) => set('flatRack', v)} /><ToggleField label="Temperature controlled" checked={form.temperatureControlled ?? form.refrigerated} onChange={(v) => set('temperatureControlled', v)} /><ToggleField label="Active" checked={form.active} onChange={(v) => set('active', v)} /></div>
            <SelectField label="ADR compatible (configured metadata only)" value={form.adrCompatible === undefined ? '' : form.adrCompatible ? 'yes' : 'no'} onChange={(v) => set('adrCompatible', v === '' ? undefined : v === 'yes')}><option value="">Not specified</option><option value="yes">Yes</option><option value="no">No</option></SelectField>
            <label className="cc-field cc-wide"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} rows="3" /></label>
          </>}
          {tab === 'adrRecords' && <>
            <TextField label="ADR record ID" value={form.adrRecordId} onChange={(v) => set('adrRecordId', v)} required />
            <SelectField label="ADR status" value={form.status} onChange={(v) => set('status', v)}><option value="unknown">Unknown</option><option value="not-applicable">Not applicable</option><option value="applicable">Applicable</option></SelectField>
            <TextField label="UN number" value={form.unNumber} onChange={(v) => set('unNumber', v)} placeholder="UN 1203" required={form.status === 'applicable'} />
            <TextField label="Proper shipping name" value={form.properShippingName} onChange={(v) => set('properShippingName', v)} required={form.status === 'applicable'} />
            <SelectField label="Hazard class" value={form.hazardClass} onChange={(v) => set('hazardClass', v)}><option value="">Not specified</option>{['1', '2', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9'].map((v) => <option key={v} value={v}>Class {v}</option>)}</SelectField>
            <TextField label="Classification code" value={form.classificationCode} onChange={(v) => set('classificationCode', v)} />
            <SelectField label="Packing group" value={form.packingGroup} onChange={(v) => set('packingGroup', v)}><option value="">Not specified</option>{['I', 'II', 'III'].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField>
            <TextField label="Tunnel restriction" value={form.tunnelRestrictionCode} onChange={(v) => set('tunnelRestrictionCode', v)} />
            <TextField label="Category" value={form.category} onChange={(v) => set('category', v)} />
            <TextField label="Source" value={form.source} onChange={(v) => set('source', v)} />
            <TextField label="Reference version" value={form.referenceVersion} onChange={(v) => set('referenceVersion', v)} />
            <TextField label="Required dock capability code (optional)" value={form.requiredDockCapabilityCode} onChange={(v) => set('requiredDockCapabilityCode', v)} placeholder="Explicit configuration only" />
              <ToggleField label="Record active" checked={form.active} onChange={(v) => set('active', v)} />
              <label className="cc-field cc-wide"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} rows="2" /></label>
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
            <label className="cc-field cc-wide"><span>Example cargo (one per line)</span><textarea value={examplesText} onChange={(event) => setExamplesText(event.target.value)} rows="3" /></label>
            <label className="cc-field cc-wide"><span>Attributes (JSON object, optional)</span><textarea value={attributesText} onChange={(event) => setAttributesText(event.target.value)} rows="4" spellCheck="false" /><small>Use scalar values such as temperature limits or security level.</small></label>
          </>}
          {tab === 'packagingTypes' && <>
            <TextField label="Packaging type ID" value={form.packagingTypeId} onChange={(v) => set('packagingTypeId', v)} required />
            <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} required />
            <TextField label="Material" value={form.material} onChange={(v) => set('material', v)} required />
            <ToggleField label="Reusable" checked={form.reusable} onChange={(v) => set('reusable', v)} />
            <ToggleField label="Stackable" checked={form.stackable} onChange={(v) => set('stackable', v)} />
            <SelectField label="ADR compatible (verify per package approval)" value={form.adrCompatible === null ? 'unknown' : form.adrCompatible === undefined ? '' : form.adrCompatible ? 'yes' : 'no'} onChange={(v) => set('adrCompatible', v === '' ? undefined : v === 'unknown' ? null : v === 'yes')}><option value="">Not specified</option><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></SelectField>
            <TextField label="Typical cargo (comma separated)" value={(form.typicalCargo ?? []).join(', ')} onChange={(v) => set('typicalCargo', v.split(',').map((item) => item.trim()).filter(Boolean))} />
            <ToggleField label="Active" checked={form.active} onChange={(v) => set('active', v)} />
          </>}
          {tab === 'temperatureProfiles' && <>
            <TextField label="Temperature profile ID" value={form.temperatureProfileId} onChange={(v) => set('temperatureProfileId', v)} required />
            <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} required />
            <TextField label="Minimum (°C)" type="number" step="any" value={form.minimumCelsius} onChange={(v) => set('minimumCelsius', v)} />
            <TextField label="Maximum (°C)" type="number" step="any" value={form.maximumCelsius} onChange={(v) => set('maximumCelsius', v)} />
            <ToggleField label="Active" checked={form.active} onChange={(v) => set('active', v)} />
            <label className="cc-field cc-wide"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} rows="3" /></label>
          </>}
        </div>
        {tab === 'cargo' && form.name?.trim() && data.cargo.some((item) =>
          item.cargoId !== (isEdit ? initial.cargoId : undefined) &&
          (item.name ?? item.description).trim().toLowerCase() === form.name.trim().toLowerCase()) &&
          <div className="cc-storage-note" role="status">A cargo profile with this name already exists. Review it before saving a duplicate.</div>}
        {formError && <div className="cc-error" role="alert">{formError}</div>}
        <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onCancel}>Cancel</button><button type="submit" className="cc-primary">{isEdit ? 'Save changes' : 'Create record'}</button></div>
      </form>
    </section>
  </div>
}

function createForm(tab) {
  if (tab === 'cargo') return { cargoId: newId('cargo'), cargoType: '', name: '', category: '', description: '', quantity: '1', quantityUnit: 'units', weightKg: '', volumeM3: '', containerTypeId: '', adrRecordId: '', adrRequired: false, packagingTypeId: '', temperatureProfileId: '', specialHandling: '', handlingRequirementIds: [], vehicleId: '', shipmentId: '', operationId: '', active: true, notes: '' }
  if (tab === 'containerTypes') return { containerTypeId: newId('container'), code: '', name: '', category: 'standard', isoCategory: '', typicalUse: '', nominalLengthM: '', widthM: '', heightM: '', maxGrossWeightKg: '', tareWeightKg: '', payloadCapacityKg: '', refrigerated: false, tank: false, openTop: false, flatRack: false, temperatureControlled: false, adrCompatible: '', active: true, requiredDockCapabilityCode: '', notes: '' }
  if (tab === 'adrRecords') return { adrRecordId: newId('adr'), status: 'unknown', active: true, requiredDockCapabilityCode: '', unNumber: '', properShippingName: '', hazardClass: '', classificationCode: '', packingGroup: '', tunnelRestrictionCode: '', category: '', source: '', referenceVersion: '', notes: '', additionalNotes: '' }
  if (tab === 'handlingRequirements') return { handlingRequirementId: newId('handling'), code: '', name: '', category: 'other', active: true, requiredDockCapabilityCode: '', description: '', cargoExamples: [], attributes: {} }
  if (tab === 'packagingTypes') return { packagingTypeId: newId('packaging'), name: '', material: '', reusable: false, stackable: false, adrCompatible: null, typicalCargo: [], active: true }
  return { temperatureProfileId: newId('temperature'), name: '', minimumCelsius: '', maximumCelsius: '', active: true, notes: '' }
}

function describeRecord(record, tab, data) {
  if (tab === 'cargo') {
    const container = data.containerTypes.find((item) => item.containerTypeId === record.containerTypeId)
    const adr = data.adrRecords.find((item) => item.adrRecordId === record.adrRecordId)
    const requirements = (record.handlingRequirementIds ?? []).map((id) => data.handlingRequirements.find((item) => item.handlingRequirementId === id)?.name).filter(Boolean)
    const packaging = (data.packagingTypes ?? []).find((item) => item.packagingTypeId === record.packagingTypeId)
    const temperature = (data.temperatureProfiles ?? []).find((item) => item.temperatureProfileId === record.temperatureProfileId)
    return `${record.category ?? record.cargoType ?? 'Cargo'} · ${record.weightKg === undefined ? 'Weight n/a' : `${record.weightKg} kg`} · ${container?.name ?? 'No container'} · ${packaging?.name ?? 'Packaging n/a'} · ${temperature?.name ?? 'No temperature profile'} · ${record.adrRequired ? `ADR required${adr?.unNumber ? ` · ${adr.unNumber}` : ''}` : `ADR ${adr?.status ?? 'not required'}`} · ${requirements.length ? requirements.join(', ') : 'No special handling'}`
  }
  if (tab === 'containerTypes') return `${record.code} · ${record.isoCategory ?? record.category} · ${record.nominalLengthM} × ${record.widthM} × ${record.heightM} m · ${record.typicalUse ?? 'Typical use not recorded'}${record.requiredDockCapabilityCode ? ` · Capability ${record.requiredDockCapabilityCode}` : ''}`
  if (tab === 'adrRecords') return `${record.status === 'applicable' ? `ADR · ${record.unNumber} · Class ${record.hazardClass}${record.packingGroup ? ` · PG ${record.packingGroup}` : ''}` : `ADR ${record.status}`} · ${record.category ?? 'Uncategorized'}`
  if (tab === 'handlingRequirements') return `${record.code} · ${record.category} · ${(record.cargoExamples ?? []).join(', ')}${record.requiredDockCapabilityCode ? ` · Requires ${record.requiredDockCapabilityCode}` : ''}${record.active ? ' · Active' : ' · Inactive'}`
  if (tab === 'packagingTypes') return `${record.material} · ${record.reusable ? 'Reusable' : 'Single use'} · ${record.stackable ? 'Stackable' : 'Not stackable'} · ${record.typicalCargo.join(', ')}`
  return `${record.minimumCelsius === undefined ? 'No minimum' : `${record.minimumCelsius} °C`} to ${record.maximumCelsius === undefined ? 'no maximum' : `${record.maximumCelsius} °C`}`
}

export default function CargoComplianceStudio({ dataset, onSave }) {
  const [tab, setTab] = useState('cargo')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [capabilityFilter, setCapabilityFilter] = useState('all')
  const [adrStatusFilter, setAdrStatusFilter] = useState('all')
  const [adrClassFilter, setAdrClassFilter] = useState('all')
  const [packingGroupFilter, setPackingGroupFilter] = useState('all')
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
    const active = item.active !== false
    const categoryMatches = !['containerTypes', 'cargo', 'adrRecords'].includes(tab) || categoryFilter === 'all' || item.category === categoryFilter
    const capabilityMatches = tab !== 'containerTypes' || capabilityFilter === 'all' || item[capabilityFilter] === true
    const adrStatusMatches = tab !== 'adrRecords' || adrStatusFilter === 'all' || item.status === adrStatusFilter
    const adrClassMatches = tab !== 'adrRecords' || adrClassFilter === 'all' || item.hazardClass === adrClassFilter
    const packingGroupMatches = tab !== 'adrRecords' || packingGroupFilter === 'all' || item.packingGroup === packingGroupFilter
    return matches && categoryMatches && capabilityMatches && adrStatusMatches && adrClassMatches && packingGroupMatches &&
      (filter === 'all' || (filter === 'active' ? active : !active))
  }), [collection, filter, search, categoryFilter, capabilityFilter, adrStatusFilter, adrClassFilter, packingGroupFilter, tab])

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
    const current = dataset.cargoCompliance ?? EMPTY_DATA
    if (current.catalogDefaultsVersion === '1') return
    const initialized = mergeStarterMasterData(dataset.cargoCompliance)
    commit(initialized, 'Initial editable master-data catalog added to this dataset.')
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
    const updated = { ...record, active: !record.active }
    let nextData
    if (tab === 'containerTypes') nextData = setContainerTypeActive(data, record.containerTypeId, updated.active)
    else if (tab === 'adrRecords') {
      const adrRecords = collection.map((item) => item.adrRecordId === record.adrRecordId ? updated : item)
      nextData = appendAdrAuditHistory(
        { ...data, adrRecords },
        recordAdrChanges(record, updated, new Date().toISOString(), data.adrAuditHistory?.length ?? 0),
      )
    } else nextData = { ...data, [tab]: collection.map((item) => recordId(item, tab) === recordId(record, tab) ? updated : item) }
    commit(nextData, `${title(record, tab)} ${updated.active ? 'activated' : 'deactivated'}.`)
  }

  const deleteRecord = (record) => {
    const id = recordId(record, tab)
    if (tab === 'cargo' && (record.vehicleId || record.shipmentId || record.operationId)) {
      setError('Cannot delete cargo while it is assigned to a vehicle, shipment, or operation. Unassign it or deactivate the profile instead.')
      return
    }
    if (tab === 'cargo' && (data.cargoAssignmentHistory ?? []).some((event) => event.cargoId === id)) {
      setError('Cannot delete this cargo while its assignment audit history exists. Deactivate the profile instead.')
      return
    }
    const usedBy = tab === 'containerTypes' ? getContainerTypeReferences(data, id)
      : tab === 'adrRecords' ? getAdrRecordReferences(data, id)
        : tab === 'handlingRequirements' ? data.cargo.filter((item) => item.handlingRequirementIds.includes(id))
          : tab === 'packagingTypes' ? data.cargo.filter((item) => item.packagingTypeId === id)
            : tab === 'temperatureProfiles' ? data.cargo.filter((item) => item.temperatureProfileId === id) : []
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
  const duplicateRecord = (record) => {
    if (tab === 'containerTypes') return duplicateContainerType(record, data.containerTypes)
    if (tab === 'adrRecords') return duplicateAdrRecord(record, data.adrRecords)
    if (tab === 'cargo') return {
      ...record,
      cargoId: newId('cargo'),
      name: `${record.name || record.description} (Copy)`,
      description: `${record.description} (Copy)`,
      vehicleId: undefined,
      operationId: undefined,
      shipmentId: undefined,
      active: true,
      handlingRequirementIds: [...record.handlingRequirementIds],
    }
    if (tab === 'handlingRequirements') return {
      ...record,
      handlingRequirementId: newId('handling'),
      code: newId('HAND').toUpperCase(),
      name: `${record.name} (Copy)`,
      active: true,
      cargoExamples: [...(record.cargoExamples ?? [])],
    }
    if (tab === 'packagingTypes') return {
      ...record,
      packagingTypeId: newId('packaging'),
      name: `${record.name} (Copy)`,
      typicalCargo: [...record.typicalCargo],
      active: true,
    }
    return { ...record, temperatureProfileId: newId('temperature'), name: `${record.name} (Copy)`, active: true }
  }
  const isCatalog = true
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
        setAdrClassFilter('all')
        setPackingGroupFilter('all')
        document.getElementById(`cc-tab-${next.id}`)?.focus()
      }
    }} onClick={() => { setTab(id); setSelectedId(''); setSearch(''); setFilter('all'); setCategoryFilter('all'); setCapabilityFilter('all'); setAdrStatusFilter('all'); setAdrClassFilter('all'); setPackingGroupFilter('all'); setError(''); setNotice('') }}><Icon size={15} />{label}<span>{(data[id] ?? []).length}</span></button>)}</div>
    <div className="cc-feedback" aria-live="polite">{error && <div className="cc-error" role="alert">{error}</div>}{notice && <div className="cc-notice" role="status">{notice}</div>}</div>
    <div className="cc-workspace" id="cc-panel" role="tabpanel" aria-labelledby={`cc-tab-${tab}`}>
      <div className="cc-record-panel">
        <div className="cc-list-toolbar"><label className="cc-search"><Search size={15} /><input type="search" aria-label={`Search ${currentTab.label}`} placeholder={`Search ${currentTab.label.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label><button type="button" className="cc-primary" onClick={() => openForm()}><Plus size={15} />Add {tab === 'containerTypes' ? 'Container Type' : tab === 'adrRecords' ? 'ADR Record' : tab === 'handlingRequirements' ? 'Requirement' : tab === 'packagingTypes' ? 'Packaging Type' : tab === 'temperatureProfiles' ? 'Temperature Profile' : 'Cargo'}</button></div>
        {tab === 'adrRecords' && collection.length === 0 && <p className="cc-storage-note" role="note">No ADR templates are preloaded. Add records only after verifying their fields against the official ADR 2025 source.</p>}
        {isCatalog && <div className="cc-list-filters" aria-label="Record filters">{['all', 'active', 'inactive'].map((value) => <button key={value} type="button" className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All records' : value}</button>)}
          {(tab === 'containerTypes' || tab === 'cargo') && <label className="cc-filter-select"><span>Category</span><select aria-label={`Filter by ${tab === 'cargo' ? 'cargo' : 'container'} category`} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Any category</option>{(tab === 'cargo' ? ['General Cargo', 'Palletized Cargo', 'Boxed Cargo', 'Liquid Cargo', 'Bulk Cargo', 'Dangerous Goods', 'Refrigerated Cargo', 'Oversized Cargo', 'Fragile Cargo', 'High Value Cargo'] : ['standard', 'reefer', 'tank', 'open-top', 'flat-rack', 'other']).map((value) => <option key={value} value={value}>{value.replace('-', ' ')}</option>)}</select></label>}
          {tab === 'containerTypes' && <>
            <label className="cc-filter-select"><span>Capability</span><select aria-label="Filter by container capability" value={capabilityFilter} onChange={(event) => setCapabilityFilter(event.target.value)}><option value="all">Any capability</option><option value="refrigerated">Refrigerated</option><option value="tank">Tank capable</option><option value="openTop">Open top</option><option value="flatRack">Flat rack</option></select></label>
          </>}
          {tab === 'adrRecords' && <>
            <label className="cc-filter-select"><span>ADR status</span><select aria-label="Filter by ADR status" value={adrStatusFilter} onChange={(event) => setAdrStatusFilter(event.target.value)}><option value="all">Any ADR status</option><option value="applicable">Applicable</option><option value="not-applicable">Not applicable</option><option value="unknown">Unknown</option></select></label>
            <label className="cc-filter-select"><span>Class</span><select aria-label="Filter by ADR class" value={adrClassFilter} onChange={(event) => setAdrClassFilter(event.target.value)}><option value="all">All classes</option>{['2', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '8', '9'].map((value) => <option key={value} value={value}>Class {value}</option>)}</select></label>
            <label className="cc-filter-select"><span>Packing group</span><select aria-label="Filter by packing group" value={packingGroupFilter} onChange={(event) => setPackingGroupFilter(event.target.value)}><option value="all">All groups</option>{['I', 'II', 'III'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="cc-filter-select"><span>Category</span><select aria-label="Filter by ADR category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{[...new Set(data.adrRecords.map((item) => item.category).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </>}
        </div>}
        {filtered.length === 0
          ? <div className="cc-empty"><Package size={24} /><strong>{collection.length ? 'No matching records' : `No ${currentTab.label} yet`}</strong><span>{collection.length ? 'Try changing the search or status filter.' : 'Create a record to start building this dataset’s logistics catalog.'}</span>{collection.length === 0 && <button type="button" className="cc-secondary" onClick={() => openForm()}><Plus size={14} />Create first record</button>}</div>
          : <div className="cc-record-list">{filtered.map((record) => {
            const id = recordId(record, tab)
            const inactive = record.active === false
            return <article key={id} className={`cc-record-card ${selectedId === id ? 'selected' : ''} ${inactive ? 'inactive' : ''}`}>
              <button type="button" className="cc-record-main" onClick={() => setSelectedId(id)} aria-pressed={selectedId === id}>
                <span className="cc-record-id">{id}</span><strong>{title(record, tab)}</strong><span>{describeRecord(record, tab, data)}</span>
              </button>
              <span className={`cc-status-pill ${inactive ? 'inactive' : tab === 'adrRecords' && record.status === 'applicable' || tab === 'cargo' && record.adrRequired ? 'warning' : 'active'}`}>{inactive ? 'Inactive' : tab === 'adrRecords' ? record.status === 'applicable' ? `ADR · ${record.unNumber} · Class ${record.hazardClass}${record.packingGroup ? ` · PG ${record.packingGroup}` : ''}` : `ADR ${record.status}` : tab === 'cargo' ? record.adrRequired ? 'ADR reference required' : 'No ADR required' : 'Active'}</span>
            </article>
          })}</div>}
      </div>
      <aside className="cc-detail-panel" aria-label={`${currentTab.label} details`}>
        {selected ? <>
          <div className="cc-detail-top"><div><span>Record detail</span><h2>{title(selected, tab)}</h2><small>{recordId(selected, tab)}</small></div><button type="button" className="cc-icon-button" onClick={() => setSelectedId('')} aria-label="Close details"><X size={16} /></button></div>
          {selected.requiredDockCapabilityCode && <p className="cc-storage-note">Dispatch requires configured dock capability <strong>{selected.requiredDockCapabilityCode}</strong>.</p>}
          {tab === 'cargo' && <dl className="cc-detail-list"><dt>Category</dt><dd>{selected.category ?? selected.cargoType}</dd><dt>Description</dt><dd>{selected.description}</dd><dt>Quantity</dt><dd>{selected.quantity} {selected.quantityUnit}</dd><dt>Weight</dt><dd>{selected.weightKg === undefined ? 'Not recorded' : `${selected.weightKg} kg`}</dd><dt>Volume</dt><dd>{selected.volumeM3 === undefined ? 'Not recorded' : `${selected.volumeM3} m³`}</dd><dt>Container</dt><dd>{data.containerTypes.find((item) => item.containerTypeId === selected.containerTypeId)?.name ?? 'Not specified'}</dd><dt>Packaging</dt><dd>{(data.packagingTypes ?? []).find((item) => item.packagingTypeId === selected.packagingTypeId)?.name ?? 'Not specified'}</dd><dt>ADR reference required</dt><dd>{selected.adrRequired ? 'Yes' : 'No'}</dd><dt>ADR details</dt><dd>{selectedCargoAdr ? selectedCargoAdr.status === 'applicable' ? `ADR · ${selectedCargoAdr.unNumber} · ${selectedCargoAdr.properShippingName} · Class ${selectedCargoAdr.hazardClass}${selectedCargoAdr.packingGroup ? ` · PG ${selectedCargoAdr.packingGroup}` : ''}` : `ADR ${selectedCargoAdr.status}` : 'Not specified'}</dd><dt>Handling</dt><dd>{selected.handlingRequirementIds.map((id) => data.handlingRequirements.find((item) => item.handlingRequirementId === id)?.name).filter(Boolean).join(', ') || 'None recorded'}</dd><dt>Temperature profile</dt><dd>{(data.temperatureProfiles ?? []).find((item) => item.temperatureProfileId === selected.temperatureProfileId)?.name ?? 'Not specified'}</dd><dt>Special handling</dt><dd>{selected.specialHandling || 'Not specified'}</dd><dt>Status</dt><dd>{selected.active === false ? 'Inactive' : 'Active'}</dd>{selected.notes && <><dt>Notes</dt><dd>{selected.notes}</dd></>}</dl>}
          {tab === 'containerTypes' && <dl className="cc-detail-list"><dt>Code / category</dt><dd>{selected.code} · {selected.isoCategory ?? selected.category}</dd><dt>Dimensions</dt><dd>{selected.nominalLengthM} × {selected.widthM} × {selected.heightM} m</dd><dt>Max gross weight</dt><dd>{selected.maxGrossWeightKg} kg</dd><dt>Tare weight</dt><dd>{selected.tareWeightKg === undefined ? 'Not specified' : `${selected.tareWeightKg} kg`}</dd><dt>Payload capacity</dt><dd>{selected.payloadCapacityKg === undefined ? 'Not specified' : `${selected.payloadCapacityKg} kg`}</dd><dt>Typical use</dt><dd>{selected.typicalUse ?? 'Not specified'}</dd><dt>Characteristics</dt><dd>{['refrigerated', 'tank', 'openTop', 'flatRack'].filter((key) => selected[key]).map((key) => key === 'openTop' ? 'Open top' : key === 'flatRack' ? 'Flat rack' : key).join(', ') || 'Standard'}</dd><dt>Temperature controlled</dt><dd>{selected.temperatureControlled === undefined ? 'Not specified' : selected.temperatureControlled ? 'Yes' : 'No'}</dd><dt>ADR compatible</dt><dd>{selected.adrCompatible === undefined ? 'Not specified' : selected.adrCompatible ? 'Yes' : 'No'}</dd><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Current cargo references</dt><dd>{getContainerTypeReferences(data, selected.containerTypeId).length} cargo records</dd>{selected.notes && <><dt>Notes</dt><dd>{selected.notes}</dd></>}</dl>}
          {tab === 'adrRecords' && <>
            <div className={`cc-adr-indicator ${selected.status === 'applicable' ? 'applicable' : ''}`}><ShieldCheck size={17} /><div><strong>{selected.status === 'applicable' ? 'ADR record' : `ADR ${selected.status}`}</strong><span>{selected.status === 'applicable' ? `${selected.unNumber} · Class ${selected.hazardClass}${selected.packingGroup ? ` · PG ${selected.packingGroup}` : ''}` : 'No mandatory dangerous-goods fields are required for this status.'}</span></div></div>
            <dl className="cc-detail-list"><dt>Status</dt><dd>{selected.status}</dd><dt>Record state</dt><dd>{selected.active === false ? 'Inactive' : 'Active'}</dd><dt>UN number</dt><dd>{selected.unNumber ?? 'Not recorded'}</dd><dt>Proper shipping name</dt><dd>{selected.properShippingName ?? 'Not recorded'}</dd><dt>Hazard class</dt><dd>{selected.hazardClass ? `Class ${selected.hazardClass}` : 'Not recorded'}</dd><dt>Classification code</dt><dd>{selected.classificationCode ?? 'Not recorded'}</dd><dt>Packing group</dt><dd>{selected.packingGroup ? `PG ${selected.packingGroup}` : 'Not recorded'}</dd><dt>Tunnel restriction</dt><dd>{selected.tunnelRestrictionCode ?? 'Not recorded'}</dd><dt>Category</dt><dd>{selected.category ?? 'Not recorded'}</dd><dt>Source / version</dt><dd>{[selected.source, selected.referenceVersion].filter(Boolean).join(' · ') || 'Not recorded'}</dd><dt>Notes</dt><dd>{selected.notes ?? selected.additionalNotes ?? 'None'}</dd><dt>Cargo references</dt><dd>{getAdrRecordReferences(data, selected.adrRecordId).length} cargo records</dd></dl>
            <section className="cc-adr-history" aria-label="ADR change history"><h3>Record change history</h3>{adrHistory.length ? <ol>{adrHistory.map((event) => <li key={event.eventId}><time dateTime={event.timestamp}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Budapest' }).format(new Date(event.timestamp))}</time><span>{event.eventType.replaceAll('-', ' ')}</span>{(event.previousValue !== undefined || event.newValue !== undefined) && <small>{event.previousValue ?? '—'} → {event.newValue ?? '—'}</small>}</li>)}</ol> : <p>No changes recorded in this dataset.</p>}</section>
          </>}
          {tab === 'handlingRequirements' && <dl className="cc-detail-list"><dt>Code / category</dt><dd>{selected.code} · {selected.category}</dd><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Description</dt><dd>{selected.description || 'Not specified'}</dd><dt>Example cargo</dt><dd>{(selected.cargoExamples ?? []).join(', ') || 'Not specified'}</dd><dt>Attributes</dt><dd><pre>{JSON.stringify(selected.attributes ?? {}, null, 2)}</pre></dd><dt>Used by cargo</dt><dd>{data.cargo.filter((item) => item.handlingRequirementIds.includes(selected.handlingRequirementId)).length} cargo records</dd></dl>}
          {tab === 'packagingTypes' && <dl className="cc-detail-list"><dt>Material</dt><dd>{selected.material}</dd><dt>Reusable</dt><dd>{selected.reusable ? 'Yes' : 'No'}</dd><dt>Stackable</dt><dd>{selected.stackable ? 'Yes' : 'No'}</dd><dt>ADR compatible</dt><dd>{selected.adrCompatible === undefined || selected.adrCompatible === null ? 'Not specified' : selected.adrCompatible ? 'Yes' : 'No'}</dd><dt>Typical cargo</dt><dd>{selected.typicalCargo.join(', ')}</dd><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Used by cargo</dt><dd>{data.cargo.filter((item) => item.packagingTypeId === selected.packagingTypeId).length} cargo records</dd></dl>}
          {tab === 'temperatureProfiles' && <dl className="cc-detail-list"><dt>Minimum</dt><dd>{selected.minimumCelsius === undefined ? 'Not configured' : `${selected.minimumCelsius} °C`}</dd><dt>Maximum</dt><dd>{selected.maximumCelsius === undefined ? 'Not configured' : `${selected.maximumCelsius} °C`}</dd><dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Notes</dt><dd>{selected.notes || 'None'}</dd><dt>Used by cargo</dt><dd>{data.cargo.filter((item) => item.temperatureProfileId === selected.temperatureProfileId).length} cargo records</dd></dl>}
          <div className="cc-detail-actions"><button type="button" className="cc-secondary" onClick={() => openForm(selected)}>Edit record</button><button type="button" className="cc-secondary" onClick={() => openForm(duplicateRecord(selected), true)}><Plus size={14} />Duplicate</button>{canDeactivate && <button type="button" className="cc-secondary" onClick={() => toggleActive(selected)}><Archive size={14} />{selected.active === false ? 'Activate' : 'Deactivate'}</button>}<button type="button" className="cc-danger" onClick={() => deleteRecord(selected)}><Trash2 size={14} />Delete</button></div>
        </> : <div className="cc-empty cc-detail-empty"><Package size={24} /><strong>Select a record</strong><span>Choose an item to review its structured details and available actions.</span></div>}
      </aside>
    </div>
    <p className="cc-storage-note">These are editable master-data records. The catalog does not determine legal ADR compliance or provide regulatory certification.</p>
    {formMode && <CargoComplianceForm key={`${tab}-${formMode.initial ? recordId(formMode.initial, tab) : 'new'}`} tab={tab} initial={formMode.initial} asNew={formMode.asNew} data={data} vehicles={vehicles} onCancel={() => setFormMode(null)} onSave={saveRecord} />}
  </section>
}
