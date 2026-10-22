/* =====================================================================
   AERO · Integrations & Data Sources
   Self-contained ES module. Renders:
     1) the Integrations hub     → <body data-page="integrations"> #int-root
     2) a "Data sources" strip    → any [data-integrations-module="<module>"]
   State lives in localStorage key "aero-integrations-v1".
   Secrets are never persisted in clear text: only a masked tail is kept.
   ===================================================================== */

const KEY = 'aero-integrations-v1';
const ROOT = document.body?.dataset.root || '..';
const HUB = `${ROOT}/platform/integrations.html`;

/* ------------------------------------------------------------------ */
/* Modules                                                             */
/* ------------------------------------------------------------------ */
const MODULES = {
  dashboard: 'Command Center', fleet: 'Fleet', operations: 'Operations', crew: 'Crew',
  maintenance: 'Maintenance', 'empty-legs': 'Empty-Leg Engine', 'charter-crm': 'Charter CRM',
  marketplace: 'Marketplace', finance: 'Finance', 'ai-copilot': 'AI Copilot', analytics: 'Analytics',
  'owner-portal': 'Owner Portal', settings: 'Settings', 'aircraft-detail': 'Aircraft Profile',
};

/* ------------------------------------------------------------------ */
/* Categories: scopes (entities) + default field mapping               */
/* ------------------------------------------------------------------ */
const CATS = {
  tracking: {
    label: 'Flight tracking', scopes: ['Live positions', 'Flight status (OOOI)', 'Actual block times', 'Airport arrivals / departures', 'Flight alerts'],
    endpoint: 'GET /flights/{tail}', map: [
      ['ident', 'Tail number', 'Uppercase'], ['fa_flight_id', 'External flight ID', '—'], ['actual_off', 'Off-block (UTC)', 'ISO 8601'],
      ['actual_on', 'On-block (UTC)', 'ISO 8601'], ['last_position.latitude', 'Latitude', 'Decimal°'], ['last_position.longitude', 'Longitude', 'Decimal°'],
      ['origin.code_icao', 'Departure airport', 'ICAO → IATA'], ['destination.code_icao', 'Arrival airport', 'ICAO → IATA']],
  },
  scheduling: {
    label: 'Scheduling & dispatch', scopes: ['Trips & legs', 'Aircraft availability', 'Crew assignments', 'Passenger manifests', 'Quotes', 'Handling requests'],
    endpoint: 'GET /flights?from={today}', map: [
      ['flightNid', 'Trip ID', '—'], ['acft.registration', 'Tail number', 'Uppercase'], ['startAirport.code', 'Departure airport', 'ICAO → IATA'],
      ['endAirport.code', 'Arrival airport', 'ICAO → IATA'], ['startTimeUTC', 'Departure (UTC)', 'ISO 8601'], ['endTimeUTC', 'Arrival (UTC)', 'ISO 8601'],
      ['flightType', 'Trip type', 'Charter / Owner / Ferry'], ['crew[]', 'Crew assignment', 'Match by employee ID']],
  },
  maintenance: {
    label: 'Maintenance tracking (CAMO / MRO)', scopes: ['Due items & inspections', 'Aircraft times (hours / cycles / landings)', 'Discrepancies & MEL / deferrals', 'Component tracking', 'Work orders', 'Airworthiness directives & SBs', 'Records & documents'],
    endpoint: 'GET /aircraft/{serial}/due-list', map: [
      ['taskCode', 'Item reference', '—'], ['description', 'Description', 'Trim'], ['ataChapter', 'ATA chapter', '2-digit'],
      ['nextDue.date', 'Due date', 'ISO date'], ['nextDue.hours', 'Due airframe hours', 'Decimal h'], ['nextDue.cycles', 'Due cycles', 'Integer'],
      ['status', 'Status', 'Overdue / Due soon / OK'], ['groundingItem', 'Grounding indicator', 'Boolean']],
  },
  crew: {
    label: 'Crew, training & medicals', scopes: ['Crew roster', 'Qualifications & expirations', 'Duty & rest records', 'Training events', 'Medicals & passports (expiry only)'],
    endpoint: 'GET /crew?active=true', map: [
      ['employeeId', 'Crew ID', '—'], ['fullName', 'Name', '—'], ['position', 'Position', 'PIC / SIC / FA'],
      ['typeRatings[]', 'Type ratings', 'List'], ['medical.expires', 'Medical expiry', 'ISO date'], ['recurrent.expires', 'Recurrent training expiry', 'ISO date']],
  },
  weather: {
    label: 'Weather, NOTAMs & airport data', scopes: ['METAR / TAF', 'NOTAMs', 'SIGMET / AIRMET / PIREP', 'Airport & runway data', 'Forecast models'],
    endpoint: 'GET /metar?ids={icao}', map: [
      ['icaoId', 'Airport', 'ICAO'], ['rawOb', 'METAR (raw)', '—'], ['fltCat', 'Flight category', 'VFR / MVFR / IFR / LIFR'],
      ['visib', 'Visibility', 'SM'], ['wspd', 'Wind speed', 'kt'], ['obsTime', 'Observed (UTC)', 'Epoch → ISO']],
  },
  trip: {
    label: 'Fuel, FBO & trip support', scopes: ['Fuel prices by FBO', 'Fuel releases', 'Handling / FBO requests', 'Permits & slots', 'Vendor invoices'],
    endpoint: 'GET /fuel/prices?airport={icao}', map: [
      ['airport', 'Airport', 'ICAO'], ['fbo.name', 'FBO', '—'], ['product', 'Product', 'Jet A / Jet A-1 / SAF'],
      ['price', 'Price per unit', 'Currency → workspace'], ['uom', 'Unit', 'USG / L'], ['validTo', 'Valid until', 'ISO date']],
  },
  marketplace: {
    label: 'Charter marketplace & distribution', scopes: ['Empty-leg listings (publish)', 'Charter requests / RFQs', 'Broker inquiries', 'Aircraft listings', 'Trip messages'],
    endpoint: 'GET /rfqs?status=open', map: [
      ['rfqId', 'Inquiry ID', '—'], ['buyer.company', 'Broker / company', '—'], ['segments[].from', 'Departure airport', 'ICAO → IATA'],
      ['segments[].to', 'Arrival airport', 'ICAO → IATA'], ['segments[].date', 'Departure date', 'ISO date'], ['pax', 'Passengers', 'Integer']],
  },
  crm: {
    label: 'CRM & sales', scopes: ['Accounts & contacts', 'Opportunities / deals', 'Activities & tasks', 'Email threads'],
    endpoint: 'GET /opportunities?modified_since={last}', map: [
      ['Id', 'External CRM ID', '—'], ['Account.Name', 'Customer', '—'], ['StageName', 'Pipeline stage', 'Stage map'],
      ['Amount', 'Quote value', 'Currency → workspace'], ['CloseDate', 'Expected close', 'ISO date'], ['Owner.Email', 'Sales owner', 'Match user']],
  },
  finance: {
    label: 'Accounting & ERP', scopes: ['Invoices', 'Payments received', 'Vendor bills', 'Chart of accounts', 'Owner statements', 'Cost centers by aircraft'],
    endpoint: 'GET /invoices?updated_since={last}', map: [
      ['DocNumber', 'Invoice number', '—'], ['CustomerRef.name', 'Customer', '—'], ['TotalAmt', 'Total', 'Currency → workspace'],
      ['Balance', 'Open balance', 'Decimal'], ['DueDate', 'Due date', 'ISO date'], ['ClassRef.name', 'Aircraft (class / cost center)', 'Match tail']],
  },
  payments: {
    label: 'Payments', scopes: ['Payment intents', 'Payouts', 'Refunds', 'Disputes'],
    endpoint: 'GET /payment_intents?limit=10', map: [
      ['id', 'Payment ID', '—'], ['amount', 'Amount', 'Minor units ÷ 100'], ['currency', 'Currency', 'Uppercase'],
      ['status', 'Status', 'succeeded → Paid'], ['metadata.trip_id', 'Trip ID', '—']],
  },
  docs: {
    label: 'Documents & e-signature', scopes: ['Documents & folders', 'Signature envelopes', 'Expiring certificates'],
    endpoint: 'GET /files?folder={aircraft}', map: [
      ['id', 'Document ID', '—'], ['name', 'File name', '—'], ['modifiedTime', 'Last modified', 'ISO 8601'], ['properties.tail', 'Aircraft', 'Match tail']],
  },
  messaging: {
    label: 'Messaging & notifications', scopes: ['Outbound notifications', 'Inbound messages', 'Message templates', 'Delivery receipts'],
    endpoint: 'POST /messages (dry run)', map: [
      ['to', 'Recipient', 'E.164 / email'], ['template', 'Template', '—'], ['status', 'Delivery status', 'Map'], ['sid', 'Message ID', '—']],
  },
  ai: {
    label: 'AI models', scopes: ['Copilot answers', 'Document extraction (OCR → fields)', 'Embeddings & search', 'Email / quote drafting'],
    endpoint: 'POST /messages (ping)', map: [
      ['model', 'Model', '—'], ['usage.input_tokens', 'Input tokens', 'Integer'], ['usage.output_tokens', 'Output tokens', 'Integer'], ['stop_reason', 'Finish reason', '—']],
  },
  data: {
    label: 'Data warehouse & BI', scopes: ['Trips (export)', 'Utilization', 'Aircraft P&L', 'Empty-leg funnel', 'Raw event stream'],
    endpoint: 'INSERT aero.trips (dry run)', map: [
      ['trip_id', 'Trip ID', '—'], ['tail', 'Tail number', '—'], ['block_hours', 'Block hours', 'Decimal'], ['revenue_usd', 'Revenue', 'USD'], ['margin_pct', 'Margin', '%']],
  },
  identity: {
    label: 'Identity & SSO', scopes: ['Users', 'Groups → AERO roles', 'Single sign-on', 'Provisioning (SCIM)'],
    endpoint: 'GET /.well-known/openid-configuration', map: [
      ['sub', 'User ID', '—'], ['email', 'Email', 'Lowercase'], ['groups[]', 'AERO role', 'Role map'], ['name', 'Display name', '—']],
  },
  custom: {
    label: 'Custom sources', scopes: ['Any entity (define mapping)', 'Inbound events', 'Scheduled file drops'],
    endpoint: 'GET {base_url}/{resource}', map: [
      ['id', 'Record ID', '—'], ['tail', 'Tail number', 'Uppercase'], ['date', 'Date', 'ISO 8601'], ['value', 'Value', 'Auto-detect']],
  },
};

