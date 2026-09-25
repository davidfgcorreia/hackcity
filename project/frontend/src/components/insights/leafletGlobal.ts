/** leaflet.heat is a classic plugin that extends the global `L`; expose it before the plugin module evaluates. */
import L from 'leaflet'

;(globalThis as unknown as { L: typeof L }).L = L
