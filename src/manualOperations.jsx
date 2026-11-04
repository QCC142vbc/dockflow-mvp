import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { operationsApi } from './data/operationsApiClient'
import './styles.css'

const EMPTY_DATA = { warehouses: [], docks: [], vehicles: [], queue: [], shipments: [], operations: [], adrCatalog: [] }
const LEGACY_DATA_KEY = 'dockflow.datasets.v1'
const SHIPMENT_STATUSES = ['REGISTERED', 'READY', 'IN_TRANSIT', 'LOADING', 'UNLOADING', 'COMPLETED', 'DELAYED', 'CANCELLED']
const VEHICLE_STATUSES = ['REGISTERED', 'ARRIVED', 'WAITING', 'ASSIGNED', 'LOADING', 'UNLOADING', 'COMPLETED', 'CANCELLED']
const QUEUE_STATUSES = ['WAITING', 'CALLED', 'ASSIGNED', 'COMPLETED', 'CANCELLED', 'ON_HOLD']
const OPERATION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const OPERATION_TYPES = ['LOADING', 'UNLOADING']

const blankForms = {
  vehicle: { plate: '', carrier_name: '', direction: 'Inbound', load_type: '', pallet_count: '0', appointment_time: '', status: 'REGISTERED' },
  shipment: { reference_number: '', vehicle_id: '', cargo_type: '', description: '', adr_catalog_id: '', weight_kg: '', quantity: '', origin: '', destination: '', status: 'REGISTERED' },
  queue: { vehicle_id: '', position: '1', priority: 'Standard', arrival_time: '', estimated_call_time: '', status: 'WAITING' },
  operation: { vehicle_id: '', shipment_id: '', dock_id: '', operation_type: 'LOADING', status: 'PENDING', actual_start_time: '', actual_end_time: '', progress: '0', notes: '' },
  dock: { status: 'available', state: 'Available', direction: 'All', progress: '0', notes: '' },
}