const AERO_FIELDS = ['Tail number', 'Trip ID', 'External flight ID', 'Departure airport', 'Arrival airport', 'Departure (UTC)', 'Arrival (UTC)',
  'Off-block (UTC)', 'On-block (UTC)', 'Latitude', 'Longitude', 'Trip type', 'Crew assignment', 'Crew ID', 'Name', 'Position', 'Type ratings',
  'Medical expiry', 'Recurrent training expiry', 'Item reference', 'Description', 'ATA chapter', 'Due date', 'Due airframe hours', 'Due cycles',
  'Status', 'Grounding indicator', 'Airport', 'METAR (raw)', 'Flight category', 'Visibility', 'Wind speed', 'Observed (UTC)', 'FBO', 'Product',
  'Price per unit', 'Unit', 'Valid until', 'Inquiry ID', 'Broker / company', 'Departure date', 'Passengers', 'External CRM ID', 'Customer',
  'Pipeline stage', 'Quote value', 'Expected close', 'Sales owner', 'Invoice number', 'Total', 'Open balance', 'Aircraft (class / cost center)',
  'Payment ID', 'Amount', 'Currency', 'Document ID', 'File name', 'Last modified', 'Aircraft', 'Recipient', 'Template', 'Delivery status',
  'Message ID', 'Model', 'Input tokens', 'Output tokens', 'Finish reason', 'Block hours', 'Revenue', 'Margin', 'User ID', 'Email', 'AERO role',
  'Display name', 'Record ID', 'Date', 'Value', '— Ignore —'];

