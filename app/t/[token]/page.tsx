import TechPage from '@/components/TechPage';

export const metadata = { title: 'Sallandre · Espace technicien' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TechPage token={token} />;
}