const asLocalDateTime = (value) => {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const toIsoDateTime = (value) => value ? new Date(value).toISOString() : null
const visibleRecord = (record, query, keys) => !query || keys.some((key) => String(record[key] ?? '').toLowerCase().includes(query.toLowerCase()))
const inputStyle = { width: '100%', padding: '9px 10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#f8fafc' }
const buttonStyle = { border: '1px solid #475569', borderRadius: '6px', padding: '8px 12px', background: '#1e293b', color: '#f8fafc', cursor: 'pointer' }

function Login({ onLogin, error, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return <main className="app" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <form className="panel" style={{ width: 'min(420px, 100%)', padding: 28, display: 'grid', gap: 16 }} onSubmit={(event) => { event.preventDefault(); onLogin(username, password) }}>
      <div><h1>DockFlow Operations</h1><p>Sign in to manage persisted warehouse operations.</p></div>
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      <label>Email<input style={inputStyle} type="email" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Password<input style={inputStyle} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button style={buttonStyle} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>
}

function RecordForm({ type, value, data, onChange, onClose, onSubmit, saving, error }) {
  const activeVehicles = data.vehicles.filter((vehicle) => vehicle.is_active)
  const availableDocks = data.docks.filter((dock) => {
    if (!dock.is_active) return false
    const assignedElsewhere = data.operations.some((operation) =>
      operation.id !== value.id &&
      operation.dock_id === dock.id &&
      ['PENDING', 'IN_PROGRESS'].includes(operation.status),
    )
    return !assignedElsewhere && (dock.status === 'available' || dock.id === value.dock_id)
  })
  const field = (name, label, options = {}) => {
    const shared = { id: `${type}-${name}`, name, required: options.required ?? false, value: value[name] ?? '', onChange: (event) => onChange(name, event.target.value), style: inputStyle }
    let control
    if (options.options) {
      control = <select {...shared}>{options.options.map((option) => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}</select>
    } else if (options.multiline) {
      control = <textarea {...shared} rows={3} />
    } else {
      control = <input {...shared} type={options.type ?? 'text'} min={options.min} step={options.step} />
    }
    return <label key={name} htmlFor={`${type}-${name}`} style={{ display: 'grid', gap: 5 }}>{label}{control}</label>
  }

  const fields = {
    vehicle: [
      field('plate', 'License plate', { required: true }),
      field('carrier_name', 'Carrier', { required: true }),
      field('direction', 'Direction', { options: ['Inbound', 'Outbound'] }),
      field('load_type', 'Load type', { required: true }),
      field('pallet_count', 'Pallet count', { type: 'number', min: 0 }),
      field('appointment_time', 'Appointment time', { type: 'datetime-local' }),
      field('status', 'Vehicle status', { options: VEHICLE_STATUSES }),
    ],
    shipment: [
      field('reference_number', 'Shipment reference', { required: true }),
      field('vehicle_id', 'Vehicle', { options: [{ value: '', label: 'Unassigned' }, ...activeVehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plate} · ${vehicle.carrier_name}` }))] }),
      field('adr_catalog_id', 'ADR catalog entry', { options: [{ value: '', label: 'Non-ADR / not specified' }, ...data.adrCatalog.map((entry) => ({ value: entry.id, label: `${entry.un_number} · ${entry.product_name || entry.proper_shipping_name} (Class ${entry.hazard_class})` }))] }),
      field('cargo_type', 'Cargo type', { required: true }),
      field('description', 'Cargo description', { multiline: true }),
      field('weight_kg', 'Weight (kg)', { type: 'number', min: 0.01, step: 'any' }),
      field('quantity', 'Quantity', { type: 'number', min: 1 }),
      field('origin', 'Origin'),
      field('destination', 'Destination'),
      field('status', 'Shipment status', { options: SHIPMENT_STATUSES }),
    ],
    queue: [
      field('vehicle_id', 'Vehicle', { required: true, options: activeVehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plate} · ${vehicle.carrier_name}` })) }),
      field('position', 'Queue position', { required: true, type: 'number', min: 1 }),
      field('priority', 'Priority', { options: ['Standard', 'Priority', 'Delayed', 'Documentation check'] }),
      field('arrival_time', 'Arrival time', { required: true, type: 'datetime-local' }),
      field('estimated_call_time', 'Estimated call time', { type: 'datetime-local' }),
      field('status', 'Queue status', { options: QUEUE_STATUSES }),
    ],
    operation: [
      field('vehicle_id', 'Vehicle', { required: true, options: activeVehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plate} · ${vehicle.carrier_name}` })) }),
      field('shipment_id', 'Shipment', { options: [{ value: '', label: 'No shipment linked' }, ...data.shipments.map((shipment) => ({ value: shipment.id, label: `${shipment.reference_number} · ${shipment.cargo_type}` }))] }),
      field('dock_id', 'Dock assignment', { options: [{ value: '', label: 'Unassigned' }, ...availableDocks.map((dock) => ({ value: dock.id, label: `${dock.dock_code} · ${dock.name}` }))] }),
      field('operation_type', 'Operation', { options: OPERATION_TYPES }),
      field('status', 'Operation status', { options: OPERATION_STATUSES }),
      field('actual_start_time', 'Actual start time', { type: 'datetime-local' }),
      field('actual_end_time', 'Actual end time', { type: 'datetime-local' }),
      field('progress', 'Progress (%)', { type: 'number', min: 0, step: 1 }),
      field('notes', 'Notes', { multiline: true }),
    ],
    dock: [
      field('status', 'Dock status', { options: ['available', 'called', 'loading', 'unloading', 'cleaning', 'maintenance', 'delayed'] }),
      field('state', 'Display state', { options: ['Available', 'Called', 'Loading', 'Unloading', 'Cleaning', 'Maintenance', 'Delayed'] }),
      field('direction', 'Direction', { options: ['All', 'Inbound', 'Outbound'] }),
      field('progress', 'Progress (%)', { type: 'number', min: 0, step: 1 }),
      field('notes', 'Notes', { multiline: true }),
    ],
  }[type]
  const selectedAdr = type === 'shipment' && data.adrCatalog.find((entry) => entry.id === value.adr_catalog_id)

  return <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 10, background: '#020617cc', display: 'grid', placeItems: 'center', padding: 18 }}>
    <form role="dialog" aria-modal="true" aria-labelledby="record-form-title" onSubmit={(event) => { event.preventDefault(); onSubmit() }} style={{ background: '#111827', color: '#f8fafc', padding: 24, borderRadius: 10, width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto', display: 'grid', gap: 16 }}>
      <h2 id="record-form-title">{value.id ? 'Edit' : 'Add'} {type === 'operation' ? 'dock assignment / operation' : type}</h2>
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{fields}</div>
      {type === 'shipment' && data.adrCatalog.length > 0 && <aside style={{ border: '1px solid #b45309', borderRadius: 6, padding: 12, color: '#fde68a' }}>
        <strong>{data.adrCatalog.length} ADR cargo entries are unverified user-provided drafts. Verify every classification against official ADR Table A before shipping.</strong>
      </aside>}
      {type === 'shipment' && (selectedAdr ? <aside style={{ border: '1px solid #475569', borderRadius: 6, padding: 12, color: '#cbd5e1' }}>
        <strong>{selectedAdr.product_name || selectedAdr.proper_shipping_name} · {selectedAdr.un_number} · Class {selectedAdr.hazard_class}{selectedAdr.packing_group ? ` · PG ${selectedAdr.packing_group}` : ''}</strong>
        <p style={{ margin: '6px 0', color: '#fcd34d' }}>UNVERIFIED DRAFT — validate against official ADR Table A before shipment.</p>
        <p style={{ margin: '6px 0' }}>{selectedAdr.regulatory_description || 'No additional regulatory details were provided.'}</p>
        <small>Source: {selectedAdr.source} · {selectedAdr.reference_version}</small>
      </aside> : data.adrCatalog.length === 0 && <p style={{ color: '#94a3b8', margin: 0 }}>The ADR catalog is empty until an authorized source file is imported.</p>)}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={buttonStyle} type="button" onClick={onClose}>Cancel</button>
        <button style={buttonStyle} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button>
      </div>
    </form>
  </div>
}

export function ManualOperationsApp() {
  const [user, setUser] = useState(null)
  const [data, setData] = useState(EMPTY_DATA)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [query, setQuery] = useState('')
  const [formType, setFormType] = useState('')
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [legacyDataAvailable, setLegacyDataAvailable] = useState(false)
  const [notice, setNotice] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [warehouses, docks, vehicles, queue, shipments, operations, adrCatalog] = await Promise.all([
        operationsApi.getWarehouses(),
        operationsApi.getDocks(),
        operationsApi.getVehicles({ includeInactive: true }),
        operationsApi.getQueue(),
        operationsApi.getShipments(),
        operationsApi.getOperations(),
        operationsApi.getAdrCatalog(),
      ])
      setData({ warehouses, docks, vehicles, queue, shipments, operations, adrCatalog })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Operational records could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    const restoreSession = async () => {
      try {
        const token = operationsApi.token
        if (token) {
          const currentUser = await operationsApi.getMe()
          if (mounted) setUser(currentUser)
        }
      } catch (sessionError) {
        operationsApi.setToken('')
        if (mounted) setError(sessionError instanceof Error ? sessionError.message : 'The saved session could not be restored.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    restoreSession()
    try {
      setLegacyDataAvailable(Boolean(localStorage.getItem(LEGACY_DATA_KEY)))
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : 'Legacy browser data could not be checked.')
    }
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user])

  const metrics = useMemo(() => {
    const activeShipments = data.shipments.filter((shipment) => !['COMPLETED', 'CANCELLED'].includes(shipment.status)).length
    const activeDocks = data.docks.filter((dock) => dock.is_active)
    const occupiedDockIds = new Set([
      ...activeDocks.filter((dock) => dock.status !== 'available').map((dock) => dock.id),
      ...data.operations
        .filter((operation) => operation.dock_id && ['PENDING', 'IN_PROGRESS'].includes(operation.status))
        .map((operation) => operation.dock_id),
    ])
    const occupiedDocks = activeDocks.filter((dock) => occupiedDockIds.has(dock.id)).length
    const availableDocks = Math.max(0, activeDocks.length - occupiedDocks)
    const completed = data.operations.filter((operation) => operation.status === 'COMPLETED' && operation.actual_start_time && operation.actual_end_time)
    const loadingOperations = completed.filter((operation) => operation.operation_type === 'LOADING')
    const durations = loadingOperations.map((operation) => (new Date(operation.actual_end_time) - new Date(operation.actual_start_time)) / 60000).filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    const utilization = activeDocks.length ? Math.round((occupiedDocks / activeDocks.length) * 100) : null
    const completedOperations = data.operations.filter((operation) => operation.status === 'COMPLETED').length
    return {
      vehicles: data.vehicles.length,
      activeShipments,
      availableDocks,
      occupiedDocks,
      utilization: Number.isFinite(utilization) ? utilization : null,
      averageLoadingMinutes: durations.length ? Math.round(durations.reduce((total, minutes) => total + minutes, 0) / durations.length) : null,
      delayedShipments: data.shipments.filter((shipment) => shipment.status === 'DELAYED').length,
      operationCompletion: data.operations.length ? Math.round((completedOperations / data.operations.length) * 100) : null,
    }
  }, [data])

  const beginForm = (type, record = null) => {
    const defaults = blankForms[type]
    const initial = record ? { ...defaults, ...record } : { ...defaults }
    if (type === 'operation' && record) {
      initial.actual_start_time = asLocalDateTime(record.actual_start_time)
      initial.actual_end_time = asLocalDateTime(record.actual_end_time)
    }
    if (type === 'queue' && record) {
      initial.arrival_time = asLocalDateTime(record.arrival_time)
      initial.estimated_call_time = asLocalDateTime(record.estimated_call_time)
    }
    if (type === 'vehicle' && record) initial.appointment_time = asLocalDateTime(record.appointment_time)
    setFormType(type)
    setForm(initial)
    setFormError('')
  }

  const updateForm = (name, value) => setForm((current) => {
    if (name === 'adr_catalog_id') {
      const selectedAdr = data.adrCatalog.find((entry) => entry.id === value)
      return { ...current, adr_catalog_id: value, ...(selectedAdr ? { cargo_type: (selectedAdr.product_name || selectedAdr.proper_shipping_name).slice(0, 100) } : {}) }
    }
    return { ...current, [name]: value }
  })

  const saveForm = async () => {
    setSaving(true)
    setFormError('')
    try {
      let payload
      if (formType === 'vehicle') payload = {
        plate: form.plate.trim(), carrier_name: form.carrier_name.trim(), direction: form.direction,
        load_type: form.load_type.trim(), pallet_count: Number(form.pallet_count),
        appointment_time: form.appointment_time || null, status: form.status,
      }
      if (formType === 'shipment') payload = {
        ...form, reference_number: form.reference_number.trim(), cargo_type: form.cargo_type.trim(),
        adr_catalog_id: form.adr_catalog_id || null,
        vehicle_id: form.vehicle_id || null, weight_kg: form.weight_kg === '' ? null : Number(form.weight_kg),
        quantity: form.quantity === '' ? null : Number(form.quantity),
      }
      if (formType === 'queue') payload = {
        ...form, vehicle_id: form.vehicle_id, position: Number(form.position),
        arrival_time: toIsoDateTime(form.arrival_time), estimated_call_time: toIsoDateTime(form.estimated_call_time),
      }
      if (formType === 'operation') payload = {
        ...form, vehicle_id: form.vehicle_id || null, shipment_id: form.shipment_id || null,
        dock_id: form.dock_id || null, progress: Number(form.progress),
        actual_start_time: toIsoDateTime(form.actual_start_time), actual_end_time: toIsoDateTime(form.actual_end_time),
      }
      if (formType === 'dock') payload = {
        status: form.status, state: form.state, direction: form.direction, progress: Number(form.progress), notes: form.notes,
      }
      const editing = Boolean(form.id)
      if (formType === 'vehicle') editing ? await operationsApi.updateVehicle(form.id, payload) : await operationsApi.createVehicle(payload)
      if (formType === 'shipment') editing ? await operationsApi.updateShipment(form.id, payload) : await operationsApi.createShipment(payload)
      if (formType === 'queue') editing ? await operationsApi.updateQueueEntry(form.id, payload) : await operationsApi.addQueueEntry(payload)
      if (formType === 'operation') editing ? await operationsApi.updateOperation(form.id, payload) : await operationsApi.startOperation(payload)
      if (formType === 'dock') await operationsApi.updateDock(form.id, payload)
      setFormType('')
      await loadData()
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'The record could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const deleteRecord = async (type, record) => {
    const label = type === 'vehicle' ? record.plate : type === 'shipment' ? record.reference_number : type === 'queue' ? record.id : record.id
    if (!window.confirm(`Delete or deactivate ${label}? Referenced operational history will be retained.`)) return
    setError('')
    try {
      if (type === 'vehicle') await operationsApi.deleteVehicle(record.id)
      if (type === 'shipment') await operationsApi.deleteShipment(record.id)
      if (type === 'queue') await operationsApi.deleteQueueEntry(record.id)
      if (type === 'operation') await operationsApi.deleteOperation(record.id)
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The record could not be deleted.')
    }
  }

  const login = async (username, password) => {
    setSaving(true)
    setError('')
    try {
      const response = await operationsApi.login(username, password)
      setUser(response.user)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Authentication failed.')
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    operationsApi.setToken('')
    setData(EMPTY_DATA)
    setUser(null)
  }

  const addDemoVehicles = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await operationsApi.addDemoVehiclePresets()
      setNotice(`${result.created} DEMO vehicles added; ${result.existing} already existed.`)
      await loadData()
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : 'Demo vehicles could not be added.')
    } finally {
      setSaving(false)
    }
  }

  const exportLegacyData = () => {
    try {
      const content = localStorage.getItem(LEGACY_DATA_KEY)
      if (!content) {
        setLegacyDataAvailable(false)
        return
      }
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'dockflow-legacy-datasets.json'
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Legacy datasets could not be exported.')
    }
  }

  if (loading && !user) return <main className="app" style={{ padding: 32 }}>Restoring session…</main>
  if (!user) return <Login onLogin={login} error={error} busy={saving} />

  const filteredVehicles = data.vehicles.filter((record) => visibleRecord(record, query, ['plate', 'carrier_name', 'status']))
  const filteredShipments = data.shipments.filter((record) => visibleRecord(record, query, ['reference_number', 'cargo_type', 'adr_un_number', 'adr_hazard_class', 'status', 'origin', 'destination']))
  const filteredQueue = data.queue.filter((record) => {
    const vehicle = data.vehicles.find((item) => item.id === record.vehicle_id)
    return visibleRecord({ ...record, plate: vehicle?.plate }, query, ['plate', 'priority', 'status'])
  })
  const filteredOperations = data.operations.filter((record) => {
    const vehicle = data.vehicles.find((item) => item.id === record.vehicle_id)
    const dock = data.docks.find((item) => item.id === record.dock_id)
    return visibleRecord({ ...record, plate: vehicle?.plate, dock_code: dock?.dock_code }, query, ['plate', 'dock_code', 'operation_type', 'status'])
  })
  const filteredDocks = data.docks.filter((record) => visibleRecord(record, query, ['dock_code', 'name', 'status', 'state']))
  const tabs = ['dashboard', 'vehicles', 'shipments', 'queue', 'operations', 'docks']
  const tabTitles = { dashboard: 'Overview', vehicles: 'Vehicles', shipments: 'Shipments & Cargo', queue: 'Arrival Queue', operations: 'Assignments & Operations', docks: 'Docks' }
  const hasActiveVehicles = data.vehicles.some((vehicle) => vehicle.is_active)
  const openAdd = {
    vehicles: 'vehicle',
    shipments: 'shipment',
    queue: hasActiveVehicles ? 'queue' : null,
    operations: hasActiveVehicles ? 'operation' : null,
  }[activeTab]
  const rows = activeTab === 'vehicles' ? filteredVehicles : activeTab === 'shipments' ? filteredShipments : activeTab === 'queue' ? filteredQueue : activeTab === 'operations' ? filteredOperations : []

  return <main className="app" style={{ minHeight: '100vh', padding: '18px clamp(16px, 3vw, 42px)', color: '#f8fafc' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid #334155' }}>
      <div><div style={{ fontSize: 24, fontWeight: 800 }}>DockFlow Operations</div><div style={{ color: '#94a3b8' }}>{user.full_name} · {user.role}</div></div>
      <div style={{ display: 'flex', gap: 10 }}><button style={buttonStyle} type="button" onClick={loadData} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh records'}</button><button style={buttonStyle} type="button" onClick={logout}>Sign out</button></div>
    </header>
    {error && <div role="alert" style={{ margin: '14px 0', padding: 12, border: '1px solid #f87171', borderRadius: 8, color: '#fecaca' }}>{error}</div>}
    {notice && <div role="status" style={{ margin: '14px 0', padding: 12, border: '1px solid #34d399', borderRadius: 8, color: '#a7f3d0' }}>{notice}</div>}
    {legacyDataAvailable && <aside style={{ margin: '14px 0', padding: 12, border: '1px solid #64748b', borderRadius: 8, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>Legacy browser datasets are preserved and are not used as operational records.</span><button style={buttonStyle} onClick={exportLegacyData}>Export legacy datasets</button>
    </aside>}
    <nav aria-label="Operations sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0' }}>
      {tabs.map((tab) => <button key={tab} type="button" style={{ ...buttonStyle, background: activeTab === tab ? '#0369a1' : buttonStyle.background }} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => { setActiveTab(tab); setQuery('') }}>{tabTitles[tab]}</button>)}
    </nav>
    <section className="panel" style={{ padding: 18, minHeight: 420 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <div><h1 style={{ margin: 0 }}>{tabTitles[activeTab]}</h1><p style={{ color: '#94a3b8', marginBottom: 0 }}>Operational data is stored in the DockFlow database.{activeTab === 'shipments' ? ` ${data.adrCatalog.length} unverified ADR cargo catalog entries are available.` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activeTab === 'vehicles' && <button type="button" style={buttonStyle} onClick={addDemoVehicles} disabled={saving}>Add 5 DEMO vehicle presets</button>}
          {openAdd && <button type="button" style={buttonStyle} onClick={() => beginForm(openAdd)}>＋ Add {openAdd === 'operation' ? 'assignment / operation' : openAdd}</button>}
        </div>
      </div>
      {loading && <p role="status">Loading registered records…</p>}
      {!loading && activeTab === 'dashboard' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            ['Total vehicles', metrics.vehicles], ['Active shipments', metrics.activeShipments],
            ['Available docks', metrics.availableDocks], ['Occupied docks', metrics.occupiedDocks],
            ['Dock utilization', metrics.utilization === null ? '—' : `${metrics.utilization}%`],
            ['Average loading time', metrics.averageLoadingMinutes === null ? '—' : `${metrics.averageLoadingMinutes} min`],
            ['Operation completion', metrics.operationCompletion === null ? '—' : `${metrics.operationCompletion}%`],
            ['Delayed shipments', metrics.delayedShipments],
          ].map(([label, value]) => <article key={label} style={{ border: '1px solid #334155', borderRadius: 8, padding: 14 }}><div style={{ color: '#94a3b8' }}>{label}</div><strong style={{ display: 'block', marginTop: 8, fontSize: 24 }}>{value}</strong></article>)}
        </div>
        {!error && !data.vehicles.length && !data.shipments.length && !data.docks.length && <div style={{ textAlign: 'center', padding: '44px 16px' }}><h2>No operational records yet</h2><p style={{ color: '#94a3b8' }}>Add real vehicles and shipments to begin managing your warehouse.</p><div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}><button style={buttonStyle} onClick={() => beginForm('vehicle')}>Add Vehicle</button><button style={buttonStyle} onClick={() => beginForm('shipment')}>Create Shipment</button><a style={{ ...buttonStyle, textDecoration: 'none' }} href={import.meta.env.VITE_APPOINTMENT_APP_URL || 'http://localhost:5173/'} target="_blank" rel="noreferrer">Add Dock</a></div></div>}
        {!!data.vehicles.length && <button style={{ ...buttonStyle, marginTop: 16 }} onClick={() => { setActiveTab('operations'); beginForm('operation') }}>Assign Vehicle to Dock</button>}
        {data.warehouses.length === 0 && <p style={{ color: '#cbd5e1', marginTop: 20 }}>No warehouse references are registered. Create a warehouse in Appointment Scheduling to sync it here.</p>}
      </>}
      {!loading && activeTab === 'docks' && <>
        <label style={{ display: 'grid', gap: 6, maxWidth: 360, marginBottom: 12 }}>Search docks<input style={inputStyle} type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {!data.docks.length ? <div style={{ padding: 36, textAlign: 'center' }}><h2>No docks registered</h2><p style={{ color: '#94a3b8' }}>Dock definitions are managed in Appointment Scheduling and synchronized here.</p><a style={{ ...buttonStyle, textDecoration: 'none' }} href={import.meta.env.VITE_APPOINTMENT_APP_URL || 'http://localhost:5173/'} target="_blank" rel="noreferrer">Add Dock</a></div> : filteredDocks.length === 0 ? <p>No docks match this search.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{filteredDocks.map((dock) => {
          const assignment = data.operations.find((operation) => operation.dock_id === dock.id && ['PENDING', 'IN_PROGRESS'].includes(operation.status))
          const assignedVehicle = data.vehicles.find((vehicle) => vehicle.id === assignment?.vehicle_id)
          return <article key={dock.id} style={{ border: '1px solid #334155', borderRadius: 8, padding: 14 }}><h3>{dock.dock_code} · {dock.name}</h3><p>{dock.state} · {dock.status}</p><p>{assignment ? `Assigned to ${assignedVehicle?.plate ?? 'vehicle'}` : dock.is_active ? 'Available for assignment' : 'Inactive'}</p><button style={buttonStyle} onClick={() => beginForm('dock', dock)}>Update operational status</button></article>
        })}</div>}
      </>}
      {!loading && !error && !['dashboard', 'docks'].includes(activeTab) && <>
        <label style={{ display: 'grid', gap: 6, maxWidth: 360, marginBottom: 12 }}>Search records<input style={inputStyle} type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {rows.length === 0 ? <div style={{ padding: 36, textAlign: 'center' }}><h2>No {tabTitles[activeTab].toLowerCase()} found</h2><p style={{ color: '#94a3b8' }}>{['queue', 'operations'].includes(activeTab) && !hasActiveVehicles ? 'Register an active vehicle before adding this record.' : 'Add a record manually to get started.'}</p>{openAdd && <button style={buttonStyle} onClick={() => beginForm(openAdd)}>Add {openAdd}</button>}{['queue', 'operations'].includes(activeTab) && !hasActiveVehicles && <button style={buttonStyle} onClick={() => beginForm('vehicle')}>Add Vehicle</button>}</div> : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{(activeTab === 'vehicles' ? ['Plate', 'Carrier', 'Direction', 'Status', 'Actions'] : activeTab === 'shipments' ? ['Reference', 'Cargo', 'ADR', 'Vehicle', 'Status', 'Actions'] : activeTab === 'queue' ? ['Position', 'Vehicle', 'Arrival', 'Priority', 'Status', 'Actions'] : ['Operation', 'Vehicle', 'Dock', 'Times', 'Status', 'Actions']).map((name) => <th key={name} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #475569' }}>{name}</th>)}</tr></thead><tbody>
            {rows.map((record) => {
              const vehicle = data.vehicles.find((item) => item.id === record.vehicle_id)
              const dock = data.docks.find((item) => item.id === record.dock_id)
              const shipment = data.shipments.find((item) => item.id === record.shipment_id)
              const actions = <div style={{ display: 'flex', gap: 6 }}><button style={buttonStyle} onClick={() => beginForm(activeTab === 'vehicles' ? 'vehicle' : activeTab === 'shipments' ? 'shipment' : activeTab === 'queue' ? 'queue' : 'operation', record)}>Edit</button><button style={buttonStyle} onClick={() => deleteRecord(activeTab === 'vehicles' ? 'vehicle' : activeTab === 'shipments' ? 'shipment' : activeTab === 'queue' ? 'queue' : 'operation', record)}>Delete</button></div>
              const cells = activeTab === 'vehicles'
                ? [record.plate, record.carrier_name, record.direction, record.status, actions]
                : activeTab === 'shipments'
                  ? [record.reference_number, record.cargo_type, record.adr_un_number ? `${record.adr_un_number} · Class ${record.adr_hazard_class}` : '—', vehicle?.plate ?? 'Unassigned', record.status, actions]
                  : activeTab === 'queue'
                    ? [record.position, vehicle?.plate ?? 'Unknown vehicle', record.arrival_time, record.priority, record.status, actions]
                    : [`${record.operation_type}${shipment ? ` · ${shipment.reference_number}` : ''}`, vehicle?.plate ?? 'Unassigned', dock?.dock_code ?? 'Unassigned', `${record.actual_start_time ?? '—'} → ${record.actual_end_time ?? '—'}`, record.status, actions]
              return <tr key={record.id}>{cells.map((cell, index) => <td key={index} style={{ padding: 10, borderBottom: '1px solid #334155' }}>{cell}</td>)}</tr>
            })}
          </tbody></table>
        </div>}
      </>}
    </section>
    {formType && <RecordForm type={formType} value={form} data={data} onChange={updateForm} onClose={() => setFormType('')} onSubmit={saveForm} saving={saving} error={formError} />}
  </main>
}

const rootElement = document.getElementById('root')
if (rootElement) createRoot(rootElement).render(<ManualOperationsApp />)
