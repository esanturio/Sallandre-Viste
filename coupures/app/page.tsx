export default function Home() {
  return (
    <div className="wrap narrow" style={{ paddingTop: 80, textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-sallandre.png" alt="Sallandre" style={{ width: 240, maxWidth: '70%' }} />
      <div className="card" style={{ marginTop: 32 }}>
        <h2>Avis de coupure d’eau</h2>
        <p className="muted" style={{ margin: 0 }}>Pour consulter un avis, utilisez le lien qui vous a été envoyé.</p>
      </div>
    </div>
  );
}
