import { WindowsUpdatesPanel } from '@/components/WindowsUpdatesPanel';

type WindowsUpdatesPageProps = {
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

export default async function WindowsUpdatesPage({
  searchParams,
}: WindowsUpdatesPageProps) {
  const params = await searchParams;
  const customerId = getSingleParam(params?.customerId);

  return <WindowsUpdatesPanel customerId={customerId} />;
}
