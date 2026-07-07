export interface ModelOption {
  id: string;
  label: string;
  hint: string;
}

// Selectable Claude models. Default is Sonnet 4.6 — cost-effective for the routine
// parsing/macro work; Opus 4.8 is available for heavier multi-week planning.
export const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    hint: 'Balanced — recommended default',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    hint: 'Most capable — best for complex plans',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    hint: 'Fastest & cheapest',
  },
];
