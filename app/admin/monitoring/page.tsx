import { MonitoringPanel } from '@/components/MonitoringPanel';

type MonitoringPageProps = {
  searchParams?: Promise<{
    customerId?: string | string[];
  }>;
};

function getSingleParam(value?: string | string[]): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function MonitoringPage({
  searchParams,
}: MonitoringPageProps) {
  const params = await searchParams;
  const customerId = getSingleParam(params?.customerId);

  return <MonitoringPanel customerId={customerId} />;
}
