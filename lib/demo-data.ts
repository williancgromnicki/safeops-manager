export type DemoCustomer = {
  id: string;
  name: string;
};

export type DemoDevice = {
  id: string;
  customerId: string;
  name: string;
  site: string;
  status: 'Saudável' | 'Atenção' | 'Crítico';
};

export type DemoAlert = {
  id: string;
  customerId: string;
  source: string;
  severity: 'INFO' | 'WARN' | 'CRIT';
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
  { id: 'demo-device-1', customerId: 'demo-customer-1', name: 'Sensor Pressão 01', site: 'Planta Sul', status: 'Saudável' },
  { id: 'demo-device-2', customerId: 'demo-customer-2', name: 'PLC Linha B', site: 'Planta Norte', status: 'Atenção' },
  { id: 'demo-device-3', customerId: 'demo-customer-1', name: 'Gateway OPC', site: 'Refinaria Leste', status: 'Crítico' },
];

export const DEMO_ALERTS: DemoAlert[] = [
  { id: 'AL-001', customerId: 'demo-customer-1', source: 'Sensor Pressão 01', severity: 'WARN', title: 'Oscilação de pressão acima do limite' },
  { id: 'AL-002', customerId: 'demo-customer-1', source: 'Gateway OPC', severity: 'CRIT', title: 'Perda de conectividade com barramento' },
  { id: 'AL-003', customerId: 'demo-customer-2', source: 'Servidor Historiador', severity: 'INFO', title: 'Rotina de manutenção agendada' },
];

export const DEMO_DASHBOARD_METRICS: DashboardMetrics = {
  monitoredSites: 12,
  activeDevices: 148,
  risksInAttention: 9,
  criticalEvents: 2,
};
