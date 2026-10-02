import type {
  DockRecord,
  OperationsDataset,
  SimulationInputConfig,
  SimulationKpis,
  SimulationScenario,
} from './datasetTypes'

export type BottleneckType =
  | 'Dock Capacity'
  | 'Processing Time'
  | 'Arrival Rate'
  | 'Queue Congestion'
  | 'Reduced Capacity'
  | 'Disruption'
  | 'Maintenance'

export type BottleneckSeverity = 'high' | 'medium' | 'low'

export type CapacityDatasetInput = Partial<OperationsDataset> & {
  docks?: DockRecord[] | null
  vehicles?: OperationsDataset['vehicles'] | null
  queue?: OperationsDataset['queue'] | null
  alerts?: OperationsDataset['alerts'] | null
  kpis?: Partial<SimulationKpis> | null
  simulationConfig?: SimulationInputConfig
  scenario?: SimulationScenario
}

export interface DockCapacityMetric {
  dockId: string
  state: string
  utilizationPercent: number | null
  processingMinutes: number | null
  waitingMinutes: number | null
  operationCount: number
  delayCount: number
  unavailable: boolean
}

export interface CapacityMetrics {
  totalDockCapacity: number
  availableDockCapacity: number
  usedDockCapacity: number
  capacityUtilizationPercent: number | null
  averageDockUtilizationPercent: number | null
  peakDockUtilizationPercent: number | null
  averageProcessingMinutes: number | null
  averageWaitingMinutes: number | null
  queueLength: number
  throughputPerHour: number | null
  delayedOperations: number
  capacitySurplusDocks: number
  capacityDeficitDocks: number
  arrivalRatePerHour: number | null
  throughputBalancePerHour: number | null
  dockMetrics: DockCapacityMetric[]
}

export interface Bottleneck {
  id: string
  type: BottleneckType
  severity: BottleneckSeverity
  affectedArea: string
  currentMetric: string
  systemAverage: string
  peakValue: string
  estimatedImpact: string
  affectedOperations: number
  timePeriod: string
  evidence: string[]
  relatedMetrics: string[]
}

export interface CapacityAnalysis {
  metrics: CapacityMetrics
  bottlenecks: Bottleneck[]
  possibleContributingFactors: string[]
  timePeriod: string
  dataLimitations: string[]
}

export type WhatIfScenario =
  | 'add-1-dock'
  | 'add-2-docks'
  | 'remove-1-dock'
  | 'remove-2-docks'
  | 'reduce-processing-10'
  | 'increase-arrivals-10'
  | 'increase-arrivals-20'

export interface WhatIfProjection {
  scenario: WhatIfScenario
  label: string
  totalDockCapacity: number
  availableDockCapacity: number
  capacityUtilizationPercent: number | null
  throughputPerHour: number | null
  arrivalRatePerHour: number | null
  throughputBalancePerHour: number | null
  queuePressure: 'lower' | 'unchanged' | 'higher' | 'unavailable'
  assumptions: string[]
}

const emptyArray = <T>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : []
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const mean = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const rounded = (value: number | null, digits = 1): number | null =>
  value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits))
const percent = (value: number | null): string => value === null ? 'Unavailable' : `${rounded(value)}%`
const minutes = (value: number | null): string => value === null ? 'Unavailable' : `${rounded(value)} min`
const perHour = (value: number | null): string => value === null ? 'Unavailable' : `${rounded(value)} / hr`
const plural = (count: number, singular: string, multiple = `${singular}s`) => `${count} ${count === 1 ? singular : multiple}`
const unavailableState = (dock: DockRecord) =>
  dock.status === 'maintenance' || dock.status === 'cleaning' || dock.state === 'Maintenance' || dock.state === 'Cleaning'

