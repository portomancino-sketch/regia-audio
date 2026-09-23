// Lo sfondo vivo: quattro macchie di colore sfocate + un velo di grana.
// Sul Mac derivano lentamente; sul telefono sono ferme (batteria).
export function Sfondo(props: { animato?: boolean }) {
  return (
    <div aria-hidden className={`sfondo-mesh ${props.animato ? "sfondo-animato" : ""}`}>
      <div className="macchia macchia-1" />
      <div className="macchia macchia-2" />
      <div className="macchia macchia-3" />
      <div className="macchia macchia-4" />
      <div className="grana" />
    </div>
  );
}
