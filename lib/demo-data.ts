export type DemoCustomer = {
  id: string;
  name: string;
};

export type OperationalStatus = 'online' | 'offline' | 'attention' | 'unknown';

export type Severity = 'INFO' | 'WARN' | 'CRIT';

export type DemoDevice = {
  id: string;
  customerId: string;
  name: string;
  site: string;
  status: OperationalStatus;
  operatingSystem: string;
  lastSeen: string;
  activeAlerts: number;
};

export type DemoAlert = {
  id: string;
  customerId: string;
  source: string;
  severity: Severity;
  title: string;
};

export type DashboardMetrics = {
  monitoredSites: number;
  activeDevices: number;
  risksInAttention: number;
  criticalEvents: number;
};

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { id: 'demo-customer-1', name: 'Acme Energia' },
  { id: 'demo-customer-2', name: 'Planta Norte Industrial' },
];

export const DEMO_DEVICES: DemoDevice[] = [
  {
    id: 'demo-device-1',
    customerId: 'demo-customer-1',
    name: 'SRV-DC01',
    site: 'Matriz',
    status: 'online',
    operatingSystem: 'Windows Server 2022',
    lastSeen: 'há 2 minutos',
    activeAlerts: 0,
  },
  {
    id: 'demo-device-2',
    customerId: 'demo-customer-1',
    name: 'NB-FIN-03',
    site: 'Financeiro',
    status: 'attention',
    operatingSystem: 'Windows 11 Pro',
    lastSeen: 'há 5 minutos',
    activeAlerts: 1,
  },
  {
    id: 'demo-device-3',
    customerId: 'demo-customer-1',
    name: 'SRV-FILES',
    site: 'Matriz',
    status: 'offline',
    operatingSystem: 'Windows Server 2019',
    lastSeen: 'há 2 horas',
    activeAlerts: 2,
  },
  {
    id: 'demo-device-4',
    customerId: 'demo-customer-2',
    name: 'NB-ADM-01',
    site: 'Administrativo',
    status: 'online',
    operatingSystem: 'Windows 11 Pro',
    lastSeen: 'há 1 minuto',
    activeAlerts: 0,
  },
  {
    id: 'demo-device-5',
    customerId: 'demo-customer-2',
    name: 'SRV-ERP',
    site: 'Datacenter',
    status: 'unknown',
    operatingSystem: 'Windows Server 2022',
    lastSeen: 'sem informação recente',
    activeAlerts: 0,
  },
];

export const DEMO_ALERTS: DemoAlert[] = [
  {
    id: 'AL-001',
    customerId: 'demo-customer-1',
    source: 'NB-FIN-03',
    severity: 'WARN',
    title: 'Uso de memória acima do limite recomendado',
  },
  {
    id: 'AL-002',
    customerId: 'demo-customer-1',
    source: 'SRV-FILES',
    severity: 'CRIT',
    title: 'Unidade C: com espaço livre criticamente baixo',
  },
  {
    id: 'AL-003',
    customerId: 'demo-customer-2',
    source: 'SRV-ERP',
    severity: 'INFO',
    title: 'Rotina de manutenção agendada',
  },
];

export const DEMO_DASHBOARD_METRICS: DashboardMetrics = {
  monitoredSites: 12,
  activeDevices: 148,
  risksInAttention: 9,
  criticalEvents: 2,
};
