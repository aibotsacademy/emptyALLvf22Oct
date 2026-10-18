/* =========================================================
   AERO — Synthetic demo data + local demo store + domain engine
   ---------------------------------------------------------
   EVERYTHING in this file is synthetic. Tail numbers, owners, customers,
   crew, prices and trips are generated for demonstration only.
   Nothing here represents live availability, aircraft positions,
   airworthiness, crew legality or completed transactions.
   Persisted to localStorage under STORE_KEY (no passwords, no payment data,
   no real flight information).
   ========================================================= */

export const STORE_KEY = 'aero-demo-v1';
export const DEMO_NOTICE = 'Demo mode — synthetic data. Not live availability, tracking or transactions.';
const DAY = 86400000;
const HOUR = 3600000;

/* ---------- deterministic PRNG so the seed is stable ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function at(dayOffset, hour = 0, min = 0) {
  const d = startOfToday();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

/* ---------- reference data ---------- */
export const AIRPORTS = [
  { code: 'TEB', city: 'New York', name: 'Teterboro', country: 'US', region: 'americas', lat: 40.85, lon: -74.06 },
  { code: 'BED', city: 'Boston', name: 'Hanscom Field', country: 'US', region: 'americas', lat: 42.47, lon: -71.29 },
  { code: 'IAD', city: 'Washington DC', name: 'Dulles', country: 'US', region: 'americas', lat: 38.95, lon: -77.46 },
  { code: 'PBI', city: 'West Palm Beach', name: 'Palm Beach Intl', country: 'US', region: 'americas', lat: 26.68, lon: -80.10 },
  { code: 'OPF', city: 'Miami', name: 'Miami-Opa Locka Exec', country: 'US', region: 'americas', lat: 25.91, lon: -80.28 },
  { code: 'PWK', city: 'Chicago', name: 'Chicago Executive', country: 'US', region: 'americas', lat: 42.11, lon: -87.90 },
  { code: 'DAL', city: 'Dallas', name: 'Dallas Love Field', country: 'US', region: 'americas', lat: 32.85, lon: -96.85 },
  { code: 'HOU', city: 'Houston', name: 'William P. Hobby', country: 'US', region: 'americas', lat: 29.65, lon: -95.28 },
  { code: 'APA', city: 'Denver', name: 'Centennial', country: 'US', region: 'americas', lat: 39.57, lon: -104.85 },
  { code: 'ASE', city: 'Aspen', name: 'Aspen/Pitkin County', country: 'US', region: 'americas', lat: 39.22, lon: -106.87 },
  { code: 'EGE', city: 'Vail', name: 'Eagle County Regional', country: 'US', region: 'americas', lat: 39.64, lon: -106.92 },
  { code: 'SDL', city: 'Scottsdale', name: 'Scottsdale', country: 'US', region: 'americas', lat: 33.62, lon: -111.91 },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid Intl', country: 'US', region: 'americas', lat: 36.08, lon: -115.15 },
  { code: 'VNY', city: 'Los Angeles', name: 'Van Nuys', country: 'US', region: 'americas', lat: 34.21, lon: -118.49 },
  { code: 'SJC', city: 'San Jose', name: 'Mineta San José', country: 'US', region: 'americas', lat: 37.36, lon: -121.93 },
  { code: 'NAS', city: 'Nassau', name: 'Lynden Pindling Intl', country: 'BS', region: 'americas', lat: 25.04, lon: -77.47 },
  { code: 'CUN', city: 'Cancún', name: 'Cancún Intl', country: 'MX', region: 'americas', lat: 21.04, lon: -86.87 },
  { code: 'SJO', city: 'San José', name: 'Juan Santamaría', country: 'CR', region: 'americas', lat: 9.99, lon: -84.21 },
  { code: 'LIR', city: 'Guanacaste', name: 'Daniel Oduber Quirós', country: 'CR', region: 'americas', lat: 10.59, lon: -85.54 },
  { code: 'FAB', city: 'London', name: 'Farnborough', country: 'GB', region: 'europe', lat: 51.28, lon: -0.78 },
  { code: 'LBG', city: 'Paris', name: 'Le Bourget', country: 'FR', region: 'europe', lat: 48.97, lon: 2.44 },
  { code: 'GVA', city: 'Geneva', name: 'Geneva', country: 'CH', region: 'europe', lat: 46.24, lon: 6.11 },
  { code: 'NCE', city: 'Nice', name: "Nice Côte d'Azur", country: 'FR', region: 'europe', lat: 43.66, lon: 7.22 },
  { code: 'IBZ', city: 'Ibiza', name: 'Ibiza', country: 'ES', region: 'europe', lat: 38.87, lon: 1.37 },
  { code: 'DWC', city: 'Dubai', name: 'Al Maktoum (DWC)', country: 'AE', region: 'mideast', lat: 24.90, lon: 55.16 },
  { code: 'DOH', city: 'Doha', name: 'Hamad Intl', country: 'QA', region: 'mideast', lat: 25.27, lon: 51.61 },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong Intl', country: 'HK', region: 'asia', lat: 22.31, lon: 113.91 },
  { code: 'SIN', city: 'Singapore', name: 'Seletar', country: 'SG', region: 'asia', lat: 1.42, lon: 103.87 },
];

export const CLASSES = {
  light: { label: 'Light Jet', sub: '4–8 pax · Short haul', reserve: 950, crew: 2 },
  midsize: { label: 'Midsize', sub: '6–9 pax · Mid range', reserve: 1400, crew: 2 },
  heavy: { label: 'Heavy Jet', sub: '8–14 pax · Long haul', reserve: 2100, crew: 3 },
  ultra: { label: 'Ultra Long Range', sub: '10–17 pax · Global', reserve: 2800, crew: 4 },
  rotor: { label: 'Helicopter', sub: '5–8 pax · City & island hops', reserve: 1100, crew: 1 },
  vip: { label: 'VIP Airliner', sub: '14–19 pax · Executive airliner', reserve: 4200, crew: 5 },
  cargo: { label: 'Cargo', sub: 'Freight · up to 50,000 lb', reserve: 1800, crew: 2 },
};

/** Human label for what an aircraft carries (seats, or payload for freighters). */
export function capacity(a) { return a.cls === 'cargo' ? `${Math.round((a.payloadLb || 0) / 1000)}k lb payload` : `${a.pax} seats`; }
export const AIRCRAFT_TYPES = {
  airplane: { label: 'Airplane', classes: ['light', 'midsize', 'heavy', 'ultra'] },
  helicopter: { label: 'Helicopter', classes: ['rotor'] },
  cargo: { label: 'Cargo', classes: ['cargo'] },
  vip: { label: 'VIP Airliner', classes: ['vip'] },
};
export function typeOf(cls) { return Object.keys(AIRCRAFT_TYPES).find((k) => AIRCRAFT_TYPES[k].classes.includes(cls)) || 'airplane'; }

