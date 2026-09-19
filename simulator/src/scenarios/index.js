import { scenario as normal } from './normal.js'
import { scenario as busyDay } from './busy-day.js'
import { scenario as disruption } from './disruption.js'
import { scenario as maintenance } from './maintenance.js'

export const scenarios = { normal, 'busy-day': busyDay, disruption, maintenance }
