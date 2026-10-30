import Editeur from '@/components/Editeur';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Editeur token={token} />;
}