export const REGIONS = { americas: 'Americas', europe: 'Europe', mideast: 'Middle East', asia: 'Asia' };

const AIRCRAFT_SEED = [
  { id: 'a1', tail: 'N512AE', make: 'Embraer', model: 'Phenom 300E', cls: 'light', pax: 7, rangeNm: 2010, speedKts: 453, base: 'TEB', status: 'available', year: 2021, hourlyRate: 5200, ownerId: 'own1', burnGph: 160, totalTime: 1840, cycles: 1510, targetHours: 450 },
  { id: 'a2', tail: 'N618AE', make: 'Cessna', model: 'Citation CJ4 Gen2', cls: 'light', pax: 8, rangeNm: 2165, speedKts: 451, base: 'PBI', status: 'available', year: 2022, hourlyRate: 4900, ownerId: 'own2', burnGph: 170, totalTime: 1120, cycles: 980, targetHours: 450 },
  { id: 'a3', tail: 'N724AE', make: 'Pilatus', model: 'PC-24', cls: 'light', pax: 8, rangeNm: 2000, speedKts: 440, base: 'APA', status: 'maintenance', year: 2020, hourlyRate: 4600, ownerId: 'own3', burnGph: 150, totalTime: 2410, cycles: 2230, targetHours: 420 },
  { id: 'a4', tail: 'N350AE', make: 'Bombardier', model: 'Challenger 350', cls: 'midsize', pax: 9, rangeNm: 3200, speedKts: 470, base: 'TEB', status: 'available', year: 2019, hourlyRate: 7400, ownerId: 'own1', burnGph: 255, totalTime: 3260, cycles: 2050, targetHours: 500 },
  { id: 'a5', tail: 'N600AE', make: 'Embraer', model: 'Praetor 600', cls: 'midsize', pax: 9, rangeNm: 4018, speedKts: 466, base: 'OPF', status: 'available', year: 2022, hourlyRate: 7900, ownerId: 'own4', burnGph: 245, totalTime: 960, cycles: 640, targetHours: 500 },
  { id: 'a6', tail: 'N68LA', make: 'Cessna', model: 'Citation Latitude', cls: 'midsize', pax: 9, rangeNm: 2700, speedKts: 446, base: 'DAL', status: 'available', year: 2020, hourlyRate: 6300, ownerId: 'own2', burnGph: 230, totalTime: 2280, cycles: 1690, targetHours: 480 },
  { id: 'a7', tail: 'N450AE', make: 'Gulfstream', model: 'G450', cls: 'heavy', pax: 14, rangeNm: 4350, speedKts: 476, base: 'VNY', status: 'available', year: 2014, hourlyRate: 9800, ownerId: 'own3', burnGph: 430, totalTime: 6150, cycles: 3320, targetHours: 450 },
  { id: 'a8', tail: 'N901AE', make: 'Dassault', model: 'Falcon 900LX', cls: 'heavy', pax: 12, rangeNm: 4750, speedKts: 459, base: 'FAB', status: 'available', year: 2017, hourlyRate: 10400, ownerId: 'own4', burnGph: 330, totalTime: 4020, cycles: 2210, targetHours: 450 },
  { id: 'a9', tail: 'N650AE', make: 'Bombardier', model: 'Challenger 650', cls: 'heavy', pax: 12, rangeNm: 4000, speedKts: 470, base: 'HOU', status: 'aog', year: 2018, hourlyRate: 9200, ownerId: 'own1', burnGph: 370, totalTime: 3880, cycles: 2400, targetHours: 450 },
  { id: 'a10', tail: 'N65GA', make: 'Gulfstream', model: 'G650ER', cls: 'ultra', pax: 16, rangeNm: 7500, speedKts: 488, base: 'VNY', status: 'available', year: 2018, hourlyRate: 14500, ownerId: 'own4', burnGph: 480, totalTime: 3410, cycles: 1180, targetHours: 400 },
  { id: 'a11', tail: 'N65XR', make: 'Bombardier', model: 'Global 6500', cls: 'ultra', pax: 15, rangeNm: 6600, speedKts: 488, base: 'TEB', status: 'available', year: 2021, hourlyRate: 13800, ownerId: 'own2', burnGph: 460, totalTime: 1460, cycles: 520, targetHours: 400 },
  { id: 'a13', tail: 'N139AE', make: 'Leonardo', model: 'AW139', cls: 'rotor', pax: 8, rangeNm: 570, speedKts: 150, base: 'TEB', status: 'available', year: 2021, hourlyRate: 4800, ownerId: 'own2', burnGph: 150, totalTime: 1310, cycles: 2950, targetHours: 380 },
  { id: 'a14', tail: 'N145AE', make: 'Airbus', model: 'H145', cls: 'rotor', pax: 6, rangeNm: 350, speedKts: 130, base: 'OPF', status: 'available', year: 2023, hourlyRate: 3600, ownerId: 'own4', burnGph: 75, totalTime: 640, cycles: 1420, targetHours: 380 },
  { id: 'a15', tail: 'N319AE', make: 'Airbus', model: 'ACJ319neo', cls: 'vip', pax: 19, rangeNm: 6750, speedKts: 447, base: 'TEB', status: 'available', year: 2021, hourlyRate: 21500, ownerId: 'own3', burnGph: 720, totalTime: 2140, cycles: 690, targetHours: 350 },
  { id: 'a16', tail: 'N737AE', make: 'Boeing', model: 'BBJ 737', cls: 'vip', pax: 19, rangeNm: 6000, speedKts: 450, base: 'VNY', status: 'available', year: 2016, hourlyRate: 19800, ownerId: 'own4', burnGph: 800, totalTime: 5310, cycles: 1880, targetHours: 350 },
  { id: 'a17', tail: 'N408AE', make: 'Cessna', model: 'SkyCourier 408F', cls: 'cargo', pax: 0, payloadLb: 6000, rangeNm: 900, speedKts: 200, base: 'OPF', status: 'available', year: 2023, hourlyRate: 3900, ownerId: 'own1', burnGph: 100, totalTime: 820, cycles: 760, targetHours: 600 },
  { id: 'a18', tail: 'N838AE', make: 'Boeing', model: '737-800BCF', cls: 'cargo', pax: 0, payloadLb: 50000, rangeNm: 2000, speedKts: 450, base: 'DAL', status: 'available', year: 2012, hourlyRate: 14200, ownerId: 'own2', burnGph: 850, totalTime: 38400, cycles: 19100, targetHours: 900 },
  { id: 'a12', tail: 'N75GX', make: 'Bombardier', model: 'Global 7500', cls: 'ultra', pax: 17, rangeNm: 7700, speedKts: 488, base: 'DWC', status: 'available', year: 2022, hourlyRate: 16200, ownerId: 'own3', burnGph: 500, totalTime: 890, cycles: 290, targetHours: 400 },
];