function estimatedQueueWait(dataset: CapacityDatasetInput): number | null {
  const queue = emptyArray(dataset.queue)
  const waits = queue.flatMap((item) => {
    const parse = (value: string) => {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
      const [hours, mins] = value.split(':').map(Number)
      return hours * 60 + mins
    }
    const arrival = parse(item.arrivalTime)
    const call = parse(item.estimatedCallTime)
    if (arrival === null || call === null) return []
    return [(call - arrival + 1440) % 1440]
  })
  return rounded(mean(waits), 0)
}

function getTimePeriod(dataset: CapacityDatasetInput): string {
  const simulated = dataset.simulatedAt
  if (typeof simulated === 'string' && !Number.isNaN(Date.parse(simulated))) {
    return `Snapshot at ${new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Budapest',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(simulated))} (Europe/Budapest)`
  }
  return 'Current dataset snapshot; no valid simulation timestamp'
}

function quantile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function dockUtilization(dock: DockRecord, processingMinutes: number | null): number {
  if (unavailableState(dock) || !dock.vehicleId) return 0
  if (finite(dock.progress)) return Math.min(100, dock.progress)
  if (processingMinutes && finite(dock.elapsedSeconds)) {
    return Math.min(100, dock.elapsedSeconds / (processingMinutes * 60) * 100)
  }
  return 0
}

function addBottleneck(bottlenecks: Bottleneck[], entry: Bottleneck) {
  if (!bottlenecks.some((item) => item.id === entry.id)) bottlenecks.push(entry)
}

