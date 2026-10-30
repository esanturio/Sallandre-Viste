import StaffPage from '@/components/StaffPage';

export const metadata = { title: 'Sallandre · Administration' };

export default async function Page({ params }: { params: Promise<{ token: string; op: string }> }) {
  const { token, op } = await params;
  return <StaffPage token={token} opId={op} role="admin" />;
}
