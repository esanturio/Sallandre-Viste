import AdminHome from '@/components/AdminHome';

export const metadata = { title: 'Sallandre · Administration' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AdminHome token={token} />;
}
