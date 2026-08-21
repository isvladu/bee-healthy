import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { dietPlanRepo, recipeRepo, workoutPlanRepo } from '@/lib/db/repositories';
import { IconSearch } from './icons';

interface Hit {
  id: string;
  to: string;
  label: string;
  kind: 'Recipe' | 'Diet plan' | 'Workout';
}

const MAX_HITS = 6;

/**
 * The nav's search field. Kept deliberately small: a live substring match over
 * the three things a user actually goes looking for by name, straight from
 * Dexie so it works offline like everything else.
 */
export function QuickSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const recipes = useLiveQuery(() => recipeRepo.listByCreatedDesc(), []);
  const dietPlans = useLiveQuery(() => dietPlanRepo.listByCreatedDesc(), []);
  const workoutPlans = useLiveQuery(() => workoutPlanRepo.listByCreatedDesc(), []);

  const hits = useMemo<Hit[]>(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const all: Hit[] = [
      ...(recipes ?? []).map((r) => ({
        id: r.id,
        to: `/cookbook/${r.id}`,
        label: r.title,
        kind: 'Recipe' as const,
      })),
      ...(dietPlans ?? []).map((p) => ({
        id: p.id,
        to: `/diet/${p.id}`,
        label: p.title,
        kind: 'Diet plan' as const,
      })),
      ...(workoutPlans ?? []).map((p) => ({
        id: p.id,
        to: `/workout/${p.id}`,
        label: p.title,
        kind: 'Workout' as const,
      })),
    ];
    return all
      .filter((hit) => hit.label.toLowerCase().includes(needle))
      .slice(0, MAX_HITS);
  }, [query, recipes, dietPlans, workoutPlans]);

  // Clicking anywhere else dismisses the results.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function go(hit: Hit) {
    setQuery('');
    setOpen(false);
    navigate(hit.to);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex min-w-[220px] items-center gap-[9px] rounded-[11px] border border-line bg-card2 px-[13px] py-2 text-ink3">
        <IconSearch width={15} height={15} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && hits.length > 0) go(hits[0]);
          }}
          placeholder="Search…"
          aria-label="Search recipes and plans"
          className="w-full border-0 bg-transparent text-[13.5px] text-ink outline-0 placeholder:text-ink3"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[300px] overflow-hidden rounded-[11px] border border-line bg-card shadow-[0_10px_24px_-14px_rgba(60,40,10,.5)]">
          {hits.length === 0 ? (
            <div className="px-[13px] py-3 text-[12.5px] text-ink3">
              Nothing matches “{query.trim()}”.
            </div>
          ) : (
            hits.map((hit) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                type="button"
                onClick={() => go(hit)}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-line px-[13px] py-[9px] text-left last:border-b-0 hover:bg-card2"
              >
                <span className="truncate text-[13px] text-ink">{hit.label}</span>
                <span className="ml-auto flex-none font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink3">
                  {hit.kind}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
