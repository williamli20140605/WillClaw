interface HostActionResultCardProps {
  hostActionResult: string;
}

export function HostActionResultCard({
  hostActionResult,
}: HostActionResultCardProps) {
  if (!hostActionResult) {
    return null;
  }

  return (
    <article className="host-result-card">
      <div className="section-header">
        <h3>Last Host Result</h3>
        <span>JSON / text</span>
      </div>
      <pre className="host-result">{hostActionResult}</pre>
    </article>
  );
}
