import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { DockDetailModal, DockGrid, NowCallingPanel, QueueTable } from '../src/components.jsx'
import DispatchConsole from '../src/dispatchConsole.jsx'
import CargoComplianceStudio from '../src/cargoComplianceStudio.jsx'
import { adaptDataset } from '../src/data/operationsData.js'

const operationsApiMock = vi.hoisted(() => ({
  token: '',
  setToken: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
  getWarehouses: vi.fn(),
  getDocks: vi.fn(),
  getVehicles: vi.fn(),
  getQueue: vi.fn(),
  getShipments: vi.fn(),
  getOperations: vi.fn(),
}))

vi.mock('../src/data/operationsApiClient', () => ({ operationsApi: operationsApiMock }))

import { ManualOperationsApp } from '../src/manualOperations.jsx'

const docks = [
  { id: 'D01', tone: 'available', state: 'Available', direction: 'Inbound', plate: '—', carrier: '', progress: 0, elapsedSeconds: 0 },
  { id: 'D02', tone: 'loading', state: 'Loading', direction: 'Outbound', plate: 'AB-123', carrier: 'North Freight', progress: 45, elapsedSeconds: 120 },
]

describe('DockFlow dashboard components', () => {
  beforeEach(() => {
    localStorage.clear()
    operationsApiMock.login.mockResolvedValue({
      user: { full_name: 'Manual Operator', role: 'OPERATOR' },
    })
    operationsApiMock.getWarehouses.mockResolvedValue([])
    operationsApiMock.getDocks.mockResolvedValue([])
    operationsApiMock.getVehicles.mockResolvedValue([])
    operationsApiMock.getQueue.mockResolvedValue([])
    operationsApiMock.getShipments.mockResolvedValue([])
    operationsApiMock.getOperations.mockResolvedValue([])
  })

  it('starts with an empty state and no fabricated KPI values', async () => {
    render(<ManualOperationsApp />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'operator@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'No operational records yet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Vehicle' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Shipment' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add Dock' })).toBeTruthy()
    expect(screen.getByText('Dock utilization').closest('article').querySelector('strong').textContent).toBe('—')
    expect(operationsApiMock.getVehicles).toHaveBeenCalledWith({ includeInactive: true })
  })

  it('renders the no-call state and current vehicle call details', () => {
    const { rerender } = render(<NowCallingPanel vehicle={null} />)

    expect(screen.getByRole('heading', { name: 'No vehicle is currently being called' })).toBeTruthy()

    rerender(<NowCallingPanel vehicle={{
      plate: 'AB-123',
      carrier: 'North Freight',
      load: 'Pallets',
      count: '12',
      dockId: 'D02',
      start: '09:30',
      note: 'Documents verified',
    }} />)

    expect(screen.getByRole('heading', { name: 'Now Calling' })).toBeTruthy()
    expect(screen.getByText('AB-123')).toBeTruthy()
    expect(screen.getByText('PROCEED TO DOCK')).toBeTruthy()
  })

  it('exposes dock filters and dispatches dock selection', () => {
    const onSelect = vi.fn()
    const setStatusFilter = vi.fn()
    const setDirectionFilter = vi.fn()
    render(
      <DockGrid
        docks={docks}
        statusFilter="All"
        setStatusFilter={setStatusFilter}
        directionFilter="All"
        setDirectionFilter={setDirectionFilter}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter docks by loading' }))
    expect(setStatusFilter).toHaveBeenCalledWith('Loading')

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by shipment direction' }), {
      target: { value: 'Outbound' },
    })
    expect(setDirectionFilter).toHaveBeenCalledWith('Outbound')

    fireEvent.click(screen.getByRole('button', { name: /Open details for Dock D02/ }))
    expect(onSelect).toHaveBeenCalledWith(docks[1])
  })

  it('reports selected queue vehicles without simulation controls', () => {
    const onSelectVehicle = vi.fn()
    render(
      <QueueTable
        queue={[{
          vehicleId: 'vehicle-1',
          queue: 1,
          plate: 'AB-123',
          carrier: 'North Freight',
          load: 'Pallets',
          arrival: '09:00',
          call: '09:10',
          priority: 'Priority',
          tone: 'priority',
          status: 'waiting',
        }]}
        selectedVehicleId=""
        onSelectVehicle={onSelectVehicle}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select AB-123 for dispatch' }))
    expect(onSelectVehicle).toHaveBeenCalledWith('vehicle-1')
  })

  it('closes dock details on Escape and restores focus', () => {
    const onClose = vi.fn()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const { unmount } = render(<DockDetailModal dock={docks[1]} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: 'Dock D02' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(document.activeElement).toBe(trigger)

    trigger.remove()
  })

  it('lets an operator select a queued vehicle and place it on hold', () => {
    const state = adaptDataset(demoDataset, new Date('2026-10-02T16:00:00Z'))
    const vehicle = state.queue.find((item) => item.priority !== 'Documentation check')
    const onAction = vi.fn(() => ({ conflicts: [] }))
    const onSelectVehicle = vi.fn()

    const view = render(
      <DispatchConsole
        state={state}
        onAction={onAction}
        selectedVehicleId=""
        onSelectVehicle={onSelectVehicle}
        dataset={demoDataset}
        onCargoSave={vi.fn()}
        onOpenCargo={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: new RegExp(vehicle.plate) }))
    expect(onSelectVehicle).toHaveBeenCalledWith(vehicle.vehicleId)
    view.rerender(
      <DispatchConsole
        state={state}
        onAction={onAction}
        selectedVehicleId={vehicle.vehicleId}
        onSelectVehicle={onSelectVehicle}
        dataset={demoDataset}
        onCargoSave={vi.fn()}
        onOpenCargo={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Put on hold' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'hold',
      vehicleId: vehicle.vehicleId,
    })
  })

  it('leaves the Cargo catalog empty and allows manual record entry', async () => {
    const onSave = vi.fn()
    function Harness() {
      const [dataset, setDataset] = React.useState({ ...demoDataset, cargoCompliance: undefined })
      return <CargoComplianceStudio dataset={dataset} onSave={(nextDataset) => {
        onSave(nextDataset)
        setDataset(nextDataset)
      }} />
    }

    render(<Harness />)

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('No Cargo yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add Cargo' }))
    expect(screen.getByRole('dialog', { name: 'Add Cargo' })).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })
})
