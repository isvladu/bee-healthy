import type { ReactNode } from 'react';
import { Card } from '@/components/Card';

export function PagePlaceholder({
  title,
  description,
  phase,
  children,
}: {
  title: string;
  description: string;
  phase: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-honey-800">{title}</h2>
        <p className="mt-1 text-sm text-honey-900/60">{description}</p>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-full bg-honey-100 px-2.5 py-1 text-xs font-semibold text-honey-700">
            {phase}
          </span>
          <p className="text-sm text-honey-900/70">
            This screen is scaffolded. Feature work lands in the phase noted above —
            see the implementation plan for details.
          </p>
        </div>
        {children}
      </Card>
    </section>
  );
}
