// A − number + control for counting things like boxes
export default function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>−</button>
      <span>{value}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(99, value + 1))}>+</button>
    </div>
  )
}
