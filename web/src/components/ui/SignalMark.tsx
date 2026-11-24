export function SignalMark({ className = "" }: { className?: string }) {
  return (
    <span className={`signal-mark ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}