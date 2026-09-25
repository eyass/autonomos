export function Steps({ current }: { current: 0 | 1 | 2 }) {
  const steps = ["Create your company", "Tell us about the company", "Connect systems"];
  return (
    <ol className="mb-6 flex gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s} className={`flex-1 border-t-2 pt-2 ${i <= current ? "border-accent text-foreground" : "border-border text-muted"}`}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}