const OWNERS = [
  { id: 'own1', name: 'Meridian Holdings LLC', contact: 'R. Castellano', aircraft: [] },
  { id: 'own2', name: 'Calloway Family Office', contact: 'E. Calloway', aircraft: [] },
  { id: 'own3', name: 'Northbridge Aviation Partners', contact: 'S. Okafor', aircraft: [] },
  { id: 'own4', name: 'Solace Capital Trust', contact: 'M. Lindqvist', aircraft: [] },
];

const CUSTOMERS = [
  { id: 'c1', name: 'Harrow & Finch Advisory', type: 'Corporate', contact: 'D. Harrow', tier: 'Gold', trips: 0 },
  { id: 'c2', name: 'J. Whitfield', type: 'Private', contact: 'J. Whitfield', tier: 'Platinum', trips: 0 },
  { id: 'c3', name: 'Altamira Media Group', type: 'Corporate', contact: 'P. Altamira', tier: 'Silver', trips: 0 },
  { id: 'c4', name: 'K. Navarro', type: 'Private', contact: 'K. Navarro', tier: 'Gold', trips: 0 },
  { id: 'c5', name: 'Bluecrest Sports Mgmt', type: 'Corporate', contact: 'T. Ruiz', tier: 'Gold', trips: 0 },
  { id: 'c6', name: 'Vance Expeditions', type: 'Broker', contact: 'L. Vance', tier: 'Silver', trips: 0 },
  { id: 'c7', name: 'A. Morgan', type: 'Private', contact: 'A. Morgan', tier: 'New', trips: 0 },
  { id: 'c8', name: 'Ostrander Biotech', type: 'Corporate', contact: 'H. Ostrander', tier: 'Silver', trips: 0 },
];

const BROKERS = [
  { id: 'b1', name: 'Skyline Charter Brokers', rate: 0.08 },
  { id: 'b2', name: 'Atlas Jet Partners', rate: 0.06 },
  { id: 'b3', name: 'Vance Expeditions', rate: 0.10 },
];

const CREW_SEED = [
  ['Daniel Reyes', 'Captain', 'TEB', ['Phenom 300E', 'Challenger 350'], 40, 120],
  ['Sarah Chen', 'First Officer', 'TEB', ['Phenom 300E', 'Challenger 350'], 210, 18],
  ['Marcus Bell', 'Captain', 'TEB', ['Global 6500'], 95, 160],
  ['Priya Natarajan', 'First Officer', 'TEB', ['Global 6500', 'Challenger 350'], 12, 250],
  ['Owen Gallagher', 'Captain', 'PBI', ['Citation CJ4 Gen2', 'Citation Latitude'], 300, 75],
  ['Lucía Fernández', 'First Officer', 'OPF', ['Praetor 600', 'Citation CJ4 Gen2'], 150, 9],
  ['Tom Adeyemi', 'Captain', 'OPF', ['Praetor 600'], 60, 200],
  ['Hannah Kowalski', 'Captain', 'DAL', ['Citation Latitude', 'Challenger 650'], 25, 140],
  ['Ethan Brooks', 'First Officer', 'HOU', ['Challenger 650', 'Citation Latitude'], -3, 90],
  ['Isabel Moreau', 'Captain', 'FAB', ['Falcon 900LX'], 180, 45],
  ['James Whitaker', 'First Officer', 'FAB', ['Falcon 900LX'], 75, 300],
  ['Grace Liu', 'Captain', 'VNY', ['G450', 'G650ER'], 130, 60],
  ['Noah Patel', 'First Officer', 'VNY', ['G450', 'G650ER'], 28, 110],
  ['Ava Sinclair', 'Flight Attendant', 'VNY', ['Cabin — Gulfstream'], 365, 22],
  ['Omar Haddad', 'Captain', 'DWC', ['Global 7500', 'Global 6500'], 220, 180],
  ['Lina Farouk', 'First Officer', 'DWC', ['Global 7500'], 55, 35],
  ['Chloe Martin', 'Flight Attendant', 'TEB', ['Cabin — Bombardier'], 140, 14],
  ['Ben Osei', 'Captain', 'APA', ['PC-24', 'Phenom 300E'], 85, 95],
  ['Mateo Silva', 'Captain', 'TEB', ['AW139', 'H145'], 160, 70],
  ['Elena Park', 'Captain', 'OPF', ['H145', 'AW139'], 240, 130],
  ['Victor Hale', 'Captain', 'TEB', ['ACJ319neo', 'BBJ 737'], 190, 150],
  ['Mei Tanaka', 'First Officer', 'VNY', ['BBJ 737', 'ACJ319neo'], 260, 80],
  ['Andre Costa', 'Captain', 'DAL', ['737-800BCF'], 120, 200],
  ['Rosa Jimenez', 'Captain', 'OPF', ['SkyCourier 408F'], 300, 60],
  ['Liam Byrne', 'First Officer', 'DAL', ['737-800BCF', 'SkyCourier 408F'], 210, 170],
];

/* ---------- geo + estimating helpers ---------- */
export function airport(code) { return AIRPORTS.find((a) => a.code === code); }

