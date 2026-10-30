export default function Home() {
  return (
    <div className="wrap narrow" style={{ paddingTop: 80, textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-sallandre.png" alt="Sallandre Helios 360" style={{ width: 240, maxWidth: '70%' }} />
      <div className="card" style={{ marginTop: 32 }}>
        <h2>Prise de rendez-vous</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pour réserver votre créneau de visite, utilisez le lien ou le QR code communiqué par votre gardien ou affiché dans votre immeuble.
        </p>
      </div>
    </div>
  );
}
