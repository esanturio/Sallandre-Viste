import TenantPage from '@/components/TenantPage';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TenantPage token={token} />;
}