export function distanceNm(fromCode, toCode) {
  const a = airport(fromCode), b = airport(toCode);
  if (!a || !b) return 0;
  const R = 3440.065, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Block-time estimate: great-circle / cruise speed + 0.4h taxi/climb allowance. Planning estimate only. */
export function estHours(acft, from, to) {
  if (!acft) return 0;
  const d = distanceNm(from, to);
  return Math.round(((d * 1.05) / acft.speedKts + 0.4) * 10) / 10;
}

/* ---------- seed generation ---------- */
function buildSeed() {
  const rng = mulberry32(20261018);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const aircraft = AIRCRAFT_SEED.map((a) => ({ ...a }));
  const owners = OWNERS.map((o) => ({ ...o, aircraft: aircraft.filter((a) => a.ownerId === o.id).map((a) => a.id) }));
  const customers = CUSTOMERS.map((c) => ({ ...c }));

  const trips = [];
  let tripN = 4100;
  const now = Date.now();

  aircraft.forEach((ac) => {
    let loc = ac.base;
    const reachable = AIRPORTS.filter((ap) => ap.code !== ac.base);
    for (let day = -120; day <= 28; day++) {
      // keep scheduled-maintenance aircraft on the ground around today
      if (ac.status === 'maintenance' && day >= -3 && day <= 6) continue;
      if (ac.status === 'aog' && day >= -1 && day <= 4 && !(day === 2)) continue;
      const prob = ac.cls === 'ultra' || ac.cls === 'vip' ? 0.2 : ac.cls === 'heavy' ? 0.26 : ac.cls === 'rotor' ? 0.38 : ac.cls === 'cargo' ? 0.36 : 0.33;
      if (rng() > prob) continue;
      let dest;
      if (loc !== ac.base && rng() < 0.45) dest = ac.base;
      else {
        const here = airport(loc);
        const pool = reachable.filter((ap) => ap.code !== loc && distanceNm(loc, ap.code) <= ac.rangeNm * 0.85 && distanceNm(loc, ap.code) > (ac.cls === 'rotor' ? 30 : 150));
        const same = pool.filter((ap) => ap.region === here.region);
        const src = same.length && rng() < 0.82 ? same : pool;
        if (!src.length) continue;
        dest = pick(src).code;
      }
      const roll = rng();
      let type = roll < 0.6 ? 'charter' : roll < 0.84 ? 'owner' : 'reposition';
      if (ac.cls === 'cargo' && type === 'owner') type = 'charter';
      if (ac.status === 'aog' && day === 2) type = 'charter'; // intentional conflict for the demo
      const hour = 6 + Math.floor(rng() * 11);
      const depart = at(day, hour, rng() < 0.5 ? 0 : 30);
      const hours = estHours(ac, loc, dest);
      const arrive = new Date(new Date(depart).getTime() + hours * HOUR).toISOString();
      const customer = type === 'charter' ? pick(customers) : null;
      const brokerId = type === 'charter' && rng() < 0.35 ? pick(BROKERS).id : null;
      const pax = type === 'reposition' || ac.cls === 'cargo' ? 0 : 1 + Math.floor(rng() * Math.max(1, ac.pax - 2));
      trips.push({
        id: 'T' + tripN++, aircraftId: ac.id, from: loc, to: dest, depart, arrive, hours, pax, type,
        customerId: customer ? customer.id : null, ownerId: type === 'owner' ? ac.ownerId : null, brokerId,
        crew: [], status: 'scheduled', fbo: null, approval: 'approved', notes: '',
      });
      loc = dest;
    }
  });

  trips.sort((a, b) => new Date(a.depart) - new Date(b.depart));

  // status by time
  trips.forEach((t) => {
    const d = new Date(t.depart).getTime(), a = new Date(t.arrive).getTime();
    if (a < now) t.status = 'completed';
    else if (d <= now && a >= now) t.status = 'in-flight';
    else {
      const r = rng();
      t.status = r < 0.55 ? 'confirmed' : r < 0.8 ? 'scheduled' : 'pending';
      t.approval = t.status === 'pending' ? 'pending' : 'approved';
    }
  });

  // crew
  const crew = CREW_SEED.map(([name, role, base, ratings, medDays, recDays], i) => ({
    id: 'cr' + (i + 1), name, role, base, ratings,
    medicalExp: at(medDays, 0).slice(0, 10), recurrentExp: at(recDays, 0).slice(0, 10),
    passportExp: at(400 + i * 37, 0).slice(0, 10), status: 'active', manualDuty: [],
  }));

  // assign crew: pick qualified crew without overlap; one intentional double-booking for demo
  const busy = {}; // crewId -> [ [start,end] ]
  const overlaps = (id, s, e) => (busy[id] || []).some(([bs, be]) => s < be && e > bs);
  trips.forEach((t) => {
    const ac = aircraft.find((a) => a.id === t.aircraftId);
    const s = new Date(t.depart).getTime() - HOUR, e = new Date(t.arrive).getTime() + HOUR / 2;
    const qualified = crew.filter((c) => c.ratings.includes(ac.model));
    const caps = qualified.filter((c) => c.role === 'Captain' && !overlaps(c.id, s, e));
    const fos = qualified.filter((c) => c.role === 'First Officer' && !overlaps(c.id, s, e));
    const assigned = [];
    if (caps[0]) assigned.push(caps[0].id);
    if (fos[0]) assigned.push(fos[0].id);
    if (['heavy', 'ultra', 'vip'].includes(ac.cls) && t.type !== 'reposition') {
      const fa = crew.find((c) => c.role === 'Flight Attendant' && !overlaps(c.id, s, e));
      if (fa) assigned.push(fa.id);
    }
    assigned.forEach((id) => (busy[id] = busy[id] || []).push([s, e]));
    t.crew = assigned;
  });
  // intentional crew conflict on an upcoming trip pair (demo of conflict detection)
  const upcoming = trips.filter((t) => new Date(t.depart).getTime() > now && t.crew.length);
  if (upcoming.length > 3) {
    const [x, y] = [upcoming[1], upcoming.find((t, i) => i > 1 && t.aircraftId !== upcoming[1].aircraftId)];
    if (x && y) {
      y.depart = new Date(new Date(x.depart).getTime() + HOUR).toISOString();
      y.arrive = new Date(new Date(y.depart).getTime() + y.hours * HOUR).toISOString();
      if (!y.crew.includes(x.crew[0])) y.crew[0] = x.crew[0];
    }
  }

  // FBO / ground handling requests for upcoming trips
  const services = ['Fuel uplift', 'Catering', 'Ground transport', 'Hangar', 'Customs/CBP', 'De-icing standby', 'Lav/water service'];
  trips.filter((t) => new Date(t.depart).getTime() > now && t.type !== 'reposition').slice(0, 18).forEach((t, i) => {
    t.fbo = {
      station: t.to,
      handler: ['Signature Aviation', 'Jet Aviation', 'Atlantic Aviation', 'Million Air', 'Local handler'][i % 5] + ' (demo)',
      items: services.filter(() => rng() < 0.4).slice(0, 3).concat('Fuel uplift').filter((v, j, arr) => arr.indexOf(v) === j),
      status: ['requested', 'acknowledged', 'confirmed'][i % 3],
    };
  });

  // maintenance items
  const mxTemplates = [
    ['Phase inspection', 'inspection', true], ['ELT battery replacement', 'component', true],
    ['Pitot-static / transponder check (24-mo)', 'inspection', true], ['Engine borescope (per SB)', 'service bulletin', false],
    ['Fire extinguisher hydrostatic test', 'component', true], ['Cabin pressurization leak check', 'inspection', false],
    ['Landing gear servicing', 'inspection', false], ['Database / nav update', 'avionics', false],
  ];
  const maintenance = [];
  let mxN = 1;
  aircraft.forEach((ac, i) => {
    const count = 3 + (i % 3);
    for (let k = 0; k < count; k++) {
      const [item, type, grounding] = mxTemplates[(i + k * 3) % mxTemplates.length];
      const offset = grounding ? Math.round(40 + rng() * 110) : Math.round(-6 + rng() * 120);
      maintenance.push({
        id: 'MX' + String(mxN++).padStart(3, '0'), aircraftId: ac.id, item, type, grounding,
        dueDate: at(offset, 0).slice(0, 10), dueHours: Math.round(ac.totalTime + 20 + rng() * 180),
        ref: `MX-PRG-${ac.tail}-${String(k + 1).padStart(2, '0')} (synthetic reference)`,
        state: 'open', reviewedBy: null, reviewedAt: null,
      });
    }
  });
  maintenance.push({ id: 'MX' + String(mxN++).padStart(3, '0'), aircraftId: 'a9', item: 'Hydraulic pump #2 — unscheduled replacement', type: 'unscheduled', grounding: true, dueDate: at(-1, 0).slice(0, 10), dueHours: 3880, ref: 'MX-DEF-N650AE-07 (synthetic reference)', state: 'open', reviewedBy: null, reviewedAt: null });
  maintenance.push({ id: 'MX' + String(mxN++).padStart(3, '0'), aircraftId: 'a3', item: 'Scheduled phase inspection — in work', type: 'inspection', grounding: true, dueDate: at(-2, 0).slice(0, 10), dueHours: 2410, ref: 'MX-PRG-N724AE-PH4 (synthetic reference)', state: 'in-work', reviewedBy: null, reviewedAt: null });

  // documents
  const docTypes = [['Certificate of Registration', 1400], ['Airworthiness Certificate', null], ['Insurance Certificate', 160], ['Weight & Balance Report', null], ['MEL (operator copy)', 90], ['Noise Certificate', null]];
  const documents = [];
  aircraft.forEach((ac, i) => docTypes.forEach(([name, exp], k) => documents.push({
    id: `D${ac.id}-${k}`, aircraftId: ac.id, name, expires: exp ? at(exp - i * 11, 0).slice(0, 10) : null,
    file: null, note: 'Demo placeholder — no document file stored',
  })));

  const state = {
    meta: { version: 3, seededAt: new Date().toISOString(), anchorDay: startOfToday().toISOString() },
    aircraft, owners, customers, brokers: BROKERS.map((b) => ({ ...b })), trips, crew, maintenance, documents,
    emptyLegs: [], leads: [], invoices: [], tasks: [], notifications: [], audit: [], approvals: [],
    demandSignals: [], passenger: null, demoRequests: [], copilotLog: [],
    settings: {
      orgName: 'Demo Operator (synthetic)', orgType: 'Part 135 + Part 91 managed fleet', timezone: 'America/New_York',
      currency: 'USD', distanceUnit: 'nm', fuelUnit: 'gal', fuelPrice: 6.5, dutyLimitHours: 14, minRestHours: 10,
      notify: { mxDue: true, crewExpiry: true, emptyLegInquiry: true, ownerApproval: true, digest: false },
    },
  };

  // customer trip counts
  trips.forEach((t) => { if (t.customerId) { const c = customers.find((x) => x.id === t.customerId); if (c) c.trips++; } });

  // demand signals (synthetic search volume by city pair)
  state.demandSignals = [
    ['TEB', 'PBI', 44], ['PBI', 'TEB', 38], ['VNY', 'LAS', 52], ['LAS', 'VNY', 31], ['TEB', 'ASE', 18], ['VNY', 'ASE', 22],
    ['OPF', 'NAS', 27], ['OPF', 'TEB', 25], ['DAL', 'ASE', 15], ['HOU', 'CUN', 12], ['FAB', 'NCE', 33], ['FAB', 'GVA', 21],
    ['LBG', 'IBZ', 19], ['DWC', 'LBG', 14], ['FAB', 'TEB', 16], ['TEB', 'FAB', 11], ['OPF', 'VNY', 9], ['SJO', 'OPF', 8],
    ['LIR', 'TEB', 7], ['APA', 'EGE', 10], ['SDL', 'VNY', 13], ['BED', 'PBI', 17], ['PWK', 'APA', 6], ['IAD', 'PBI', 12],
  ].map(([from, to, searches30d]) => ({ from, to, searches30d }));

  // leads (CRM)
  const stages = ['new', 'qualifying', 'quoted', 'negotiating', 'won', 'lost'];
  const leadRoutes = [['TEB', 'PBI'], ['VNY', 'ASE'], ['FAB', 'NCE'], ['OPF', 'NAS'], ['DAL', 'SDL'], ['TEB', 'FAB'], ['LAS', 'SJC'], ['HOU', 'CUN'], ['BED', 'PBI'], ['DWC', 'GVA'], ['SJO', 'OPF'], ['IAD', 'TEB']];
  leadRoutes.forEach(([from, to], i) => {
    const c = customers[i % customers.length];
    const stage = stages[[0, 1, 2, 2, 3, 4, 0, 1, 2, 3, 5, 1][i]];
    const dep = at(3 + i * 2, 9);
    state.leads.push({
      id: 'L' + (201 + i), customerId: c.id, from, to, depart: dep, pax: 2 + (i % 6), stage,
      value: Math.round(estHours(aircraft[3], from, to) * 7400 / 100) * 100 || 18000,
      source: ['Website', 'Broker', 'Repeat client', 'Empty-leg inquiry', 'Referral'][i % 5],
      nextFollowUp: at(i % 4 === 0 ? -1 : i % 3, 10).slice(0, 10), owner: ['Dispatcher', 'Sales'][i % 2],
      quote: null,
      activity: [{ at: at(-(i % 5) - 1, 9 + i % 6), text: 'Lead created (synthetic)' }],
    });
  });

  // invoices + commissions from completed charter trips (last 75 days)
  let invN = 1001;
  trips.filter((t) => t.status === 'completed' && t.type === 'charter' && new Date(t.depart).getTime() > now - 75 * DAY).forEach((t, i) => {
    const ac = aircraft.find((a) => a.id === t.aircraftId);
    const amount = Math.round(t.hours * ac.hourlyRate);
    state.invoices.push({
      id: 'INV-' + invN++, tripId: t.id, customerId: t.customerId, amount,
      issued: new Date(new Date(t.arrive).getTime() + DAY).toISOString().slice(0, 10),
      status: i % 4 === 0 ? 'draft' : i % 4 === 1 ? 'sent' : 'paid', brokerId: t.brokerId,
    });
  });

  // tasks + alerts
  state.tasks = [
    { id: 'K1', text: 'Confirm catering for tomorrow’s first departure', due: at(0, 17).slice(0, 10), done: false, link: 'operations.html' },
    { id: 'K2', text: 'Review AOG status on N650AE with maintenance control', due: at(0, 12).slice(0, 10), done: false, link: 'maintenance.html' },
    { id: 'K3', text: 'Send owner statement drafts for review', due: at(2, 12).slice(0, 10), done: false, link: 'finance.html' },
    { id: 'K4', text: 'Follow up on overdue CRM reminders', due: at(0, 15).slice(0, 10), done: false, link: 'charter-crm.html' },
    { id: 'K5', text: 'Verify medical expiry for Ethan Brooks', due: at(1, 9).slice(0, 10), done: true, link: 'crew.html' },
  ];
  state.notifications = [
    { id: 'n1', at: at(0, 7, 12), title: 'AOG: N650AE', body: 'Unscheduled maintenance open — trips may need reassignment.', read: false, href: 'maintenance.html' },
    { id: 'n2', at: at(0, 6, 40), title: 'Empty-leg inquiry', body: 'New broker inquiry on a published empty leg.', read: false, href: 'empty-legs.html' },
    { id: 'n3', at: at(-1, 18, 5), title: 'Crew medical expired', body: 'One crew member has an expired medical on file (demo).', read: false, href: 'crew.html' },
    { id: 'n4', at: at(-1, 9, 30), title: 'Owner approval requested', body: 'Charter use of N65GA awaiting owner decision.', read: true, href: 'owner-portal.html' },
  ];
  state.approvals = [
    { id: 'AP1', ownerId: 'own4', aircraftId: 'a10', kind: 'Charter use of owner aircraft', detail: 'VNY → LAS round trip, 2 days out — 4 pax corporate client', status: 'pending', at: at(-1, 9) },
    { id: 'AP2', ownerId: 'own1', aircraftId: 'a4', kind: 'Publish empty leg', detail: 'Allow repositioning leg to be marketed at AI-recommended price', status: 'pending', at: at(0, 7) },
    { id: 'AP3', ownerId: 'own2', aircraftId: 'a11', kind: 'Interior refurbishment quote', detail: 'Seat re-upholstery estimate (synthetic) — review before scheduling downtime', status: 'pending', at: at(-3, 14) },
    { id: 'AP4', ownerId: 'own3', aircraftId: 'a7', kind: 'Charter use of owner aircraft', detail: 'VNY → SJC one way — repositioning back is an empty-leg candidate', status: 'approved', at: at(-6, 10) },
  ];

  state.passenger = {
    profile: { name: 'Alex Morgan (demo)', homeAirport: 'TEB', preferredClass: 'midsize', seats: 4, notes: '' },
    savedRoutes: [
      { from: 'FAB', to: 'TEB', label: 'London → New York' },
      { from: 'DWC', to: 'LBG', label: 'Dubai → Paris' },
      { from: 'OPF', to: 'VNY', label: 'Miami → Los Angeles' },
      { from: 'TEB', to: 'PBI', label: 'New York → Palm Beach' },
    ],
    requests: [],
  };

  state.audit = [{ id: 'au0', at: new Date().toISOString(), actor: 'System', role: 'system', action: 'Demo data seeded', detail: 'Synthetic dataset generated locally' }];

  // empty-leg engine first pass — publish a few so the marketplace has inventory
  state.emptyLegs = detectRepositioning(state);
  // Seed: legs inside 20 days are validated; most validated ones are published (marketplace/AeroFlow inventory),
  // every 4th is left validated-but-unpublished and a few stay unvalidated so the engine has work to show.
  state.emptyLegs.sort((a, b) => new Date(a.depart) - new Date(b.depart)).forEach((leg, i) => {
    if (new Date(leg.depart).getTime() < Date.now() + 45 * DAY) {
      const v = validateLeg(state, leg);
      leg.validation = v;
      if (v.overall === 'validated' && i % 4 !== 3) {
        leg.status = 'published';
        leg.listPrice = recommendPrice(state, leg).recommended;
        leg.publishedAt = new Date().toISOString();
      }
    }
  });
  const pub = state.emptyLegs.filter((l) => l.status === 'published');
  if (pub[0]) pub[0].inquiries.push({ id: 'Q1', broker: 'Skyline Charter Brokers', pax: 4, note: 'Client flexible ±2h, wants confirmation today', at: at(0, 6, 40), state: 'open' });
  if (pub[1]) pub[1].inquiries.push({ id: 'Q2', broker: 'Atlas Jet Partners', pax: 2, note: 'Pet on board, small dog', at: at(-1, 15, 20), state: 'open' });
  return state;
}

/* ---------- empty-leg engine (deterministic, explainable) ---------- */

/**
 * Finds repositioning candidates in FUTURE schedule:
 *  (1) explicit 'reposition' trips (aircraft flies empty)
 *  (2) implied return-to-base after a one-way trip with no later departure from that station within 72h
 */
export function detectRepositioning(state) {
  const now = Date.now();
  const existing = new Set((state.emptyLegs || []).map((l) => l.sourceKey));
  const out = [];
  const byAc = {};
  state.trips.filter((t) => t.status !== 'cancelled').forEach((t) => (byAc[t.aircraftId] = byAc[t.aircraftId] || []).push(t));
  Object.entries(byAc).forEach(([acId, list]) => {
    list.sort((a, b) => new Date(a.depart) - new Date(b.depart));
    const ac = state.aircraft.find((a) => a.id === acId);
    list.forEach((t, i) => {
      const dep = new Date(t.depart).getTime();
      if (dep < now + 2 * HOUR) return;
      if (t.type === 'reposition') {
        const key = 'trip:' + t.id;
        if (existing.has(key)) return;
        out.push(newLeg(ac, t.from, t.to, t.depart, key, `Scheduled repositioning trip ${t.id} (no revenue passengers)`, t.id));
      } else {
        const next = list[i + 1];
        const arr = new Date(t.arrive).getTime();
        const nextFromHere = next && next.from === t.to && new Date(next.depart).getTime() - arr < 72 * HOUR;
        if (!nextFromHere && t.to !== ac.base && (!next || next.from !== t.to)) {
          const key = `implied:${t.id}`;
          if (existing.has(key)) return;
          const departGuess = new Date(arr + 3 * HOUR).toISOString();
          out.push(newLeg(ac, t.to, next ? next.from : ac.base, departGuess, key, `Implied repositioning after one-way ${t.id}: aircraft must return to ${next ? next.from : 'base ' + ac.base}`, null));
        }
      }
    });
  });
  return out.filter((l) => l.from !== l.to);
}

let legSeq = 1;
function newLeg(ac, from, to, depart, sourceKey, reason, tripId) {
  return {
    id: 'EL' + String(legSeq++).padStart(3, '0') + Math.floor(Math.random() * 90 + 10), aircraftId: ac.id, from, to, depart, flexHours: 3,
    sourceKey, reason, tripId, status: 'candidate', validation: null, listPrice: null, publishedAt: null,
    inquiries: [], region: (airport(from) || {}).region || 'americas', cls: ac.cls,
  };
}

export function demandScore(state, leg) {
  let score = 0; const evidence = [];
  state.demandSignals.forEach((s) => {
    if (s.from === leg.from && s.to === leg.to) { score += s.searches30d * 1.4; evidence.push(`${s.searches30d} route searches ${s.from}→${s.to} (30d, synthetic)`); }
    else if (s.to === leg.to && airport(s.from)?.region === airport(leg.from)?.region) { score += s.searches30d * 0.35; evidence.push(`${s.searches30d} searches into ${s.to} from same region`); }
  });
  state.leads.forEach((l) => {
    if (['won', 'lost'].includes(l.stage)) return;
    if (l.from === leg.from && l.to === leg.to) { score += 22; evidence.push(`Open CRM lead ${l.id} on same route`); }
    else if (l.to === leg.to) { score += 6; evidence.push(`Open CRM lead ${l.id} into ${l.to}`); }
  });
  (state.passenger?.savedRoutes || []).forEach((r) => {
    if (r.from === leg.from && r.to === leg.to) { score += 15; evidence.push(`Passenger saved route ${r.from}→${r.to}`); }
  });
  return { score: Math.min(100, Math.round(score)), evidence: evidence.slice(0, 5) };
}

export function recommendPrice(state, leg) {
  const ac = state.aircraft.find((a) => a.id === leg.aircraftId);
  const hours = estHours(ac, leg.from, leg.to);
  const fuel = state.settings.fuelPrice;
  const retail = hours * ac.hourlyRate;
  const variable = hours * (ac.burnGph * fuel + CLASSES[ac.cls].reserve);
  const fees = 650 + (['ultra', 'heavy', 'vip', 'cargo'].includes(ac.cls) ? 900 : 300);
  const directCost = variable + fees;
  const leadDays = (new Date(leg.depart).getTime() - Date.now()) / DAY;
  const d = demandScore(state, leg);
  let discount = 0.45;
  const notes = ['Base empty-leg discount 45% off retail one-way'];
  if (leadDays < 2) { discount += 0.15; notes.push('< 48h to departure: +15% discount to clear inventory'); }
  else if (leadDays < 5) { discount += 0.05; notes.push('< 5 days to departure: +5% discount'); }
  if (d.score >= 70) { discount -= 0.15; notes.push(`High demand score ${d.score}: −15% discount`); }
  else if (d.score >= 35) { discount -= 0.05; notes.push(`Moderate demand score ${d.score}: −5% discount`); }
  discount = Math.max(0.15, Math.min(0.75, discount));
  const floor = directCost * 1.1;
  const raw = retail * (1 - discount);
  const recommended = Math.ceil(Math.max(floor, raw) / 50) * 50; // round up so it never dips below the floor
  return {
    hours, retail: Math.round(retail), directCost: Math.round(directCost), floor: Math.round(floor), discount, recommended, demand: d,
    assumptions: [
      `Block time ${hours} h = great-circle ${distanceNm(leg.from, leg.to)} nm ÷ ${ac.speedKts} kt × 1.05 + 0.4 h`,
      `Retail = ${hours} h × $${ac.hourlyRate.toLocaleString()}/h (synthetic rate card)`,
      `Direct cost = fuel ${ac.burnGph} gph × $${fuel}/gal + reserves $${CLASSES[ac.cls].reserve}/h + est. fees $${fees}`,
      'Price floor = direct cost + 10% (never price below cost)',
      ...notes,
    ],
  };
}

export function validateLeg(state, leg) {
  const ac = state.aircraft.find((a) => a.id === leg.aircraftId);
  const dep = new Date(leg.depart).getTime();
  const end = dep + estHours(ac, leg.from, leg.to) * HOUR;
  const checks = [];
  const acOk = !['maintenance', 'aog'].includes(ac.status);
  checks.push({ label: 'Aircraft status', ok: acOk, detail: acOk ? `${ac.tail} marked ${ac.status}` : `${ac.tail} is ${ac.status.toUpperCase()} — cannot offer` });
  const clash = state.trips.find((t) => t.aircraftId === ac.id && t.id !== leg.tripId && t.status !== 'cancelled' && new Date(t.depart).getTime() < end + HOUR && new Date(t.arrive).getTime() > dep - HOUR);
  checks.push({ label: 'Schedule window', ok: !clash, detail: clash ? `Overlaps trip ${clash.id}` : 'No overlapping trips ±1 h' });
  const mxBlock = state.maintenance.find((m) => m.aircraftId === ac.id && m.grounding && m.state !== 'closed' && new Date(m.dueDate).getTime() < end);
  checks.push({ label: 'Grounding maintenance items', ok: !mxBlock, detail: mxBlock ? `${mxBlock.item} due ${mxBlock.dueDate}` : 'None due before arrival (demo data)' });
  checks.push({ label: 'Crew duty & legality', ok: null, detail: 'Requires qualified human verification against approved duty/rest rules' });
  checks.push({ label: 'Airport / slot / permits', ok: null, detail: 'Requires dispatcher confirmation' });
  const hard = checks.filter((c) => c.ok === false);
  return { checks, overall: hard.length ? 'blocked' : 'validated', at: new Date().toISOString() };
}

/* ---------- conflicts (operations, dashboard, copilot) ---------- */
export function findConflicts(state) {
  const out = [];
  const now = Date.now();
  const future = state.trips.filter((t) => new Date(t.arrive).getTime() > now && !['cancelled', 'completed'].includes(t.status));
  future.forEach((t) => {
    const ac = state.aircraft.find((a) => a.id === t.aircraftId);
    if (['maintenance', 'aog'].includes(ac.status)) out.push({ kind: 'aircraft', tripId: t.id, text: `${t.id}: ${ac.tail} is ${ac.status.toUpperCase()} but scheduled ${t.from}→${t.to}` });
  });
  for (let i = 0; i < future.length; i++) {
    for (let j = i + 1; j < future.length; j++) {
      const a = future[i], b = future[j];
      const overlap = new Date(a.depart) < new Date(b.arrive) && new Date(b.depart) < new Date(a.arrive);
      if (!overlap) continue;
      if (a.aircraftId === b.aircraftId) out.push({ kind: 'aircraft', tripId: b.id, text: `${a.id} and ${b.id} overlap on the same aircraft` });
      const shared = a.crew.filter((c) => b.crew.includes(c));
      shared.forEach((cid) => {
        const c = state.crew.find((x) => x.id === cid);
        out.push({ kind: 'crew', tripId: b.id, crewId: cid, text: `${c ? c.name : cid} double-booked on ${a.id} and ${b.id}` });
      });
    }
  }
  return out;
}

/* ---------- store ---------- */
const DATE_KEYS = new Set(['depart', 'arrive', 'at', 'dueDate', 'medicalExp', 'recurrentExp', 'passportExp', 'expires', 'issued', 'nextFollowUp', 'due', 'publishedAt', 'reviewedAt', 'start', 'end']);

/** Shifts all known date fields so the demo stays anchored to "today" when re-opened days later. */
function reanchor(state) {
  const anchor = new Date(state.meta.anchorDay).getTime();
  const today = startOfToday().getTime();
  const delta = Math.round((today - anchor) / DAY) * DAY;
  if (!delta) return state;
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach((k) => {
      const v = o[k];
      if (DATE_KEYS.has(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const shifted = new Date(new Date(v).getTime() + delta).toISOString();
        o[k] = v.length === 10 ? shifted.slice(0, 10) : shifted;
      } else if (typeof v === 'object') walk(v);
    });
  };
  ['trips', 'crew', 'maintenance', 'documents', 'emptyLegs', 'leads', 'invoices', 'tasks', 'notifications', 'approvals', 'passenger'].forEach((k) => walk(state[k]));
  state.meta.anchorDay = new Date(today).toISOString();
  // refresh trip statuses after the shift
  const now = Date.now();
  state.trips.forEach((t) => {
    if (t.status === 'cancelled') return;
    const d = new Date(t.depart).getTime(), a = new Date(t.arrive).getTime();
    if (a < now) t.status = 'completed';
    else if (d <= now) t.status = 'in-flight';
    else if (t.status === 'completed' || t.status === 'in-flight') t.status = 'confirmed';
  });
  return state;
}

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } }

