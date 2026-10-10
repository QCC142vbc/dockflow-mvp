import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeCapacity,
  projectCapacityScenario,
} from '../src/data/capacityAnalysis.ts'

function makeDock(id, overrides = {}) {
  return {
    dockId: id,
    state: 'Available',
    status: 'available',
    vehicleId: null,
    plate: '',
    carrier: '',
    direction: 'All',
    progress: 0,
    elapsedSeconds: 0,
    appointmentTime: '',
    notes: '',
    ...overrides,
  }
}

function makeDataset(overrides = {}) {
  return {
    docks: [
      makeDock('D01'),
      makeDock('D02'),
      makeDock('D03'),
      makeDock('D04'),
    ],
    vehicles: [],
    queue: [],
    alerts: [],
    kpis: {
      averageWaitMinutes: 0,
      delayedShipments: 0,
      throughputEstimate: 8,
      averageProcessingMinutes: 30,
      queueLength: 0,
    },
    simulationConfig: {
      averageServiceMinutes: 30,
      averageArrivalIntervalMinutes: 10,
      utilizationTarget: 100,
    },
    ...overrides,
  }
}

test('analyzeCapacity returns valid empty metrics for a missing dataset', () => {
  const result = analyzeCapacity(undefined)

  assert.equal(result.metrics.totalDockCapacity, 0)
  assert.equal(result.metrics.availableDockCapacity, 0)
  assert.equal(result.metrics.usedDockCapacity, 0)
  assert.equal(result.metrics.capacityUtilizationPercent, null)
  assert.equal(result.metrics.averageDockUtilizationPercent, null)
  assert.equal(result.metrics.throughputPerHour, null)
  assert.equal(result.metrics.arrivalRatePerHour, null)
  assert.deepEqual(result.metrics.dockMetrics, [])
  assert.deepEqual(result.bottlenecks, [])
})

test('analyzeCapacity calculates capacity and utilization separately', () => {
  const dataset = makeDataset({
    docks: [
      makeDock('D01', {
        state: 'Loading',
        status: 'loading',
        vehicleId: 'V01',
        progress: 40,
      }),
      makeDock('D02'),
      makeDock('D03'),
      makeDock('D04'),
    ],
  })

  const { metrics } = analyzeCapacity(dataset)

  assert.equal(metrics.totalDockCapacity, 4)
  assert.equal(metrics.availableDockCapacity, 4)
  assert.equal(metrics.usedDockCapacity, 1)
  assert.equal(metrics.capacityUtilizationPercent, 25)
  assert.equal(metrics.averageDockUtilizationPercent, 10)
  assert.equal(metrics.peakDockUtilizationPercent, 40)
})

test('maintenance and cleaning docks are excluded from available capacity', () => {
  const dataset = makeDataset({
    docks: [
      makeDock('D01', {
        state: 'Maintenance',
        status: 'maintenance',
      }),
      makeDock('D02', {
        state: 'Cleaning',
        status: 'cleaning',
      }),
      makeDock('D03'),
    ],
  })

  const { metrics } = analyzeCapacity(dataset)

  assert.equal(metrics.totalDockCapacity, 3)
  assert.equal(metrics.availableDockCapacity, 1)
  assert.equal(metrics.capacitySurplusDocks, 1)
  assert.equal(metrics.capacityUtilizationPercent, 0)
  assert.equal(metrics.dockMetrics[0].utilizationPercent, null)
  assert.equal(metrics.dockMetrics[1].utilizationPercent, null)
})

test('queue wait estimation handles a wait crossing midnight', () => {
  const dataset = makeDataset({
    docks: [],
    kpis: {},
    queue: [
      {
        arrivalTime: '23:50',
        estimatedCallTime: '00:20',
        priority: 'Normal',
      },
      {
        arrivalTime: 'invalid',
        estimatedCallTime: '00:30',
        priority: 'Normal',
      },
    ],
  })

  const { metrics } = analyzeCapacity(dataset)

  assert.equal(metrics.queueLength, 2)
  assert.equal(metrics.averageWaitingMinutes, 30)
})

test('analyzeCapacity detects queue congestion when free capacity is insufficient', () => {
  const dataset = makeDataset({
    docks: [
      makeDock('D01', {
        state: 'Loading',
        status: 'loading',
        vehicleId: 'V01',
      }),
      makeDock('D02', {
        state: 'Loading',
        status: 'loading',
        vehicleId: 'V02',
      }),
    ],
    queue: [
      { arrivalTime: '10:00', estimatedCallTime: '10:15', priority: 'Normal' },
      { arrivalTime: '10:01', estimatedCallTime: '10:16', priority: 'Normal' },
      { arrivalTime: '10:02', estimatedCallTime: '10:17', priority: 'Normal' },
    ],
    kpis: {
      averageWaitMinutes: 15,
      throughputEstimate: 4,
      averageProcessingMinutes: 30,
      queueLength: 3,
      delayedShipments: 0,
    },
  })

  const result = analyzeCapacity(dataset)

  assert.ok(
    result.bottlenecks.some((item) => item.id === 'queue-congestion'),
  )
  assert.equal(result.metrics.capacitySurplusDocks, 0)
  assert.equal(result.metrics.queueLength, 3)
})

test('projectCapacityScenario adds dock capacity without changing the input dataset', () => {
  const dataset = makeDataset()
  const originalDockCount = dataset.docks.length

  const result = projectCapacityScenario(dataset, 'add-1-dock')

  assert.equal(result.totalDockCapacity, 5)
  assert.equal(result.availableDockCapacity, 5)
  assert.equal(result.throughputPerHour, 10)
  assert.equal(result.arrivalRatePerHour, 6)
  assert.equal(result.throughputBalancePerHour, 4)
  assert.equal(result.queuePressure, 'lower')
  assert.equal(dataset.docks.length, originalDockCount)
})

test('projectCapacityScenario preserves unavailable docks when adding capacity', () => {
  const dataset = makeDataset({
    docks: [
      makeDock('D01'),
      makeDock('D02'),
      makeDock('D03', {
        state: 'Maintenance',
        status: 'maintenance',
      }),
    ],
  })

  const result = projectCapacityScenario(dataset, 'add-1-dock')

  assert.equal(result.totalDockCapacity, 4)
  assert.equal(result.availableDockCapacity, 3)
})

test('projectCapacityScenario never returns negative capacity when removing docks', () => {
  const result = projectCapacityScenario(
    makeDataset({ docks: [makeDock('D01')] }),
    'remove-2-docks',
  )

  assert.equal(result.totalDockCapacity, 0)
  assert.equal(result.availableDockCapacity, 0)
  assert.ok(result.totalDockCapacity >= 0)
  assert.ok(result.availableDockCapacity >= 0)
})

test('projectCapacityScenario increases estimated throughput when processing time is reduced', () => {
  const result = projectCapacityScenario(
    makeDataset(),
    'reduce-processing-10',
  )

  assert.equal(result.throughputPerHour, 8.9)
  assert.equal(result.arrivalRatePerHour, 6)
  assert.ok(result.throughputBalancePerHour > 2)
})

test('projectCapacityScenario increases arrival rate in arrival-growth scenarios', () => {
  const dataset = makeDataset()

  const plus10 = projectCapacityScenario(dataset, 'increase-arrivals-10')
  const plus20 = projectCapacityScenario(dataset, 'increase-arrivals-20')

  assert.equal(plus10.arrivalRatePerHour, 6.6)
  assert.equal(plus20.arrivalRatePerHour, 7.2)
  assert.ok(plus20.arrivalRatePerHour > plus10.arrivalRatePerHour)
})