/* ------------------------------------------------------------------ */
/* Auth presets                                                        */
/* ------------------------------------------------------------------ */
const F = {
  apiKey: { k: 'apiKey', label: 'API key', secret: true, req: true },
  token: { k: 'token', label: 'Access token', secret: true, req: true },
  clientId: { k: 'clientId', label: 'Client ID', req: true },
  clientSecret: { k: 'clientSecret', label: 'Client secret', secret: true, req: true },
  username: { k: 'username', label: 'Username', req: true },
  password: { k: 'password', label: 'Password', secret: true, req: true },
  saJson: { k: 'saJson', label: 'Service account key (JSON)', secret: true, req: true, area: true, ph: '{ "type": "service_account", … }' },
  tenant: (label = 'Account / tenant ID', ph = '') => ({ k: 'tenant', label, req: true, ph }),
};
const AUTH = {
  apikey: { label: 'API key', fields: [F.apiKey] },
  bearer: { label: 'Bearer token', fields: [F.token] },
  oauth2: { label: 'OAuth 2.0', fields: [F.clientId, F.clientSecret], oauth: true },
  oauth2cc: { label: 'OAuth 2.0 · client credentials', fields: [F.clientId, F.clientSecret] },
  basic: { label: 'Username & password', fields: [F.username, F.password] },
  sa: { label: 'Service account', fields: [F.saJson] },
  none: { label: 'Public · no credentials', fields: [] },
};

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* [id, name, vendor, cat, auth, baseUrl, modules, description, extra] */
/* baseUrl === '' → provided by vendor at onboarding                   */
/* ------------------------------------------------------------------ */
const M = (s) => s.split(' ');
const RAW = [
  // Flight tracking
  ['flightaware-aeroapi', 'FlightAware AeroAPI', 'FlightAware', 'tracking', 'apikey', 'https://aeroapi.flightaware.com/aeroapi', M('dashboard fleet operations empty-legs aircraft-detail analytics owner-portal'), 'Flight status, OOOI times, positions and alerts by tail number. Header: x-apikey.', { headerName: 'x-apikey' }],
  ['flightaware-firehose', 'FlightAware Firehose', 'FlightAware', 'tracking', 'basic', '', M('dashboard operations aircraft-detail'), 'Streaming feed of positions and flight events over a persistent TLS socket.'],
  ['flightradar24', 'Flightradar24 API', 'Flightradar24', 'tracking', 'bearer', 'https://fr24api.flightradar24.com/api', M('dashboard fleet operations aircraft-detail'), 'Live and historical flight positions and flight summaries. Bearer token + Accept-Version header.'],
  ['adsbexchange', 'ADS-B Exchange', 'ADS-B Exchange', 'tracking', 'apikey', '', M('dashboard fleet aircraft-detail'), 'Unfiltered ADS-B/MLAT positions, including aircraft not shown on filtered feeds.'],
  ['opensky', 'OpenSky Network', 'OpenSky Network', 'tracking', 'oauth2cc', 'https://opensky-network.org/api', M('dashboard aircraft-detail analytics'), 'State vectors and flight history from the OpenSky receiver network.'],
  ['cirium', 'Cirium FlightStats', 'Cirium', 'tracking', 'apikey', 'https://api.flightstats.com/flex', M('dashboard operations analytics'), 'Flight status, schedules and airport delay indices. App ID + App key.', { fields: [{ k: 'appId', label: 'App ID', req: true }, { k: 'apiKey', label: 'App key', secret: true, req: true }] }],
  ['spire', 'Spire Aviation', 'Spire Global', 'tracking', 'bearer', '', M('dashboard aircraft-detail'), 'Satellite ADS-B coverage for oceanic and remote routes.'],
  ['aviationstack', 'aviationstack', 'apilayer', 'tracking', 'apikey', 'https://api.aviationstack.com/v1', M('dashboard operations'), 'Real-time and historical flight data with a simple access key.'],

  // Scheduling & dispatch
  ['leon', 'Leon Software', 'Leon Software', 'scheduling', 'oauth2', 'https://{operator}.leon.aero', M('operations crew fleet empty-legs dashboard'), 'Trips, legs, crew assignments and aircraft availability from Leon (GraphQL).', { fields: [F.tenant('Operator subdomain', 'youroperator'), F.clientId, F.clientSecret] }],
  ['fl3xx', 'FL3XX', 'FL3XX', 'scheduling', 'apikey', 'https://app.fl3xx.us/api/external', M('operations crew fleet empty-legs charter-crm'), 'Flights, quotes, crew and passengers. Header: X-Auth-Token.', { headerName: 'X-Auth-Token' }],
  ['avianis', 'Avianis', 'Avianis', 'scheduling', 'oauth2cc', '', M('operations crew fleet charter-crm'), 'Scheduling, quoting and crew data for Part 135 / 91 operators.'],
  ['levelflight', 'Levelflight', 'Levelflight', 'scheduling', 'apikey', '', M('operations crew fleet'), 'Flight scheduling, crew and maintenance tracking for business aviation.'],
  ['pfm', 'Professional Flight Management', 'PFM', 'scheduling', 'basic', '', M('operations crew fleet'), 'Flight department scheduling and trip records.'],
  ['schedaero', 'Schedaero', 'Avinode Group', 'scheduling', 'apikey', '', M('operations empty-legs charter-crm'), 'Operator scheduling and quoting connected to Avinode.'],

  // Maintenance
  ['camp-mtx', 'CAMP MTX Web API', 'CAMP Systems', 'maintenance', 'oauth2cc', '', M('maintenance fleet aircraft-detail dashboard empty-legs owner-portal'), 'Due list, aircraft times, discrepancies and component tracking from CAMP MTX.', { fields: [F.tenant('CAMP customer ID'), F.clientId, F.clientSecret] }],
  ['traxxall', 'Traxxall', 'Traxxall', 'maintenance', 'apikey', '', M('maintenance fleet aircraft-detail'), 'Maintenance tracking, due items and inventory.'],
  ['veryon', 'Veryon Tracking', 'Veryon', 'maintenance', 'oauth2cc', '', M('maintenance fleet aircraft-detail'), 'Maintenance tracking, logbook and diagnostics data.'],
  ['atp', 'ATP Aviation Hub', 'ATP', 'maintenance', 'apikey', '', M('maintenance aircraft-detail'), 'Manuals, ADs, SBs and maintenance tracking content.'],
  ['amos', 'AMOS', 'Swiss Aviation Software', 'maintenance', 'basic', '', M('maintenance fleet'), 'MRO / CAMO data: work packages, components and planning.'],
  ['trax', 'TRAX eMRO', 'TRAX', 'maintenance', 'oauth2cc', '', M('maintenance fleet'), 'Work orders, defects and component data.'],
  ['ramco', 'Ramco Aviation', 'Ramco Systems', 'maintenance', 'oauth2cc', '', M('maintenance fleet'), 'Maintenance planning, engineering and materials.'],
  ['corridor', 'CORRIDOR', 'CORRIDOR Aviation Service Software', 'maintenance', 'basic', '', M('maintenance finance'), 'Repair-station work orders, parts and invoicing.'],
  ['quantum', 'Quantum Control', 'Component Control', 'maintenance', 'basic', '', M('maintenance'), 'Parts inventory, repairs and supply chain.'],
  ['faa-registry', 'FAA Aircraft Registry', 'FAA', 'maintenance', 'none', 'https://registry.faa.gov', M('fleet aircraft-detail'), 'Registration, owner of record and airworthiness class by N-number (daily file).'],

  // Crew & training
  ['flightsafety', 'FlightSafety training records', 'FlightSafety International', 'crew', 'apikey', '', M('crew'), 'Recurrent and type-rating completion dates.'],
  ['cae', 'CAE training records', 'CAE', 'crew', 'apikey', '', M('crew'), 'Training events and checkride results.'],
  ['google-calendar', 'Google Calendar', 'Google', 'crew', 'oauth2', 'https://www.googleapis.com/calendar/v3', M('crew operations owner-portal'), 'Push crew assignments and owner trips to calendars.'],
  ['ms365-calendar', 'Microsoft 365 Calendar', 'Microsoft', 'crew', 'oauth2', 'https://graph.microsoft.com/v1.0', M('crew operations owner-portal'), 'Crew and owner calendars via Microsoft Graph.'],

  // Weather / NOTAM
  ['awc', 'NOAA Aviation Weather Center', 'NOAA', 'weather', 'none', 'https://aviationweather.gov/api/data', M('operations dashboard empty-legs'), 'METAR, TAF, PIREP, SIGMET/AIRMET. Public data.'],
  ['faa-notam', 'FAA NOTAM API', 'FAA', 'weather', 'apikey', 'https://external-api.faa.gov/notamapi/v1', M('operations dashboard'), 'Domestic and international NOTAMs. client_id + client_secret headers.', { fields: [F.clientId, F.clientSecret] }],
  ['checkwx', 'CheckWX', 'CheckWX', 'weather', 'apikey', 'https://api.checkwx.com', M('operations dashboard'), 'Decoded METAR / TAF and station data. Header: X-API-Key.'],
  ['tomorrow', 'Tomorrow.io', 'Tomorrow.io', 'weather', 'apikey', 'https://api.tomorrow.io/v4', M('operations dashboard'), 'Forecasts, alerts and en-route weather layers.'],
  ['jeppesen', 'Jeppesen / ForeFlight Dispatch', 'Boeing', 'weather', 'oauth2cc', '', M('operations'), 'Flight plans, trip kits and weather briefings.'],
  ['eurocontrol', 'EUROCONTROL NM B2B', 'EUROCONTROL', 'weather', 'apikey', '', M('operations'), 'Flight plan filing, slots and network data (certificate-based).', { fields: [{ k: 'cert', label: 'Client certificate (PEM)', secret: true, req: true, area: true }, { k: 'certPass', label: 'Certificate passphrase', secret: true }] }],

  // Fuel / FBO / trip support
  ['world-kinect', 'World Kinect Aviation', 'World Kinect', 'trip', 'apikey', '', M('operations finance'), 'Contract fuel prices, releases and invoices.'],
  ['avfuel', 'Avfuel', 'Avfuel', 'trip', 'apikey', '', M('operations finance'), 'Contract fuel pricing and fuel releases.'],
  ['titan', 'Titan Aviation Fuels', 'Titan', 'trip', 'apikey', '', M('operations finance'), 'Fuel quotes and releases.'],
  ['universal', 'Universal Weather & Aviation', 'Universal', 'trip', 'oauth2cc', '', M('operations'), 'Trip support: handling, permits, slots and fuel.'],
  ['signature', 'Signature Aviation FBO', 'Signature Aviation', 'trip', 'apikey', '', M('operations finance'), 'FBO reservations, handling requests and invoices.'],
  ['jetex', 'Jetex', 'Jetex', 'trip', 'apikey', '', M('operations'), 'Global FBO handling and trip support requests.'],

  // Marketplace
  ['avinode', 'Avinode Marketplace API', 'Avinode Group', 'marketplace', 'bearer', '', M('empty-legs marketplace charter-crm'), 'Publish empty legs, receive RFQs and respond with quotes.', { fields: [F.token, { k: 'apiToken', label: 'X-Avinode-ApiToken', secret: true, req: true }] }],
  ['aviapages', 'Aviapages', 'Aviapages', 'marketplace', 'apikey', 'https://aviapages.com/api', M('empty-legs marketplace charter-crm'), 'Charter requests, empty legs and aircraft database.'],
  ['charterpad', 'Broker network feed (custom)', 'Your broker partners', 'marketplace', 'apikey', '', M('marketplace empty-legs'), 'Private distribution of published legs to approved brokers via JSON feed.'],

  // CRM
  ['salesforce', 'Salesforce', 'Salesforce', 'crm', 'oauth2', 'https://{instance}.my.salesforce.com/services/data/v61.0', M('charter-crm marketplace owner-portal'), 'Accounts, contacts, opportunities and activities.', { fields: [F.tenant('My Domain (instance)', 'yourcompany'), F.clientId, F.clientSecret] }],
  ['hubspot', 'HubSpot', 'HubSpot', 'crm', 'bearer', 'https://api.hubapi.com', M('charter-crm marketplace'), 'Contacts, companies and deals via a private app token.'],
  ['pipedrive', 'Pipedrive', 'Pipedrive', 'crm', 'apikey', 'https://api.pipedrive.com/v1', M('charter-crm'), 'Deals, persons and activities.'],
  ['zoho-crm', 'Zoho CRM', 'Zoho', 'crm', 'oauth2', 'https://www.zohoapis.com/crm/v6', M('charter-crm'), 'Leads, contacts and deals.'],
  ['gmail', 'Gmail', 'Google', 'crm', 'oauth2', 'https://gmail.googleapis.com/gmail/v1', M('charter-crm empty-legs'), 'Log quote threads and broker emails to CRM records.'],
  ['outlook', 'Outlook / Exchange Online', 'Microsoft', 'crm', 'oauth2', 'https://graph.microsoft.com/v1.0', M('charter-crm empty-legs'), 'Log quote threads and broker emails to CRM records.'],

  // Finance / ERP
  ['quickbooks', 'QuickBooks Online', 'Intuit', 'finance', 'oauth2', 'https://quickbooks.api.intuit.com/v3/company/{realmId}', M('finance owner-portal analytics'), 'Invoices, payments, bills and classes per aircraft.', { fields: [F.tenant('Company ID (realmId)'), F.clientId, F.clientSecret] }],
  ['xero', 'Xero', 'Xero', 'finance', 'oauth2', 'https://api.xero.com/api.xro/2.0', M('finance owner-portal'), 'Invoices, bank transactions and tracking categories.'],
  ['netsuite', 'Oracle NetSuite', 'Oracle', 'finance', 'oauth2cc', 'https://{account}.suitetalk.api.netsuite.com/services/rest', M('finance analytics'), 'Records, journals and subsidiaries via SuiteTalk REST.', { fields: [F.tenant('Account ID', '1234567'), F.clientId, F.clientSecret] }],
  ['sap-b1', 'SAP Business One Service Layer', 'SAP', 'finance', 'basic', 'https://{host}:50000/b1s/v2', M('finance analytics'), 'Business partners, A/R invoices and journal entries.', { fields: [{ k: 'tenant', label: 'Company database', req: true }, F.username, F.password] }],
  ['sage-intacct', 'Sage Intacct', 'Sage', 'finance', 'basic', 'https://api.intacct.com/ia/xml/xmlgw.phtml', M('finance'), 'GL, AR and dimensions per aircraft.', { fields: [{ k: 'tenant', label: 'Company ID', req: true }, { k: 'senderId', label: 'Sender ID', req: true }, F.username, F.password] }],
  ['stripe', 'Stripe', 'Stripe', 'payments', 'bearer', 'https://api.stripe.com/v1', M('finance marketplace charter-crm'), 'Deposits and card payments for charter and empty-leg bookings.', { fields: [{ k: 'token', label: 'Secret key', secret: true, req: true, ph: 'sk_live_…' }, { k: 'whsec', label: 'Webhook signing secret', secret: true, ph: 'whsec_…' }] }],
  ['adyen', 'Adyen', 'Adyen', 'payments', 'apikey', '', M('finance marketplace'), 'Card and wire payments with multi-currency settlement.', { fields: [F.apiKey, { k: 'tenant', label: 'Merchant account', req: true }] }],

  // Documents & e-sign
  ['google-drive', 'Google Drive', 'Google', 'docs', 'oauth2', 'https://www.googleapis.com/drive/v3', M('maintenance owner-portal fleet aircraft-detail ai-copilot'), 'Aircraft documents, certificates and owner statements.'],
  ['sharepoint', 'SharePoint / OneDrive', 'Microsoft', 'docs', 'oauth2', 'https://graph.microsoft.com/v1.0', M('maintenance owner-portal fleet ai-copilot'), 'Document libraries per aircraft and owner.'],
  ['dropbox', 'Dropbox', 'Dropbox', 'docs', 'oauth2', 'https://api.dropboxapi.com/2', M('owner-portal maintenance'), 'Shared folders for owners and maintenance records.'],
  ['docusign', 'DocuSign eSignature', 'DocuSign', 'docs', 'oauth2', 'https://{env}.docusign.net/restapi/v2.1', M('charter-crm owner-portal finance'), 'Charter agreements, quotes and owner approvals for signature.'],

  // Messaging
  ['twilio', 'Twilio', 'Twilio', 'messaging', 'basic', 'https://api.twilio.com/2010-04-01', M('operations crew charter-crm'), 'SMS alerts to crew and passengers.', { fields: [{ k: 'username', label: 'Account SID', req: true }, { k: 'password', label: 'Auth token', secret: true, req: true }] }],
  ['whatsapp', 'WhatsApp Business Platform', 'Meta', 'messaging', 'bearer', 'https://graph.facebook.com/v20.0', M('charter-crm operations empty-legs'), 'Quote and trip updates over WhatsApp (Cloud API).', { fields: [{ k: 'tenant', label: 'Phone number ID', req: true }, F.token] }],
  ['sendgrid', 'SendGrid', 'Twilio', 'messaging', 'bearer', 'https://api.sendgrid.com/v3', M('charter-crm owner-portal finance'), 'Transactional email: quotes, invoices, statements.'],
  ['slack', 'Slack', 'Slack', 'messaging', 'oauth2', 'https://slack.com/api', M('operations maintenance dashboard'), 'Ops channel alerts: conflicts, AOG, new RFQs.'],
  ['teams', 'Microsoft Teams', 'Microsoft', 'messaging', 'oauth2', 'https://graph.microsoft.com/v1.0', M('operations maintenance dashboard'), 'Ops channel alerts via Microsoft Graph.'],

  // AI
  ['anthropic', 'Anthropic Claude', 'Anthropic', 'ai', 'apikey', 'https://api.anthropic.com/v1', M('ai-copilot empty-legs maintenance'), 'Copilot reasoning, quote drafting and document extraction. Header: x-api-key.', { headerName: 'x-api-key' }],
  ['vertex', 'Google Vertex AI', 'Google Cloud', 'ai', 'sa', 'https://{region}-aiplatform.googleapis.com', M('ai-copilot analytics'), 'Gemini models and embeddings inside your Google Cloud project.', { fields: [{ k: 'tenant', label: 'Project ID', req: true }, { k: 'region', label: 'Region', req: true, ph: 'us-central1' }, F.saJson] }],
  ['openai', 'OpenAI', 'OpenAI', 'ai', 'bearer', 'https://api.openai.com/v1', M('ai-copilot'), 'Chat and embeddings models.'],
  ['azure-openai', 'Azure OpenAI', 'Microsoft', 'ai', 'apikey', 'https://{resource}.openai.azure.com', M('ai-copilot'), 'Models deployed in your Azure tenant. Header: api-key.', { fields: [{ k: 'tenant', label: 'Resource name', req: true }, { k: 'deployment', label: 'Deployment name', req: true }, F.apiKey] }],
  ['google-docai', 'Google Document AI', 'Google Cloud', 'ai', 'sa', 'https://{region}-documentai.googleapis.com/v1', M('maintenance finance ai-copilot'), 'Read work orders, fuel receipts and invoices into structured fields.'],

  // Data & BI
  ['bigquery', 'Google BigQuery', 'Google Cloud', 'data', 'sa', 'https://bigquery.googleapis.com/bigquery/v2', M('analytics finance'), 'Stream trips, utilization and P&L into your warehouse.', { fields: [{ k: 'tenant', label: 'Project ID', req: true }, { k: 'dataset', label: 'Dataset', req: true, ph: 'aero' }, F.saJson] }],
  ['snowflake', 'Snowflake', 'Snowflake', 'data', 'basic', 'https://{account}.snowflakecomputing.com', M('analytics finance'), 'Load AERO tables into your Snowflake account (key-pair auth).', { fields: [F.tenant('Account identifier', 'orgname-account'), { k: 'username', label: 'User', req: true }, { k: 'password', label: 'Private key (PEM)', secret: true, req: true, area: true }, { k: 'warehouse', label: 'Warehouse', ph: 'COMPUTE_WH' }] }],
  ['powerbi', 'Power BI', 'Microsoft', 'data', 'oauth2cc', 'https://api.powerbi.com/v1.0/myorg', M('analytics'), 'Push datasets and refresh reports.'],
  ['looker-studio', 'Looker Studio', 'Google', 'data', 'oauth2', '', M('analytics owner-portal'), 'Community connector for AERO datasets.'],
  ['google-sheets', 'Google Sheets', 'Google', 'data', 'oauth2', 'https://sheets.googleapis.com/v4', M('analytics finance crew fleet maintenance'), 'Two-way sync with spreadsheets (rosters, rate cards, due lists).', { fields: [{ k: 'tenant', label: 'Spreadsheet ID', req: true }, F.clientId, F.clientSecret] }],

  // Identity
  ['okta', 'Okta', 'Okta', 'identity', 'oauth2cc', 'https://{domain}.okta.com', M('settings'), 'SSO (OIDC) and SCIM provisioning.', { fields: [F.tenant('Okta domain', 'yourcompany'), F.clientId, F.clientSecret] }],
  ['entra', 'Microsoft Entra ID', 'Microsoft', 'identity', 'oauth2cc', 'https://login.microsoftonline.com/{tenant}/v2.0', M('settings'), 'SSO with Microsoft accounts; groups mapped to AERO roles.', { fields: [F.tenant('Directory (tenant) ID'), F.clientId, F.clientSecret] }],
  ['google-sso', 'Google Workspace SSO', 'Google', 'identity', 'oauth2cc', 'https://accounts.google.com', M('settings'), 'Sign in with Google Workspace accounts.'],

  // Custom
  ['custom-rest', 'Custom REST API', 'Any provider', 'custom', 'apikey', '', M('dashboard fleet operations crew maintenance empty-legs charter-crm marketplace finance analytics owner-portal aircraft-detail ai-copilot'), 'Connect any JSON API: choose auth, endpoint and field mapping.', { fields: [{ k: 'authHeader', label: 'Auth header name', req: true, ph: 'Authorization' }, F.apiKey, { k: 'resource', label: 'Resource path', req: true, ph: '/v1/flights' }], editableBase: true }],
  ['apps-script', 'Google Apps Script web app', 'Google', 'custom', 'apikey', '', M('dashboard fleet operations crew maintenance finance analytics'), 'Pull from or push to an Apps Script doGet/doPost endpoint backed by Sheets.', { fields: [{ k: 'apiKey', label: 'Shared secret (?key=)', secret: true, req: true }], editableBase: true, basePh: 'https://script.google.com/macros/s/…/exec' }],
  ['sftp', 'SFTP file drop', 'Any provider', 'custom', 'basic', '', M('maintenance finance crew fleet'), 'Scheduled CSV / XLSX imports (e.g. nightly due-list exports).', { fields: [{ k: 'tenant', label: 'Host', req: true, ph: 'sftp.vendor.com' }, F.username, { k: 'password', label: 'Private key or password', secret: true, req: true, area: true }, { k: 'resource', label: 'Remote path', ph: '/exports/due-list/*.csv' }] }],
];