let state = null;
const listeners = new Set();

export const store = {
  load() {
    const raw = safeGet(STORE_KEY);
    if (raw) {
      try { state = reanchor(JSON.parse(raw)); } catch { state = null; }
    }
    if (!state || !state.meta || state.meta.version !== 3) state = buildSeed();
    this.save(false);
    return state;
  },
  get state() { return state || this.load(); },
  save(emit = true) {
    safeSet(STORE_KEY, JSON.stringify(state));
    if (emit) listeners.forEach((fn) => fn(state));
    if (emit) window.dispatchEvent(new CustomEvent('aero:change'));
  },
  reset() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    state = buildSeed();
    this.save();
  },
  list(key) { return this.state[key]; },
  find(key, id) { return this.state[key].find((x) => x.id === id); },
  update(key, id, patch, auditMsg) {
    const item = this.find(key, id);
    if (!item) return null;
    Object.assign(item, typeof patch === 'function' ? patch(item) : patch);
    if (auditMsg) this.audit(auditMsg, `${key}/${id}`);
    this.save();
    return item;
  },
  add(key, item, auditMsg) {
    this.state[key].unshift(item);
    if (auditMsg) this.audit(auditMsg, `${key}/${item.id}`);
    this.save();
    return item;
  },
  audit(action, detail = '') {
    const role = getRole();
    this.state.audit.unshift({ id: uid('au'), at: new Date().toISOString(), actor: role.person, role: role.id, action, detail });
    if (this.state.audit.length > 400) this.state.audit.length = 400;
  },
  notify(title, body, href) {
    this.state.notifications.unshift({ id: uid('n'), at: new Date().toISOString(), title, body, read: false, href });
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/* ---------- demo roles (no authentication — UI simulation only) ---------- */
export const ROLES = [
  { id: 'admin', label: 'Operator Admin', person: 'Demo Admin' },
  { id: 'dispatcher', label: 'Dispatcher', person: 'Demo Dispatcher' },
  { id: 'owner', label: 'Aircraft Owner', person: 'Demo Owner (Solace Capital Trust)' },
  { id: 'broker', label: 'Charter Broker', person: 'Demo Broker' },
  { id: 'crew', label: 'Flight Crew', person: 'Demo Crew Member' },
  { id: 'finance', label: 'Finance', person: 'Demo Finance' },
];
export function getRole() {
  const id = safeGet('aero-demo-role') || 'admin';
  return ROLES.find((r) => r.id === id) || ROLES[0];
}
export function setRole(id) { safeSet('aero-demo-role', id); }
export function can(action, roleId) {
  const r = roleId || getRole().id;
  const matrix = {
    approveTrip: ['admin', 'dispatcher'], publishLeg: ['admin', 'dispatcher'], editAircraft: ['admin', 'dispatcher'],
    ownerDecision: ['owner', 'admin'], reviewMx: ['admin', 'dispatcher'], finance: ['admin', 'finance'],
    crm: ['admin', 'dispatcher', 'broker', 'finance'],
  };
  return (matrix[action] || []).includes(r);
}

/* ---------- formatting ---------- */
const FX = { USD: 1, EUR: 0.92, GBP: 0.79, CRC: 512 }; // static demo FX — not market rates
const SYMBOL = { USD: '$', EUR: '€', GBP: '£', CRC: '₡' };

export const fmt = {
  money(v, opts = {}) {
    const cur = store.state.settings.currency || 'USD';
    const n = (v || 0) * (FX[cur] || 1);
    const compact = opts.compact && Math.abs(n) >= 10000;
    const s = compact
      ? (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1000) + 'K')
      : Math.round(n).toLocaleString('en-US');
    return (SYMBOL[cur] || '$') + s;
  },
  dist(nm) {
    return store.state.settings.distanceUnit === 'km' ? Math.round(nm * 1.852).toLocaleString() + ' km' : nm.toLocaleString() + ' nm';
  },
  fuel(gal) {
    return store.state.settings.fuelUnit === 'L' ? Math.round(gal * 3.785).toLocaleString() + ' L' : Math.round(gal).toLocaleString() + ' gal';
  },
  date(iso) { return iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; },
  dateLong(iso) { return iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'; },
  time(iso) { return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'; },
  dateTime(iso) { return iso ? `${fmt.date(iso)} · ${fmt.time(iso)}` : '—'; },
  pct(v, d = 0) { return (v * 100).toFixed(d) + '%'; },
  daysFromNow(iso) { return Math.round((new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).getTime() - Date.now()) / DAY); },
  hours(h) { return (Math.round(h * 10) / 10).toFixed(1) + ' h'; },
};

export function uid(prefix = 'id') { return prefix + Math.random().toString(36).slice(2, 8); }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const T = { DAY, HOUR, at, startOfToday };
