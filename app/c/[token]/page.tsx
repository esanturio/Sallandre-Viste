import StaffPage from '@/components/StaffPage';

export const metadata = { title: 'Sallandre · Espace gardien' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <StaffPage token={token} role="concierge" />;
}