const CATALOG = RAW.map(([id, name, vendor, cat, auth, base, modules, desc, extra = {}]) => ({ id, name, vendor, cat, auth, base, modules, desc, ...extra }));
const byId = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/* Source-of-truth entities */
const ENTITIES = [
  ['position', 'Aircraft position & live status', ['tracking']],
  ['blocktimes', 'Actual block times (OOOI)', ['tracking', 'scheduling']],
  ['schedule', 'Trips & schedule', ['scheduling']],
  ['mxdue', 'Maintenance due items', ['maintenance', 'custom']],
  ['times', 'Airframe hours & cycles', ['maintenance', 'tracking']],
  ['crewquals', 'Crew qualifications & expirations', ['crew', 'scheduling', 'custom']],
  ['wx', 'Weather & NOTAMs', ['weather']],
  ['fuel', 'Fuel prices', ['trip']],
  ['distribution', 'Empty-leg distribution', ['marketplace']],
  ['customers', 'Customer records', ['crm']],
  ['ledger', 'Accounting ledger', ['finance']],
  ['payments', 'Payments', ['payments', 'finance']],
];

const EVENTS = ['trip.created', 'trip.updated', 'trip.cancelled', 'empty_leg.published', 'empty_leg.converted', 'quote.sent', 'quote.accepted',
  'aircraft.status_changed', 'maintenance.item_due', 'maintenance.grounding', 'crew.qualification_expiring', 'invoice.issued', 'invoice.paid', 'owner.approval_requested'];

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
const now = () => Date.now();
const MIN = 60000, HOUR = 60 * MIN;

function rid(n = 24) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

function seed() {
  const t = now();
  const c = (id, ago, records, extra = {}) => ({
    status: 'connected', env: 'production', freq: byId[id].cat === 'tracking' ? 'realtime' : '15m',
    creds: {}, scopes: CATS[byId[id].cat].scopes.slice(0, 3), base: byId[id].base,
    connectedAt: t - 21 * 24 * HOUR, lastSync: t - ago, records, ...extra,
  });
  const connections = {
    'flightaware-aeroapi': c('flightaware-aeroapi', 2 * MIN, 1842, { creds: { apiKey: '••••••••7Q2m' } }),
    'camp-mtx': c('camp-mtx', 11 * MIN, 316, { creds: { tenant: 'AERO-0412', clientId: 'aero-ops', clientSecret: '••••••••x91c' } }),
    fl3xx: c('fl3xx', 6 * MIN, 248, { creds: { apiKey: '••••••••bT4e' } }),
    awc: c('awc', 4 * MIN, 96, { freq: '5m' }),
    avinode: c('avinode', 9 * MIN, 37, { creds: { token: '••••••••Lp0s', apiToken: '••••••••2fHa' } }),
    quickbooks: c('quickbooks', 47 * MIN, 129, { freq: '1h', creds: { tenant: '9130 3571 2214', clientId: 'ABx…', clientSecret: '••••••••Wq8n' } }),
    anthropic: c('anthropic', 1 * MIN, 0, { freq: 'ondemand', creds: { apiKey: '••••••••k3Rd' } }),
    'google-sheets': c('google-sheets', 33 * MIN, 58, { creds: { tenant: '1hX…r0', clientId: '…apps.googleusercontent.com', clientSecret: '••••••••u7Ye' } }),
    salesforce: c('salesforce', 26 * HOUR, 412, { status: 'attention', issue: 'Refresh token expired — re-authorize to resume sync.', creds: { tenant: 'aerocharter', clientId: '3MVG9…', clientSecret: '••••••••0aZk' } }),
  };
  const log = [];
  const push = (id, ago, status, records, ms, msg) => log.push({ t: t - ago, id, status, records, ms, msg });
  push('flightaware-aeroapi', 2 * MIN, 'ok', 14, 412, 'Positions & OOOI updated for 12 tails');
  push('anthropic', 1 * MIN, 'ok', 0, 1880, 'Copilot request served');
  push('awc', 4 * MIN, 'ok', 8, 233, 'METAR/TAF refreshed for 8 bases');
  push('fl3xx', 6 * MIN, 'ok', 5, 690, '5 legs changed, 0 conflicts');
  push('avinode', 9 * MIN, 'ok', 3, 540, '3 new RFQs matched to empty legs');
  push('camp-mtx', 11 * MIN, 'ok', 22, 1310, 'Due list refreshed · 2 items due soon');
  push('google-sheets', 33 * MIN, 'ok', 4, 820, 'Rate card sheet → Finance');
  push('quickbooks', 47 * MIN, 'ok', 6, 960, '6 invoices posted, 2 payments matched');
  push('salesforce', 26 * HOUR, 'error', 0, 310, '401 invalid_grant · refresh token expired');
  log.sort((a, b) => b.t - a.t);
  return {
    v: 1, connections, log,
    priority: { position: 'flightaware-aeroapi', blocktimes: 'flightaware-aeroapi', schedule: 'fl3xx', mxdue: 'camp-mtx', times: 'camp-mtx', wx: 'awc', distribution: 'avinode', customers: 'salesforce', ledger: 'quickbooks' },
    fallback: { position: 'aero', blocktimes: 'fl3xx', times: 'flightaware-aeroapi' },
    webhooks: { secret: 'whsec_' + rid(32), events: ['trip.created', 'trip.updated', 'empty_leg.published', 'maintenance.grounding', 'invoice.paid'], url: '', tenant: 'ws_' + rid(10) },
  };
}

