// Placeholder until the UI phase. The backend lives under app/api/.
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>OmniRadar</h1>
      <p>Backend is running. The UI will be built after the API is verified.</p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