export function analyzeCapacity(dataset: CapacityDatasetInput | null | undefined): CapacityAnalysis {
  const source = dataset ?? {}
  const docks = emptyArray(source.docks)
  const queue = emptyArray(source.queue)
  const alerts = emptyArray(source.alerts)
  const kpis: Partial<SimulationKpis> = source.kpis ?? {}
  const config = source.simulationConfig
  const operationalDocks = docks.filter((dock) => !unavailableState(dock))
  const occupiedDocks = operationalDocks.filter((dock) => Boolean(dock.vehicleId) ||
    ['loading', 'unloading', 'delayed'].includes(dock.status))
  const processingMinutes = finite(kpis.averageProcessingMinutes)
    ? kpis.averageProcessingMinutes
    : finite(config?.averageServiceMinutes) ? config.averageServiceMinutes : null
  const dockMetrics: DockCapacityMetric[] = docks.map((dock) => {
    const unavailable = unavailableState(dock)
    return {
      dockId: dock.dockId,
      state: dock.state,
      utilizationPercent: unavailable ? null : dockUtilization(dock, processingMinutes),
      processingMinutes: unavailable ? null : processingMinutes,
      waitingMinutes: null,
      operationCount: dock.vehicleId ? 1 : 0,
      delayCount: dock.status === 'delayed' ? 1 : 0,
      unavailable,
    }
  })
  const dockUtilizations = dockMetrics.flatMap((dock) =>
    dock.utilizationPercent === null ? [] : [dock.utilizationPercent])
  const averageDockUtilization = mean(dockUtilizations)
  const peakDockUtilization = dockUtilizations.length ? Math.max(...dockUtilizations) : null
  const wait = finite(kpis.averageWaitMinutes) ? kpis.averageWaitMinutes : estimatedQueueWait(source)
  const throughput = finite(kpis.throughputEstimate)
    ? kpis.throughputEstimate
    : config && finite(config.averageServiceMinutes) && config.averageServiceMinutes > 0
      ? operationalDocks.length * 60 / config.averageServiceMinutes
      : null
  const arrivalRate = config && finite(config.averageArrivalIntervalMinutes) && config.averageArrivalIntervalMinutes > 0
    ? 60 / config.averageArrivalIntervalMinutes
    : null
  const delayedOperations = finite(kpis.delayedShipments)
    ? kpis.delayedShipments
    : queue.filter((item) => item.priority === 'Delayed').length +
      docks.filter((dock) => dock.status === 'delayed').length
  const capacityUtilization = operationalDocks.length
    ? occupiedDocks.length / operationalDocks.length * 100
    : null
  const surplusDocks = Math.max(0, operationalDocks.length - occupiedDocks.length)
  const deficitDocks = Math.max(0, queue.length - surplusDocks)
  const metrics: CapacityMetrics = {
    totalDockCapacity: docks.length,
    availableDockCapacity: operationalDocks.length,
    usedDockCapacity: occupiedDocks.length,
    capacityUtilizationPercent: rounded(capacityUtilization, 0),
    averageDockUtilizationPercent: rounded(averageDockUtilization),
    peakDockUtilizationPercent: rounded(peakDockUtilization),
    averageProcessingMinutes: rounded(processingMinutes),
    averageWaitingMinutes: rounded(wait),
    queueLength: finite(kpis.queueLength) ? kpis.queueLength : queue.length,
    throughputPerHour: rounded(throughput),
    delayedOperations,
    capacitySurplusDocks: surplusDocks,
    capacityDeficitDocks: deficitDocks,
    arrivalRatePerHour: rounded(arrivalRate),
    throughputBalancePerHour: throughput !== null && arrivalRate !== null
      ? rounded(throughput - arrivalRate)
      : null,
    dockMetrics,
  }
  const timePeriod = getTimePeriod(source)
  const bottlenecks: Bottleneck[] = []
  const firstQuartile = quantile(dockUtilizations, 0.25)
  const thirdQuartile = quantile(dockUtilizations, 0.75)
  const interquartileRange = firstQuartile !== null && thirdQuartile !== null
    ? thirdQuartile - firstQuartile
    : null
  const upperFence = thirdQuartile !== null && interquartileRange !== null
    ? thirdQuartile + 1.5 * interquartileRange
    : null

  if (docks.length && operationalDocks.length < docks.length) {
    const unavailable = docks.length - operationalDocks.length
    const maintenanceCount = docks.filter((dock) => dock.status === 'maintenance' || dock.state === 'Maintenance').length
    const reductionType: BottleneckType = maintenanceCount ? 'Maintenance' : 'Reduced Capacity'
    addBottleneck(bottlenecks, {
      id: 'capacity-unavailable-docks',
      type: reductionType,
      severity: operationalDocks.length === 0 ? 'high' : 'medium',
      affectedArea: 'Dock capacity',
      currentMetric: `${operationalDocks.length} of ${docks.length} docks available`,
      systemAverage: `${docks.length} configured docks`,
      peakValue: `${unavailable} unavailable`,
      estimatedImpact: `${plural(unavailable, 'dock')} removed from current operating capacity`,
      affectedOperations: queue.length,
      timePeriod,
      evidence: [`${unavailable} dock${unavailable === 1 ? ' is' : 's are'} marked unavailable in the dataset.`],
      relatedMetrics: [`Queue: ${plural(queue.length, 'operation')}`, `Used capacity: ${occupiedDocks.length} docks`],
    })
  }

  if (dockUtilizations.length >= 3 && upperFence !== null) {
    for (const dock of dockMetrics) {
      if (dock.utilizationPercent === null || dock.utilizationPercent <= 0 ||
          dock.utilizationPercent <= upperFence || averageDockUtilization === null ||
          dock.utilizationPercent <= averageDockUtilization) continue
      const delta = dock.utilizationPercent - averageDockUtilization
      addBottleneck(bottlenecks, {
        id: `dock-utilization-${dock.dockId}`,
        type: 'Dock Capacity',
        severity: interquartileRange !== null && delta >= interquartileRange ? 'high' : 'medium',
        affectedArea: `Dock ${dock.dockId}`,
        currentMetric: `${rounded(dock.utilizationPercent)}% snapshot utilization`,
        systemAverage: `${rounded(averageDockUtilization)}% across operational docks`,
        peakValue: `${rounded(dock.utilizationPercent)}% observed snapshot utilization`,
        estimatedImpact: `${rounded(delta)} percentage points above the hub average`,
        affectedOperations: dock.operationCount,
        timePeriod,
        evidence: [
          `Dock ${dock.dockId} is an upper-fence utilization outlier in the current dock distribution.`,
          `Its snapshot utilization is ${rounded(delta)} percentage points above the operational-dock average.`,
        ],
        relatedMetrics: [`State: ${dock.state}`, `Delay count: ${dock.delayCount}`, `Queue: ${plural(queue.length, 'operation')}`],
      })
    }
  }

  const queueLength = metrics.queueLength
  const isCapacityConstrained = queueLength > 0 && metrics.capacitySurplusDocks === 0 &&
    (metrics.capacityUtilizationPercent === 100 || operationalDocks.length === 0)
  if (isCapacityConstrained) {
    addBottleneck(bottlenecks, {
      id: 'hub-dock-capacity',
      type: 'Dock Capacity',
      severity: 'high',
      affectedArea: 'Hub dock capacity',
      currentMetric: `${percent(metrics.capacityUtilizationPercent)} utilized; ${plural(queueLength, 'operation')} queued`,
      systemAverage: percent(metrics.averageDockUtilizationPercent),
      peakValue: percent(metrics.peakDockUtilizationPercent),
      estimatedImpact: `${plural(queueLength, 'queued operation')} with no currently free operational dock`,
      affectedOperations: queueLength,
      timePeriod,
      evidence: [`All ${operationalDocks.length} operational docks are occupied or unavailable while work remains queued.`],
      relatedMetrics: [`Throughput: ${perHour(metrics.throughputPerHour)}`, `Average wait: ${minutes(metrics.averageWaitingMinutes)}`],
    })
  }

  if (queueLength > metrics.capacitySurplusDocks && queueLength > 0) {
    addBottleneck(bottlenecks, {
      id: 'queue-congestion',
      type: 'Queue Congestion',
      severity: queueLength > metrics.availableDockCapacity ? 'high' : 'medium',
      affectedArea: 'Vehicle queue',
      currentMetric: `${plural(queueLength, 'operation')} waiting`,
      systemAverage: `${plural(metrics.capacitySurplusDocks, 'currently free dock')}`,
      peakValue: `${plural(queueLength, 'queued operation')} in this snapshot`,
      estimatedImpact: `${Math.max(0, queueLength - metrics.capacitySurplusDocks)} operations exceed immediate free-dock capacity`,
      affectedOperations: queueLength,
      timePeriod,
      evidence: [`The queue has ${queueLength} operations and ${metrics.capacitySurplusDocks} currently free operational docks.`],
      relatedMetrics: [`Average wait: ${minutes(metrics.averageWaitingMinutes)}`, `Arrival rate: ${perHour(metrics.arrivalRatePerHour)}`],
    })
  }

  if (metrics.throughputBalancePerHour !== null && metrics.throughputBalancePerHour < 0 && queueLength > 0) {
    addBottleneck(bottlenecks, {
      id: 'arrival-throughput-imbalance',
      type: 'Arrival Rate',
      severity: queueLength > metrics.availableDockCapacity ? 'high' : 'medium',
      affectedArea: 'Inbound/outbound flow',
      currentMetric: `${perHour(metrics.arrivalRatePerHour)} arriving`,
      systemAverage: `${perHour(metrics.throughputPerHour)} estimated processing capacity`,
      peakValue: `${perHour(metrics.arrivalRatePerHour)} configured arrival rate`,
      estimatedImpact: `Demand exceeds estimated service capacity by ${perHour(Math.abs(metrics.throughputBalancePerHour))}`,
      affectedOperations: queueLength,
      timePeriod,
      evidence: [`Configured arrival rate exceeds the estimated throughput while the dataset contains queued work.`],
      relatedMetrics: [`Queue: ${plural(queueLength, 'operation')}`, `Average wait: ${minutes(metrics.averageWaitingMinutes)}`],
    })
  }

  if (metrics.averageWaitingMinutes !== null && metrics.averageProcessingMinutes !== null &&
      metrics.averageWaitingMinutes > metrics.averageProcessingMinutes && queueLength > 0) {
    addBottleneck(bottlenecks, {
      id: 'processing-time',
      type: 'Processing Time',
      severity: metrics.averageWaitingMinutes > metrics.averageProcessingMinutes * 2 ? 'high' : 'medium',
      affectedArea: 'Dock service cycle',
      currentMetric: minutes(metrics.averageProcessingMinutes),
      systemAverage: minutes(metrics.averageProcessingMinutes),
      peakValue: minutes(metrics.averageWaitingMinutes),
      estimatedImpact: `Average wait is ${rounded(metrics.averageWaitingMinutes - metrics.averageProcessingMinutes)} minutes longer than processing time`,
      affectedOperations: queueLength,
      timePeriod,
      evidence: [`Average queue wait (${minutes(metrics.averageWaitingMinutes)}) exceeds average processing time (${minutes(metrics.averageProcessingMinutes)}).`],
      relatedMetrics: [`Throughput: ${perHour(metrics.throughputPerHour)}`, `Queue: ${plural(queueLength, 'operation')}`],
    })
  }

  const scenario = source.scenario
  const delayedDocks = docks.filter((dock) => dock.status === 'delayed').length
  if (scenario === 'disruption' || delayedDocks > 0) {
    const affected = Math.max(delayedDocks, delayedOperations)
    addBottleneck(bottlenecks, {
      id: 'operational-disruption',
      type: 'Disruption',
      severity: delayedDocks > 0 || delayedOperations > 0 ? 'high' : 'medium',
      affectedArea: 'Dock operations',
      currentMetric: `${plural(affected, 'delayed operation')}`,
      systemAverage: `${plural(delayedOperations, 'delayed operation')} reported`,
      peakValue: `${plural(delayedDocks, 'dock')} currently delayed`,
      estimatedImpact: `${plural(affected, 'operation')} flagged as delayed`,
      affectedOperations: affected,
      timePeriod,
      evidence: [
        ...(scenario === 'disruption' ? ['The active dataset scenario is marked as disruption.'] : []),
        ...(delayedDocks ? [`${delayedDocks} dock${delayedDocks === 1 ? ' is' : 's are'} marked delayed.`] : []),
        ...(delayedOperations ? [`Dataset KPI reports ${delayedOperations} delayed operations.`] : []),
      ],
      relatedMetrics: [`Average wait: ${minutes(metrics.averageWaitingMinutes)}`, `Queue: ${plural(queueLength, 'operation')}`],
    })
  }

  const possibleContributingFactors: string[] = []
  if (metrics.averageWaitingMinutes !== null && metrics.arrivalRatePerHour !== null &&
      metrics.throughputPerHour !== null && metrics.arrivalRatePerHour > metrics.throughputPerHour &&
      metrics.averageWaitingMinutes > 0) {
    possibleContributingFactors.push(
      `Possible arrival/capacity imbalance: arrival rate (${perHour(metrics.arrivalRatePerHour)}) is above estimated throughput (${perHour(metrics.throughputPerHour)}) while average wait is ${minutes(metrics.averageWaitingMinutes)}.`,
    )
  }
  if (metrics.averageWaitingMinutes !== null && metrics.averageProcessingMinutes !== null &&
      metrics.arrivalRatePerHour !== null && metrics.throughputPerHour !== null &&
      metrics.averageWaitingMinutes > metrics.averageProcessingMinutes &&
      metrics.arrivalRatePerHour <= metrics.throughputPerHour) {
    possibleContributingFactors.push(
      `Possible processing bottleneck: average wait (${minutes(metrics.averageWaitingMinutes)}) exceeds service time (${minutes(metrics.averageProcessingMinutes)}) without a higher configured arrival rate than throughput.`,
    )
  }
  if (operationalDocks.length < docks.length && queueLength > 0) {
    possibleContributingFactors.push(
      `Possible reduced-capacity pressure: ${docks.length - operationalDocks.length} dock${docks.length - operationalDocks.length === 1 ? ' is' : 's are'} unavailable while operations are queued.`,
    )
  }
  if (scenario === 'disruption' && (delayedOperations > 0 || queueLength > 0)) {
    possibleContributingFactors.push('Possible disruption impact: this dataset is tagged as a disruption scenario and contains delayed or queued work.')
  }

  const dataLimitations: string[] = []
  if (docks.length && timePeriod.startsWith('Current dataset snapshot')) dataLimitations.push('No valid simulation timestamp is available; results describe the dataset snapshot only.')
  if (queue.length && !finite(kpis.averageWaitMinutes)) dataLimitations.push('Average wait is estimated from queue arrival/call clock times; overnight intervals use a 24-hour wrap.')
  if (docks.length) dataLimitations.push('Per-dock utilization is a current-operation snapshot based on progress, not historical utilization over time.')
  if (docks.length && processingMinutes !== null) dataLimitations.push('Per-dock processing time uses the dataset service-time estimate; individual completed-operation durations are not recorded.')
  if (queue.length && docks.length) dataLimitations.push('The dataset does not link queued vehicles to individual docks, so per-dock waiting time is unavailable.')
  if (wait === null) dataLimitations.push('Average waiting time is unavailable because neither a KPI nor usable queue timestamps are present.')
  if (processingMinutes === null) dataLimitations.push('Average processing time is unavailable because neither a KPI nor a simulation service-time setting is present.')
  if (throughput === null) dataLimitations.push('Throughput is unavailable because the dataset does not contain a throughput KPI or sufficient processing-time data.')
  if (!config || !finite(config.averageArrivalIntervalMinutes)) dataLimitations.push('Arrival interval is unavailable; arrival rate and volume-based what-if projections cannot be estimated.')
  const period = timePeriod

  return { metrics, bottlenecks, possibleContributingFactors, timePeriod: period, dataLimitations }
}