let S;
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  if (!S || S.v !== 1) { S = seed(); save(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } }
load();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mono = (name) => name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hue = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
function ago(ts) {
  if (!ts) return 'never';
  const d = Math.max(0, now() - ts);
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < 24 * HOUR) return `${Math.round(d / HOUR)} h ago`;
  return `${Math.round(d / (24 * HOUR))} d ago`;
}
const FREQ = { realtime: 'Real-time (webhook / stream)', '5m': 'Every 5 minutes', '15m': 'Every 15 minutes', '1h': 'Hourly', '1d': 'Daily at 02:00', ondemand: 'On demand' };
const statusOf = (id) => S.connections[id]?.status || 'off';
const STATUS = { connected: ['Connected', 'ok'], attention: ['Needs attention', 'warn'], off: ['Not connected', 'off'] };
const badge = (st) => `<span class="int-badge int-${STATUS[st][1]}"><i aria-hidden="true"></i>${STATUS[st][0]}</span>`;
const logoHtml = (c, size = '') => `<span class="int-logo ${size}" style="--h:${hue(c.vendor)}" aria-hidden="true">${esc(mono(c.name))}</span>`;
const hostOf = (c, conn) => { const b = conn?.base || c.base; try { return b ? new URL(b.replace(/\{[^}]+\}/g, 'x')).host : 'vendor endpoint'; } catch { return 'vendor endpoint'; } };
const fieldsOf = (c) => c.fields || AUTH[c.auth].fields;
const ICON = {
  plug: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/></svg>',
  sync: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
};

function toast(msg, kind = 'ok') {
  let host = $('#int-toasts');
  if (!host) { host = document.createElement('div'); host.id = 'int-toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const el = document.createElement('div'); el.className = `int-toast int-${kind}`; el.textContent = msg; host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200); setTimeout(() => el.remove(), 3700);
}

/* deterministic sample payloads for the test step */
function sample(c, conn) {
  const tail = 'N350AE';
  const s = {
    tracking: { flights: [{ ident: tail, fa_flight_id: `${tail}-1729612800-adhoc-0`, origin: { code_icao: 'KTEB' }, destination: { code_icao: 'KPBI' }, actual_off: '2026-10-22T13:58:00Z', actual_on: null, last_position: { latitude: 33.91, longitude: -78.44, altitude: 410, groundspeed: 462 } }] },
    scheduling: { flights: [{ flightNid: 88213, acft: { registration: tail }, startAirport: { code: 'KTEB' }, endAirport: { code: 'KPBI' }, startTimeUTC: '2026-10-23T14:00:00Z', flightType: 'CHARTER', crew: [{ id: 'C014', role: 'PIC' }, { id: 'C022', role: 'SIC' }] }] },
    maintenance: { aircraft: { serial: '20512', registration: tail, airframeHours: 3260.4, cycles: 2117 }, dueList: [{ taskCode: '05-20-01', description: 'Phase 3 inspection', ataChapter: '05', nextDue: { date: '2026-11-06', hours: 3300.0 }, status: 'DUE_SOON', groundingItem: false }] },
    crew: { crew: [{ employeeId: 'C014', fullName: 'A. Moreno', position: 'PIC', typeRatings: ['CL-350'], medical: { expires: '2027-02-28' }, recurrent: { expires: '2026-12-15' } }] },
    weather: [{ icaoId: 'KTEB', rawOb: 'KTEB 221351Z 31012KT 10SM FEW045 14/03 A3008', fltCat: 'VFR', visib: '10+', wspd: 12, obsTime: 1792677060 }],
    trip: { prices: [{ airport: 'KPBI', fbo: { name: 'FBO · West ramp' }, product: 'JET-A', price: 6.42, uom: 'USG', validTo: '2026-10-29' }] },
    marketplace: { rfqs: [{ rfqId: 'RFQ-55120', buyer: { company: 'Broker partner' }, segments: [{ from: 'KTEB', to: 'KPBI', date: '2026-10-23' }], pax: 4 }] },
    crm: { records: [{ Id: '0065g00000AbCdE', Account: { Name: 'Harbor Capital' }, StageName: 'Quote sent', Amount: 29600, CloseDate: '2026-10-30' }] },
    finance: { QueryResponse: { Invoice: [{ DocNumber: 'INV-2048', CustomerRef: { name: 'Harbor Capital' }, TotalAmt: 29600, Balance: 0, DueDate: '2026-10-30', ClassRef: { name: tail } }] } },
    payments: { data: [{ id: 'pi_3Q…', amount: 1480000, currency: 'usd', status: 'succeeded', metadata: { trip_id: 'T4182' } }] },
    docs: { files: [{ id: '1aZ…', name: `${tail} · Airworthiness certificate.pdf`, modifiedTime: '2026-09-02T10:11:00Z' }] },
    messaging: { sid: 'SM…', status: 'queued (dry run)', to: '+1 ••• ••• 0190' },
    ai: { model: 'connected', stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 5 }, content: [{ type: 'text', text: 'pong' }] },
    data: { dryRun: true, table: 'aero.trips', rowsWouldInsert: 248 },
    identity: { issuer: `https://${hostOf(c, conn)}`, authorization_endpoint: '…/authorize', token_endpoint: '…/token', scopes_supported: ['openid', 'email', 'profile', 'groups'] },
    custom: { data: [{ id: 'r-001', tail, date: '2026-10-22', value: 'OK' }], count: 1 },
  };
  return s[c.cat];
}
const sampleCount = (c) => ({ tracking: 12, scheduling: 248, maintenance: 316, crew: 18, weather: 96, trip: 41, marketplace: 37, crm: 412, finance: 129, payments: 64, docs: 220, messaging: 0, ai: 0, data: 0, identity: 26, custom: 50 }[c.cat] ?? 10);

/* ------------------------------------------------------------------ */
/* Module strip (every module page)                                    */
/* ------------------------------------------------------------------ */
function renderStrips() {
  $$('[data-integrations-module]').forEach((host) => {
    const mod = host.dataset.integrationsModule;
    const rel = CATALOG.filter((c) => c.modules.includes(mod));
    const active = rel.filter((c) => S.connections[c.id]);
    const recs = rel.filter((c) => !S.connections[c.id] && c.cat !== 'custom').slice(0, 3);
    const chips = active.map((c) => {
      const conn = S.connections[c.id];
      return `<a class="int-chip" href="${HUB}?connector=${c.id}" title="${esc(c.name)} · ${esc(STATUS[conn.status][0])}"><i class="dot int-${STATUS[conn.status][1]}" aria-hidden="true"></i>${esc(c.name)}<small>${conn.status === 'attention' ? 'action needed' : ago(conn.lastSync)}</small></a>`;
    }).join('');
    host.classList.add('int-strip-host');
    host.innerHTML = `
      <div class="int-strip">
        <div class="int-strip-lead">${ICON.plug}<span><b>Data sources</b><small>${active.length ? `${active.filter((c) => S.connections[c.id].status === 'connected').length} live · ${MODULES[mod] || ''}` : 'Manual entry'}</small></span></div>
        <div class="int-strip-chips">${chips || `<span class="int-muted">No external source connected yet.${recs.length ? ` Suggested: ${recs.map((c) => `<a href="${HUB}?connector=${c.id}">${esc(c.name)}</a>`).join(', ')}` : ''}</span>`}</div>
        <div class="int-strip-actions">
          ${active.length ? `<button type="button" class="btn btn-sm" data-int-sync="${mod}">${ICON.sync} Sync now</button>` : ''}
          <a class="btn btn-sm btn-primary" href="${HUB}?module=${mod}">Configure</a>
        </div>
      </div>`;
  });
}

function syncIds(ids) {
  const t = now();
  ids.forEach((id, i) => {
    const conn = S.connections[id]; if (!conn) return;
    if (conn.status === 'attention') { S.log.unshift({ t: t + i, id, status: 'error', records: 0, ms: 280, msg: conn.issue || 'Authorization required' }); return; }
    const n = Math.max(1, Math.round(sampleCount(byId[id]) * (0.02 + ((hue(id) + t / 1000) % 7) / 100)));
    conn.lastSync = t; conn.records = (conn.records || 0) + n;
    S.log.unshift({ t: t + i, id, status: 'ok', records: n, ms: 200 + (hue(id) * 7) % 1400, msg: `${n} record${n === 1 ? '' : 's'} updated` });
  });
  S.log = S.log.slice(0, 200); save();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-int-sync]'); if (!b) return;
  const mod = b.dataset.intSync;
  const ids = CATALOG.filter((c) => c.modules.includes(mod) && S.connections[c.id]).map((c) => c.id);
  b.disabled = true; b.classList.add('is-busy');
  setTimeout(() => {
    syncIds(ids); b.disabled = false; b.classList.remove('is-busy'); renderStrips();
    const bad = ids.filter((id) => S.connections[id].status === 'attention').length;
    toast(bad ? `Synced ${ids.length - bad} source(s) · ${bad} need attention` : `Synced ${ids.length} source(s)`, bad ? 'warn' : 'ok');
  }, 900);
});

/* ------------------------------------------------------------------ */
/* Hub page                                                            */
/* ------------------------------------------------------------------ */
const UI = { cat: 'all', q: '', module: '', view: 'catalog' };

