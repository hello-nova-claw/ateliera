const meanings = [
  ['foundations', 'Foundations'], ['vision', 'Vision'], ['growth', 'Growth'],
  ['reflection', 'Reflection'], ['celebration', 'Celebration'], ['uncharted', 'Uncharted'],
] as const;

export function Legend() {
  return (
    <footer className="foyer-legend">
      <p className="studio-visually-hidden">Semantic legend</p>
      <ul aria-label="Ateliera meanings">
        {meanings.map(([meaning, label]) => <li key={meaning}><span aria-hidden="true" className={`foyer-legend__heart foyer-legend__heart--${meaning}`}>♥</span>{label}</li>)}
      </ul>
    </footer>
  );
}
