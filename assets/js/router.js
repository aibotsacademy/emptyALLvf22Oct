/* =========================================================
   AERO — Page registry + relative-path routing helpers
   Every page declares <body data-page="..." data-root="." | "..">.
   Links are built relative to that root so nested platform/ and
   portal/ pages resolve correctly under any static server or sub-path.
   ========================================================= */

export const ROOT = (document.body && document.body.dataset.root) || '.';
export const PAGE = (document.body && document.body.dataset.page) || 'home';

/** Sidebar groups for the authenticated prototype. icon = key into ICONS (layout.js). */
export const NAV = [
  {
    group: 'Operate', items: [
      { id: 'dashboard', label: 'Command Center', href: 'platform/dashboard.html', icon: 'grid' },
      { id: 'fleet', label: 'Fleet', href: 'platform/fleet.html', icon: 'plane' },
      { id: 'operations', label: 'Operations', href: 'platform/operations.html', icon: 'calendar' },
      { id: 'crew', label: 'Crew', href: 'platform/crew.html', icon: 'users' },
      { id: 'maintenance', label: 'Maintenance', href: 'platform/maintenance.html', icon: 'wrench' },
    ],
  },
  {
    group: 'Revenue', items: [
      { id: 'empty-legs', label: 'Empty-Leg Engine', href: 'platform/empty-legs.html', icon: 'route' },
      { id: 'charter-crm', label: 'Charter CRM', href: 'platform/charter-crm.html', icon: 'kanban' },
      { id: 'marketplace', label: 'Marketplace', href: 'platform/marketplace.html', icon: 'store' },
      { id: 'finance', label: 'Finance', href: 'platform/finance.html', icon: 'coin' },
    ],
  },
  {
    group: 'Intelligence', items: [
      { id: 'ai-copilot', label: 'AI Copilot', href: 'platform/ai-copilot.html', icon: 'spark' },
      { id: 'analytics', label: 'Analytics', href: 'platform/analytics.html', icon: 'chart' },
    ],
  },
  {
    group: 'Portals', items: [
      { id: 'owner-portal', label: 'Owner Portal', href: 'platform/owner-portal.html', icon: 'key' },
      { id: 'passenger', label: 'Passenger Portal', href: 'portal/passenger.html', icon: 'seat' },
      { id: 'aeroflow', label: 'AeroFlow (public)', href: 'aeroflow.html', icon: 'route' },
      { id: 'settings', label: 'Settings', href: 'platform/settings.html', icon: 'gear' },
    ],
  },
];

/** Pages that are reachable but not listed in the sidebar (detail views). parent = active sidebar item. */
export const HIDDEN = {
  'aircraft-detail': { label: 'Aircraft Profile', href: 'platform/aircraft-detail.html', parent: 'fleet' },
};

export const ALL_PAGES = NAV.flatMap((g) => g.items).concat(Object.entries(HIDDEN).map(([id, v]) => ({ id, ...v })));

/** Resolve a root-relative path (e.g. "platform/fleet.html") from the current page. */
export function href(path) {
  if (!path) return '#';
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  return (ROOT === '.' ? '' : ROOT + '/') + path;
}

/** Resolve a link that may be bare ("fleet.html" — a platform page) or root-relative. */
export function link(target) {
  if (!target) return '#';
  if (target.includes('/')) return href(target);
  if (target === 'passenger.html') return href('portal/passenger.html');
  if (target === 'index.html') return href('index.html');
  return href('platform/' + target);
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

export function pageMeta(id = PAGE) {
  return ALL_PAGES.find((p) => p.id === id) || { id, label: 'AERO' };
}

/* ---------------------------------------------------------
   Integration adapter interface
   Stubs only. Each adapter documents the contract a real,
   authorized provider integration must implement server-side.
   No credentials are stored or invented; every call resolves
   with { connected:false } in this static prototype.
   --------------------------------------------------------- */
class IntegrationAdapter {
  constructor(id, category, description, contract) {
    this.id = id; this.category = category; this.description = description; this.contract = contract;
    this.connected = false;
  }
  async status() { return { id: this.id, connected: false, mode: 'stub', note: 'Not connected — requires authorized provider agreement and server-side credentials.' }; }
  async request(method) {
    return { ok: false, connected: false, method, error: 'Integration stub: no live provider is connected in this prototype.' };
  }
}

export const INTEGRATIONS = [
  new IntegrationAdapter('scheduling', 'Aircraft scheduling', 'Import trips, aircraft and crew assignments from an authorized scheduling system.', ['listTrips(range)', 'upsertTrip(trip)', 'listAircraft()', 'listCrewAssignments(range)']),
  new IntegrationAdapter('tracking', 'Flight tracking', 'Receive authorized position / OOOI events for operator aircraft.', ['subscribe(tails)', 'latestPosition(tail)', 'events(tripId)']),
  new IntegrationAdapter('maintenance', 'Maintenance tracking', 'Read due lists and status from the operator’s maintenance tracking program of record.', ['dueList(tail)', 'documents(tail)', 'deferrals(tail)']),
  new IntegrationAdapter('payments', 'Payments', 'Hosted, PCI-compliant payment processing. No card data ever touches this app.', ['createPaymentLink(invoice)', 'paymentStatus(id)']),
  new IntegrationAdapter('crm', 'CRM', 'Sync customers, leads and activity with the operator’s CRM.', ['upsertContact(c)', 'upsertDeal(d)', 'logActivity(a)']),
  new IntegrationAdapter('fuel', 'Fuel & FBO', 'Request fuel releases and ground handling through authorized FBO channels.', ['requestService(station, items)', 'serviceStatus(id)']),
];