function renderHub() {
  const root = $('#int-root'); if (!root) return;
  const p = new URLSearchParams(location.search);
  UI.module = p.get('module') && MODULES[p.get('module')] ? p.get('module') : '';
  root.innerHTML = `
    <section class="kpis int-kpis" id="int-kpis" aria-label="Integration metrics"></section>
    <div class="tabs" role="tablist" aria-label="Integration views" id="int-views">
      ${[['catalog', 'Connectors'], ['truth', 'Source of truth'], ['webhooks', 'Webhooks & API'], ['log', 'Sync activity']].map(([k, l]) => `<button role="tab" data-view="${k}" aria-selected="${UI.view === k}">${l}</button>`).join('')}
    </div>
    <div id="int-view"></div>`;
  $('#int-views').addEventListener('click', (e) => { const t = e.target.closest('[data-view]'); if (!t) return; UI.view = t.dataset.view; $$('#int-views [role=tab]').forEach((x) => x.setAttribute('aria-selected', x === t)); drawView(); });
  drawKpis(); drawView();
  const pre = p.get('connector'); if (pre && byId[pre]) openDrawer(pre);
}

function drawKpis() {
  const el = $('#int-kpis'); if (!el) return;
  const conns = Object.entries(S.connections);
  const live = conns.filter(([, c]) => c.status === 'connected').length;
  const att = conns.filter(([, c]) => c.status === 'attention').length;
  const day = S.log.filter((l) => now() - l.t < 24 * HOUR);
  const recs = day.reduce((a, l) => a + (l.records || 0), 0);
  const okRate = day.length ? Math.round((day.filter((l) => l.status === 'ok').length / day.length) * 100) : 100;
  const last = S.log[0];
  const k = (label, value, sub, cls = '') => `<div class="kpi int-kpi ${cls}"><span class="int-kpi-l">${label}</span><b>${value}</b><small>${sub}</small></div>`;
  el.innerHTML = k('Live sources', live, `${CATALOG.length} connectors available`) +
    k('Needs attention', att, att ? 'Re-authorize to resume' : 'All healthy', att ? 'is-warn' : '') +
    k('Records synced · 24 h', fmtN(recs), `${day.length} sync runs`) +
    k('Success rate · 24 h', `${okRate}%`, last ? `Last run ${ago(last.t)}` : 'No runs yet');
}

function drawView() {
  const v = $('#int-view');
  v.onchange = UI.view === 'truth' ? onTruthChange : null;
  if (UI.view === 'catalog') return drawCatalog(v);
  if (UI.view === 'truth') return drawTruth(v);
  if (UI.view === 'webhooks') return drawWebhooks(v);
  return drawLog(v);
}