const WHAT_IF_LABELS: Record<WhatIfScenario, string> = {
  'add-1-dock': '+1 dock',
  'add-2-docks': '+2 docks',
  'remove-1-dock': '−1 dock',
  'remove-2-docks': '−2 docks',
  'reduce-processing-10': 'Reduce processing time by 10%',
  'increase-arrivals-10': 'Increase arrival volume by 10%',
  'increase-arrivals-20': 'Increase arrival volume by 20%',
}

export function projectCapacityScenario(
  dataset: CapacityDatasetInput | null | undefined,
  scenario: WhatIfScenario,
): WhatIfProjection {
  const analysis = analyzeCapacity(dataset)
  const metrics = analysis.metrics
  const config = dataset?.simulationConfig
  const addDocks = scenario === 'add-1-dock' ? 1 : scenario === 'add-2-docks' ? 2 : 0
  const removeDocks = scenario === 'remove-1-dock' ? 1 : scenario === 'remove-2-docks' ? 2 : 0
  const processingReduction = scenario === 'reduce-processing-10' ? 0.9 : 1
  const arrivalFactor = scenario === 'increase-arrivals-10' ? 1.1
    : scenario === 'increase-arrivals-20' ? 1.2 : 1
  const totalDockCapacity = Math.max(0, metrics.totalDockCapacity + addDocks - removeDocks)
  const currentlyUnavailable = Math.max(0, metrics.totalDockCapacity - metrics.availableDockCapacity)
  const availableDockCapacity = Math.max(0, totalDockCapacity - Math.min(currentlyUnavailable, totalDockCapacity))
  const targetFactor = config && finite(config.utilizationTarget) ? config.utilizationTarget / 100 : 1
  const serviceMinutes = config && finite(config.averageServiceMinutes) && config.averageServiceMinutes > 0
    ? config.averageServiceMinutes
    : metrics.averageProcessingMinutes
  const configuredThroughput = serviceMinutes !== null && serviceMinutes > 0
    ? availableDockCapacity * 60 / serviceMinutes * targetFactor
    : null
  const scaledDatasetThroughput = metrics.throughputPerHour !== null && metrics.availableDockCapacity > 0
    ? metrics.throughputPerHour * availableDockCapacity / metrics.availableDockCapacity
    : null
  const unadjustedThroughput = scaledDatasetThroughput ?? configuredThroughput
  const baselineThroughput = unadjustedThroughput === null
    ? null
    : scenario === 'reduce-processing-10' ? unadjustedThroughput / processingReduction : unadjustedThroughput
  const throughputPerHour = rounded(baselineThroughput)
  const arrivalRatePerHour = metrics.arrivalRatePerHour === null
    ? null
    : rounded(metrics.arrivalRatePerHour * arrivalFactor)
  let utilization: number | null = null
  if (arrivalRatePerHour !== null && throughputPerHour !== null && throughputPerHour > 0) {
    utilization = Math.min(100, arrivalRatePerHour / throughputPerHour * 100)
  } else if (metrics.capacityUtilizationPercent !== null) {
    const volumeFactor = scenario === 'increase-arrivals-10' || scenario === 'increase-arrivals-20'
      ? arrivalFactor
      : 1
    const serviceFactor = scenario === 'reduce-processing-10' ? 1 / processingReduction : 1
    const capacityFactor = metrics.availableDockCapacity > 0
      ? metrics.availableDockCapacity / Math.max(1, availableDockCapacity)
      : 1
    utilization = Math.min(100, metrics.capacityUtilizationPercent * volumeFactor * serviceFactor * capacityFactor)
  }
  const balance = throughputPerHour !== null && arrivalRatePerHour !== null
    ? rounded(throughputPerHour - arrivalRatePerHour)
    : null
  const currentBalance = metrics.throughputBalancePerHour
  const queuePressure: WhatIfProjection['queuePressure'] = balance === null || currentBalance === null
    ? 'unavailable'
    : balance > currentBalance ? 'lower' : balance < currentBalance ? 'higher' : 'unchanged'
  const assumptions = [
    'Projection uses the active dataset only; it does not modify or save the dataset.',
    'Dock changes scale the dataset throughput estimate; otherwise the service-time estimate and utilization target are used.',
    'Added or removed docks are treated as operational capacity changes; unrelated dock states remain unchanged.',
  ]
  if (arrivalRatePerHour === null) assumptions.push('Arrival rate is unavailable in this dataset, so the throughput balance cannot be projected.')
  if (scenario === 'reduce-processing-10' && unadjustedThroughput === null) assumptions.push('Throughput and processing-time data are unavailable, so the service-time reduction cannot be projected.')
  if ((scenario === 'increase-arrivals-10' || scenario === 'increase-arrivals-20') && arrivalRatePerHour === null) assumptions.push('Projected utilization uses current occupied capacity as its baseline because an arrival-rate estimate is not available.')
  if (currentlyUnavailable > 0 && addDocks > 0) assumptions.push(`${plural(currentlyUnavailable, 'currently unavailable dock')} remain unavailable in the projection.`)
  if (!config && metrics.averageProcessingMinutes === null) assumptions.push('Processing-time data is missing; throughput is unavailable.')

  return {
    scenario,
    label: WHAT_IF_LABELS[scenario],
    totalDockCapacity,
    availableDockCapacity,
    capacityUtilizationPercent: rounded(utilization),
    throughputPerHour,
    arrivalRatePerHour,
    throughputBalancePerHour: balance,
    queuePressure,
    assumptions,
  }
}
