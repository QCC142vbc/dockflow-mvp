export const scenario = {
  name: 'busy-day',
  label: 'High-volume / congested day',
  queueDelayMinutes: 12,
  extraAlerts: [{ id: 'alert-congestion', severity: 'warning', dockId: '07', code: 'QUEUE_CONGESTION', description: 'Queue density above planned threshold', action: 'Prioritize next outbound call' }],
  dockOverrides: {},
}