/* ---- Catalog ---- */
function drawCatalog(v) {
  const cats = Object.entries(CATS);
  v.innerHTML = `
    <div class="int-toolbar">
      <label class="int-search">${ICON.search}<span class="sr-only">Search connectors</span><input type="search" id="int-q" placeholder="Search CAMP, FlightAware, QuickBooks…" value="${esc(UI.q)}" /></label>
      <label class="field int-mod"><span class="sr-only">Module</span><select id="int-module"><option value="">All modules</option>${Object.entries(MODULES).map(([k, l]) => `<option value="${k}" ${UI.module === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="result-count" id="int-count" aria-live="polite"></span>
    </div>
    <div class="int-cats" role="group" aria-label="Category">
      <button type="button" class="pill" data-cat="all" aria-pressed="${UI.cat === 'all'}">All</button>
      <button type="button" class="pill" data-cat="connected" aria-pressed="${UI.cat === 'connected'}">Connected</button>
      ${cats.map(([k, c]) => `<button type="button" class="pill" data-cat="${k}" aria-pressed="${UI.cat === k}">${c.label}</button>`).join('')}
    </div>
    <div id="int-grid"></div>`;
  $('#int-q').addEventListener('input', (e) => { UI.q = e.target.value; drawGrid(); });
  $('#int-module').addEventListener('change', (e) => {
    UI.module = e.target.value;
    const u = new URL(location.href); UI.module ? u.searchParams.set('module', UI.module) : u.searchParams.delete('module'); history.replaceState(null, '', u);
    drawGrid();
  });
  $('.int-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; UI.cat = b.dataset.cat; $$('.int-cats .pill').forEach((x) => x.setAttribute('aria-pressed', x === b)); drawGrid(); });
  drawGrid();
}

function drawGrid() {
  const q = UI.q.trim().toLowerCase();
  const list = CATALOG.filter((c) => (UI.cat === 'all' || (UI.cat === 'connected' ? S.connections[c.id] : c.cat === UI.cat)) &&
    (!UI.module || c.modules.includes(UI.module)) &&
    (!q || `${c.name} ${c.vendor} ${CATS[c.cat].label} ${c.desc}`.toLowerCase().includes(q)));
  $('#int-count').textContent = `${list.length} connector${list.length === 1 ? '' : 's'}${UI.module ? ` for ${MODULES[UI.module]}` : ''}`;
  const groups = {};
  list.forEach((c) => (groups[c.cat] ||= []).push(c));
  const order = (c) => ({ connected: 0, attention: 1, off: 2 }[statusOf(c.id)]);
  $('#int-grid').innerHTML = list.length ? Object.entries(groups).map(([cat, items]) => `
    <section class="int-group" aria-labelledby="g-${cat}">
      <h2 class="int-group-h" id="g-${cat}">${CATS[cat].label}<span>${items.filter((c) => S.connections[c.id]).length}/${items.length} connected</span></h2>
      <div class="int-grid">${items.sort((a, b) => order(a) - order(b)).map(card).join('')}</div>
    </section>`).join('') : `<div class="int-empty"><p>No connector matches “${esc(UI.q)}”.</p><button class="btn btn-sm" data-open="custom-rest">Build a custom REST connection</button></div>`;
}

function card(c) {
  const st = statusOf(c.id); const conn = S.connections[c.id];
  return `<article class="int-card is-${st}">
    <header>${logoHtml(c)}<div><h3>${esc(c.name)}</h3><p>${esc(c.vendor)} · ${esc(AUTH[c.auth].label)}</p></div></header>
    <p class="int-desc">${esc(c.desc)}</p>
    <div class="int-mods">${c.modules.slice(0, 4).map((m) => `<span>${esc(MODULES[m])}</span>`).join('')}${c.modules.length > 4 ? `<span>+${c.modules.length - 4}</span>` : ''}</div>
    <footer>${badge(st)}${conn ? `<small>${conn.status === 'attention' ? esc(conn.issue || '') : `Synced ${ago(conn.lastSync)}`}</small>` : ''}
      <button type="button" class="btn btn-sm ${st === 'off' ? 'btn-primary' : ''}" data-open="${c.id}">${st === 'off' ? 'Connect' : st === 'attention' ? 'Fix' : 'Manage'}</button></footer>
  </article>`;
}

document.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openDrawer(b.dataset.open); });

/* ---- Source of truth ---- */
function drawTruth(v) {
  const opts = (cats, sel, allowNone) => {
    const list = CATALOG.filter((c) => cats.includes(c.cat) && S.connections[c.id]);
    return `${allowNone ? `<option value="" ${!sel ? 'selected' : ''}>— None —</option>` : ''}<option value="aero" ${sel === 'aero' ? 'selected' : ''}>AERO records (manual entry)</option>` +
      list.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}${S.connections[c.id].status !== 'connected' ? ' (needs attention)' : ''}</option>`).join('');
  };
  v.innerHTML = `
    <section class="card card-flush">
      <div class="card-head"><h2 class="card-title">Source of truth by data type</h2><span class="card-sub">When two sources disagree, the primary wins; the fallback is used if the primary is unavailable.</span></div>
      <div class="int-table-wrap"><table class="int-table">
        <thead><tr><th scope="col">Data type</th><th scope="col">Primary source</th><th scope="col">Fallback</th><th scope="col">Conflict rule</th><th scope="col">Status</th></tr></thead>
        <tbody>${ENTITIES.map(([k, label, cats]) => {
          const p = S.priority[k] || 'aero'; const f = S.fallback?.[k] || '';
          const st = p === 'aero' ? '<span class="int-muted">Manual</span>' : badge(statusOf(p));
          return `<tr><th scope="row">${label}</th>
            <td><label class="field"><span class="sr-only">Primary for ${label}</span><select data-prio="${k}">${opts(cats, p, false)}</select></label></td>
            <td><label class="field"><span class="sr-only">Fallback for ${label}</span><select data-fb="${k}">${opts(cats, f, true)}</select></label></td>
            <td><label class="field"><span class="sr-only">Conflict rule</span><select data-rule="${k}">${['Primary wins', 'Most recent wins', 'Flag for review'].map((r) => `<option ${((S.rules || {})[k] || 'Primary wins') === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label></td>
            <td>${st}</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="card-foot">Only connected sources are listed. Changes apply to the next sync and are written to the audit trail.</p>
    </section>`;
}
function onTruthChange(e) {
  const s = e.target;
  if (s.dataset.prio) S.priority[s.dataset.prio] = s.value;
  else if (s.dataset.fb) (S.fallback ||= {})[s.dataset.fb] = s.value;
  else if (s.dataset.rule) (S.rules ||= {})[s.dataset.rule] = s.value;
  else return;
  save(); toast('Source-of-truth rule saved');
}

/* ---- Webhooks ---- */
function drawWebhooks(v) {
  const W = S.webhooks;
  const inbound = `https://api.aeroaiops.com/v1/hooks/${W.tenant}`;
  v.innerHTML = `
    <div class="cols-2">
      <section class="card">
        <div class="card-head"><h2 class="card-title">Inbound webhooks</h2><span class="card-sub">Point vendor webhooks here</span></div>
        <div class="int-kv"><span>Endpoint</span><code id="wh-in">${inbound}/{connector}</code><button class="btn btn-sm" data-copy="${inbound}/{connector}">${ICON.copy} Copy</button></div>
        <div class="int-kv"><span>Signing secret</span><code id="wh-secret">${W.reveal ? esc(W.secret) : 'whsec_' + '•'.repeat(18) + esc(W.secret.slice(-4))}</code>
          <button class="btn btn-sm" id="wh-reveal">${W.reveal ? 'Hide' : 'Reveal'}</button><button class="btn btn-sm" id="wh-rotate">Rotate</button></div>
        <p class="int-muted int-small">Requests are verified with an HMAC-SHA256 signature in the <code>X-AERO-Signature</code> header. Use one path per connector, e.g. <code>/stripe</code>, <code>/avinode</code>, <code>/flightaware-aeroapi</code>.</p>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Outbound events</h2><span class="card-sub">AERO → your systems</span></div>
        <label class="field"><span>Destination URL</span><input type="url" id="wh-url" placeholder="https://your-system.example.com/aero-events" value="${esc(W.url)}" /></label>
        <div class="int-events">${EVENTS.map((ev) => `<label class="switch"><input type="checkbox" data-ev="${ev}" ${W.events.includes(ev) ? 'checked' : ''}/> <code>${ev}</code></label>`).join('')}</div>
        <div class="row int-row"><button class="btn btn-primary" id="wh-save">Save</button><button class="btn" id="wh-test">Send test event</button><span id="wh-out" class="int-small" aria-live="polite"></span></div>
      </section>
    </div>
    <section class="card mt">
      <div class="card-head"><h2 class="card-title">AERO REST API</h2><span class="card-sub">For your own scripts, BI tools and Apps Script</span></div>
      <pre class="int-code" tabindex="0">curl https://api.aeroaiops.com/v1/trips?from=2026-10-01 \\
  -H "Authorization: Bearer $AERO_API_KEY"

# Apps Script
const res = UrlFetchApp.fetch('https://api.aeroaiops.com/v1/aircraft', {
  headers: { Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('AERO_API_KEY') }
});</pre>
    </section>`;
  $('[data-copy]', v).addEventListener('click', (e) => { navigator.clipboard?.writeText(e.currentTarget.dataset.copy).then(() => toast('Endpoint copied'), () => toast('Copy not available', 'warn')); });
  $('#wh-reveal').addEventListener('click', () => { W.reveal = !W.reveal; save(); drawWebhooks(v); });
  $('#wh-rotate').addEventListener('click', () => { if (!confirm('Rotate the signing secret? Vendors using the old secret will fail verification until updated.')) return; W.secret = 'whsec_' + rid(32); W.reveal = true; save(); drawWebhooks(v); toast('Signing secret rotated'); });
  $('#wh-save').addEventListener('click', () => {
    const url = $('#wh-url').value.trim();
    if (url && !/^https:\/\//i.test(url)) { $('#wh-out').textContent = 'Destination must use https://'; return; }
    W.url = url; W.events = $$('[data-ev]', v).filter((x) => x.checked).map((x) => x.dataset.ev); save(); toast('Outbound webhooks saved');
  });
  $('#wh-test').addEventListener('click', () => {
    const out = $('#wh-out'); const url = $('#wh-url').value.trim();
    if (!/^https:\/\//i.test(url)) { out.textContent = 'Add an https:// destination first.'; return; }
    out.textContent = 'Sending…'; setTimeout(() => { out.textContent = `Delivered trip.updated · 200 OK · 184 ms`; S.log.unshift({ t: now(), id: 'outbound', status: 'ok', records: 1, ms: 184, msg: `Test event → ${new URL(url).host}` }); save(); }, 800);
  });
}

/* ---- Log ---- */
function drawLog(v) {
  const name = (id) => id === 'outbound' ? 'Outbound webhook' : byId[id]?.name || id;
  v.innerHTML = `
    <section class="card card-flush">
      <div class="card-head"><h2 class="card-title">Sync activity</h2><div class="row"><button class="btn btn-sm" id="log-all">${ICON.sync} Sync all sources</button><button class="btn btn-sm" id="log-csv">Export CSV</button></div></div>
      <div class="int-table-wrap"><table class="int-table">
        <thead><tr><th scope="col">Time</th><th scope="col">Source</th><th scope="col">Result</th><th scope="col" class="num">Records</th><th scope="col" class="num">Duration</th><th scope="col">Detail</th></tr></thead>
        <tbody>${S.log.slice(0, 60).map((l) => `<tr><td>${new Date(l.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(name(l.id))}</td>
          <td>${l.status === 'ok' ? '<span class="int-badge int-ok"><i></i>Success</span>' : '<span class="int-badge int-bad"><i></i>Failed</span>'}</td>
          <td class="num">${fmtN(l.records)}</td><td class="num">${fmtN(l.ms)} ms</td><td>${esc(l.msg)}</td></tr>`).join('') || '<tr><td colspan="6" class="int-muted">No sync runs yet.</td></tr>'}</tbody></table></div>
    </section>`;
  $('#log-all').addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    setTimeout(() => { syncIds(Object.keys(S.connections)); drawKpis(); drawLog(v); toast('All sources synced'); }, 1000);
  });
  $('#log-csv').addEventListener('click', () => {
    const rows = [['time', 'source', 'result', 'records', 'duration_ms', 'detail'], ...S.log.map((l) => [new Date(l.t).toISOString(), name(l.id), l.status, l.records, l.ms, l.msg])];
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'aero-sync-activity.csv'; a.click();
  });
}

/* ------------------------------------------------------------------ */
/* Connection drawer                                                   */
/* ------------------------------------------------------------------ */
let drawerState = null;

function openDrawer(id) {
  const c = byId[id]; if (!c) return;
  const conn = S.connections[id];
  drawerState = { id, oauthOk: !!conn && conn.status !== 'attention', tested: !!conn && conn.status === 'connected', mapping: { ...(conn?.mapping || {}) } };
  let d = $('#int-drawer');
  if (!d) { d = document.createElement('div'); d.id = 'int-drawer'; document.body.appendChild(d); }
  const fields = fieldsOf(c);
  const cat = CATS[c.cat];
  const needsBase = !c.base || /\{/.test(c.base) || c.editableBase;
  const baseVal = conn?.base || c.base || '';
  d.innerHTML = `
    <div class="int-scrim" data-close></div>
    <aside class="int-panel" role="dialog" aria-modal="true" aria-labelledby="dr-title">
      <header class="int-panel-h">${logoHtml(c, 'lg')}<div><p class="eyebrow">${esc(cat.label)}</p><h2 id="dr-title">${esc(c.name)}</h2><p class="int-muted">${esc(c.vendor)} · ${esc(c.desc)}</p></div>
        <button class="btn btn-ghost btn-icon" data-close aria-label="Close">${ICON.x}</button></header>
      ${conn?.status === 'attention' ? `<p class="notice int-notice-warn">${esc(conn.issue)}</p>` : ''}
      <form id="dr-form" class="int-form" novalidate>
        <fieldset><legend>Connection</legend>
          <div class="form-grid">
            <label class="field"><span>Environment</span><select name="env"><option value="production" ${conn?.env !== 'sandbox' ? 'selected' : ''}>Production</option><option value="sandbox" ${conn?.env === 'sandbox' ? 'selected' : ''}>Sandbox / test</option></select></label>
            <label class="field"><span>Authentication</span><input type="text" value="${esc(AUTH[c.auth].label)}" readonly /></label>
            <label class="field span-2"><span>Base URL${needsBase && !c.editableBase && !c.base ? ' (from your account manager)' : ''}</span><input type="url" name="base" value="${esc(baseVal)}" placeholder="${esc(c.basePh || (c.base ? c.base : 'https://api.vendor.com/v1'))}" ${needsBase ? 'required' : ''} /></label>
          </div>
        </fieldset>
        ${c.auth === 'none' && !c.fields ? '<fieldset><legend>Credentials</legend><p class="int-muted int-small">Public data source — no credentials required.</p></fieldset>' : `
        <fieldset><legend>Credentials</legend>
          <div class="form-grid">${fields.map((f) => {
            const cur = conn?.creds?.[f.k] || '';
            const ph = f.secret && cur ? `Saved (${cur.slice(-4)}) — leave blank to keep` : (f.ph || '');
            return `<label class="field ${f.area ? 'span-2' : ''}"><span>${esc(f.label)}${f.req ? '' : ' <em>optional</em>'}</span>${f.area
              ? `<textarea name="${f.k}" rows="3" spellcheck="false" placeholder="${esc(ph)}" ${f.req && !cur ? 'required' : ''}></textarea>`
              : `<input name="${f.k}" type="${f.secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false" placeholder="${esc(ph)}" value="${f.secret ? '' : esc(cur)}" ${f.req && !cur ? 'required' : ''} />`}</label>`;
          }).join('')}</div>
          ${AUTH[c.auth].oauth ? `<div class="int-oauth"><button type="button" class="btn" id="dr-oauth">Authorize with ${esc(c.vendor)}</button><span id="dr-oauth-st" class="int-small">${drawerState.oauthOk && conn?.status !== 'attention' ? '✓ Authorized' : 'Opens the vendor consent screen'}</span></div>` : ''}
          <p class="int-muted int-small">Secrets are masked after saving and are never displayed in full again.</p>
        </fieldset>`}
        <fieldset><legend>Sync</legend>
          <div class="form-grid">
            <label class="field"><span>Frequency</span><select name="freq">${Object.entries(FREQ).map(([k, l]) => `<option value="${k}" ${(conn?.freq || (c.cat === 'tracking' ? 'realtime' : '15m')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Direction</span><select name="dir">${['Read into AERO', 'Write from AERO', 'Two-way'].map((x) => `<option ${(conn?.dir || (['data', 'messaging'].includes(c.cat) ? 'Write from AERO' : c.cat === 'marketplace' || c.cat === 'crm' ? 'Two-way' : 'Read into AERO')) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          </div>
          <p class="fp-label">Data to sync</p>
          <div class="int-scopes">${cat.scopes.map((s) => `<label class="switch"><input type="checkbox" name="scope" value="${esc(s)}" ${(conn?.scopes || cat.scopes.slice(0, 3)).includes(s) ? 'checked' : ''}/> ${esc(s)}</label>`).join('')}</div>
          <p class="fp-label">Feeds these modules</p>
          <div class="int-mods">${c.modules.map((m) => `<span>${esc(MODULES[m])}</span>`).join('')}</div>
        </fieldset>
        <fieldset><legend>Field mapping</legend>
          <div class="int-table-wrap"><table class="int-table int-map"><thead><tr><th scope="col">${esc(c.vendor)} field</th><th scope="col" aria-label="maps to"></th><th scope="col">AERO field</th><th scope="col">Transform</th></tr></thead>
          <tbody>${cat.map.map(([src, dst, tr]) => `<tr><td><code>${esc(src)}</code></td><td aria-hidden="true">→</td><td><label class="field"><span class="sr-only">AERO field for ${esc(src)}</span><select data-map="${esc(src)}">${AERO_FIELDS.map((f) => `<option ${(drawerState.mapping[src] || dst) === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label></td><td class="int-muted">${esc(tr)}</td></tr>`).join('')}</tbody></table></div>
        </fieldset>
        <fieldset><legend>Test connection</legend>
          <p class="int-small int-muted">Request: <code>${esc(cat.endpoint)}</code> on <code>${esc(hostOf(c, conn))}</code>${c.headerName ? ` · header <code>${esc(c.headerName)}</code>` : ''}</p>
          <ol class="int-steps" id="dr-steps" aria-live="polite"></ol>
          <pre class="int-code" id="dr-sample" hidden tabindex="0"></pre>
        </fieldset>
      </form>
      <footer class="int-panel-f">
        ${conn ? '<button type="button" class="btn btn-danger" id="dr-disconnect">Disconnect</button>' : '<span></span>'}
        <div class="row"><button type="button" class="btn" id="dr-test">Test connection</button><button type="button" class="btn btn-primary" id="dr-save">${conn ? 'Save changes' : 'Save & enable'}</button></div>
      </footer>
    </aside>`;
  d.hidden = false; document.body.classList.add('int-lock');
  requestAnimationFrame(() => d.classList.add('open'));
  setTimeout(() => $('#dr-form input:not([readonly]), #dr-form select', d)?.focus(), 60);
  const u = new URL(location.href); if ($('#int-root')) { u.searchParams.set('connector', id); history.replaceState(null, '', u); }

  d.onclick = (e) => { if (e.target.closest('[data-close]')) closeDrawer(); };
  d.onkeydown = (e) => { if (e.key === 'Escape') closeDrawer(); trapFocus(e, d); };
  $('#dr-oauth', d)?.addEventListener('click', () => {
    const st = $('#dr-oauth-st'); st.textContent = 'Waiting for consent…';
    setTimeout(() => { if (!drawerState) return; drawerState.oauthOk = true; drawerState.reauth = true; st.textContent = '✓ Authorized · scopes granted'; }, 1100);
  });
  $('#dr-test', d).addEventListener('click', () => runTest(c));
  $('#dr-save', d).addEventListener('click', () => saveConn(c));
  $('#dr-disconnect', d)?.addEventListener('click', () => {
    if (!confirm(`Disconnect ${c.name}? Synced records stay in AERO; future syncs stop.`)) return;
    delete S.connections[id];
    Object.keys(S.priority).forEach((k) => { if (S.priority[k] === id) S.priority[k] = 'aero'; });
    S.log.unshift({ t: now(), id, status: 'ok', records: 0, ms: 0, msg: 'Disconnected by user' }); save();
    closeDrawer(); refreshAll(); toast(`${c.name} disconnected`);
  });
  $$('[data-map]', d).forEach((s) => s.addEventListener('change', () => { drawerState.mapping[s.dataset.map] = s.value; }));
}

function trapFocus(e, d) {
  if (e.key !== 'Tab') return;
  const f = $$('a,button,input,select,textarea,[tabindex="0"]', $('.int-panel', d)).filter((x) => !x.disabled && x.offsetParent);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
  else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
}

function closeDrawer() {
  const d = $('#int-drawer'); if (!d) return;
  d.classList.remove('open'); document.body.classList.remove('int-lock');
  setTimeout(() => { d.hidden = true; d.innerHTML = ''; }, 220);
  const u = new URL(location.href); if (u.searchParams.has('connector')) { u.searchParams.delete('connector'); history.replaceState(null, '', u); }
  drawerState = null;
}

function readForm(c) {
  const form = $('#dr-form'); const fd = new FormData(form); const conn = S.connections[c.id];
  const vals = {}; const missing = [];
  fieldsOf(c).forEach((f) => {
    const v = String(fd.get(f.k) ?? '').trim();
    const kept = conn?.creds?.[f.k];
    if (!v && f.req && !kept) missing.push(f.label);
    vals[f.k] = v;
  });
  let base = String(fd.get('base') ?? '').trim();
  const tenant = vals.tenant || conn?.creds?.tenant || '';
  if (base && tenant && /\{[^}]+\}/.test(base)) { base = base.replace(/\{[^}]+\}/, tenant).replace(/\{(env)\}/, 'www'); const inp = form.querySelector('[name=base]'); if (inp) inp.value = base; }
  const needsBase = !c.base || /\{/.test(c.base) || c.editableBase;
  if (needsBase && !base) missing.push('Base URL');
  if (base && /\{[^}]+\}/.test(base)) missing.push('Base URL placeholders ({…})');
  if (base && !/^https:\/\//i.test(base) && !/^sftp:|^[a-z0-9.-]+$/i.test(base)) missing.push('Base URL must start with https://');
  return { vals, missing, base, env: fd.get('env'), freq: fd.get('freq'), dir: fd.get('dir'), scopes: fd.getAll('scope') };
}

function runTest(c) {
  const { vals, missing, base } = readForm(c);
  const steps = $('#dr-steps'); const out = $('#dr-sample'); out.hidden = true;
  const conn = S.connections[c.id];
  const host = (() => { try { return new URL(base || c.base).host; } catch { return hostOf(c, conn); } })();
  const secretNew = fieldsOf(c).filter((f) => f.secret).map((f) => vals[f.k]).filter(Boolean);
  const weak = secretNew.find((v) => v.length < 8 || /^(test|invalid|xxx+|1234)/i.test(v));
  const plan = [
    ['Validate configuration', () => (missing.length ? `Missing: ${missing.join(', ')}` : null)],
    [`Resolve ${host}`, () => null],
    [`Authenticate · ${AUTH[c.auth].label}`, () => {
      if (AUTH[c.auth].oauth && !drawerState.oauthOk) return `Authorize with ${c.vendor} first`;
      if (conn?.status === 'attention' && !secretNew.length && !drawerState.reauth) { return '401 invalid_grant · enter new credentials or re-authorize'; }
      if (weak) return '401 Unauthorized · credentials rejected by provider';
      return null;
    }],
    [`Fetch sample · ${CATS[c.cat].endpoint}`, () => null],
    ['Apply field mapping', () => null],
  ];
  steps.innerHTML = plan.map(([l]) => `<li><i aria-hidden="true"></i><span>${esc(l)}</span><small></small></li>`).join('');
  const btn = $('#dr-test'); btn.disabled = true;
  steps.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const lis = $$('li', steps); let i = 0; const t0 = performance.now();
  const next = () => {
    if (i >= plan.length) {
      drawerState.tested = true; btn.disabled = false;
      out.textContent = JSON.stringify(sample(c, conn), null, 2); out.hidden = false;
      lis.at(-1).querySelector('small').textContent = `${fmtN(sampleCount(c))} records available`;
      toast(`Connection to ${c.name} verified`);
      return;
    }
    const li = lis[i]; li.className = 'run';
    setTimeout(() => {
      const err = plan[i][1]();
      if (err) { li.className = 'fail'; li.querySelector('small').textContent = err; btn.disabled = false; drawerState.tested = false; toast('Connection test failed', 'bad'); return; }
      li.className = 'ok'; li.querySelector('small').textContent = `${Math.round(performance.now() - t0)} ms`;
      i += 1; next();
    }, 280 + ((hue(c.id) + i * 97) % 420));
  };
  next();
}

function saveConn(c) {
  const { vals, missing, base, env, freq, dir, scopes } = readForm(c);
  if (missing.length) { runTest(c); return; }
  if (!drawerState.tested) { toast('Run “Test connection” before saving', 'warn'); $('#dr-test').focus(); return; }
  const prev = S.connections[c.id];
  const creds = { ...(prev?.creds || {}) };
  fieldsOf(c).forEach((f) => { const v = vals[f.k]; if (!v) return; creds[f.k] = f.secret ? '••••••••' + v.slice(-4) : v; });
  const n = sampleCount(c);
  S.connections[c.id] = {
    ...(prev || {}), status: 'connected', issue: undefined, env, freq, dir, scopes, base: base || c.base, creds,
    mapping: drawerState.mapping, connectedAt: prev?.connectedAt || now(), lastSync: now(), records: (prev?.records || 0) + (prev ? 0 : n),
  };
  S.log.unshift({ t: now(), id: c.id, status: 'ok', records: prev ? 0 : n, ms: 640, msg: prev ? 'Configuration updated' : `Initial sync · ${fmtN(n)} records imported` });
  ENTITIES.forEach(([k, , cats]) => { if (cats.includes(c.cat) && (!S.priority[k] || S.priority[k] === 'aero')) S.priority[k] = c.id; });
  save(); closeDrawer(); refreshAll();
  toast(prev ? `${c.name} updated` : `${c.name} connected · initial sync complete`);
}

function refreshAll() { renderStrips(); if ($('#int-root')) { drawKpis(); drawView(); } }

/* keep multiple tabs in step */
window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); refreshAll(); } });

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function boot() { renderStrips(); renderHub(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

/* Public API for other modules (e.g. app.js, AI Copilot) */
window.AERO_INTEGRATIONS = {
  catalog: CATALOG,
  connections: () => structuredClone(S.connections),
  sourceFor: (entity) => S.priority[entity] || 'aero',
  isConnected: (id) => S.connections[id]?.status === 'connected',
  open: openDrawer,
};
