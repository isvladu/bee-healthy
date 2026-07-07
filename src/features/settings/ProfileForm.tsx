import { useState } from 'react';
import { Card } from '@/components/Card';
import { Field, NumberInput, Segmented, Select } from '@/components/form';
import { bodyMetricsRepo, settingsRepo } from '@/lib/db/repositories';
import type {
  ActivityLevel,
  AppSettings,
  Goal,
  Sex,
  Units,
} from '@/lib/db/types';
import {
  ACTIVITY_LABELS,
  computeEnergy,
  GOAL_LABELS,
  type EnergyInputs,
} from '@/lib/nutrition/energy';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, round1 } from '@/lib/units';

interface FormState {
  units: Units;
  sex: Sex | '';
  age: number | undefined;
  heightCm: number | undefined;
  weightKg: number | undefined;
  activityLevel: ActivityLevel | '';
  goal: Goal | '';
}

function initialState(settings: AppSettings): FormState {
  return {
    units: settings.units,
    sex: settings.sex ?? '',
    age: settings.age,
    heightCm: settings.heightCm,
    weightKg: settings.weightKg,
    activityLevel: settings.activityLevel ?? '',
    goal: settings.goal ?? '',
  };
}

function parseNum(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProfileForm({ settings }: { settings: AppSettings }) {
  const [form, setForm] = useState<FormState>(() => initialState(settings));
  const [saved, setSaved] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const energyInputs: EnergyInputs = {
    sex: form.sex || undefined,
    age: form.age,
    heightCm: form.heightCm,
    weightKg: form.weightKg,
    activityLevel: form.activityLevel || undefined,
    goal: form.goal || undefined,
  };
  const energy = computeEnergy(energyInputs);

  async function handleSave() {
    await settingsRepo.update({
      units: form.units,
      sex: form.sex || undefined,
      age: form.age,
      heightCm: form.heightCm,
      weightKg: form.weightKg,
      activityLevel: form.activityLevel || undefined,
      goal: form.goal || undefined,
      onboardingComplete: energy !== null,
    });
    if (form.weightKg != null) {
      await bodyMetricsRepo.upsertForDate(todayIso(), { weightKg: form.weightKg });
    }
    setSaved(true);
  }

  const ftIn = form.heightCm != null ? cmToFtIn(form.heightCm) : undefined;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-honey-800">Your details</h3>
        <Segmented<Units>
          value={form.units}
          onChange={(units) => set('units', units)}
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'imperial', label: 'Imperial' },
          ]}
        />
      </div>

      <Field label="Sex">
        <Select
          value={form.sex}
          onChange={(e) => set('sex', e.target.value as Sex | '')}
        >
          <option value="">Select…</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
      </Field>

      <Field label="Age">
        <NumberInput
          value={form.age ?? ''}
          min={0}
          onChange={(e) => set('age', parseNum(e.target.value))}
        />
      </Field>

      <Field label="Height">
        {form.units === 'metric' ? (
          <NumberInput
            value={form.heightCm ?? ''}
            min={0}
            placeholder="cm"
            onChange={(e) => set('heightCm', parseNum(e.target.value))}
          />
        ) : (
          <div className="flex gap-2">
            <NumberInput
              value={ftIn?.ft ?? ''}
              min={0}
              placeholder="ft"
              aria-label="Height (feet)"
              onChange={(e) =>
                set('heightCm', ftInToCm(parseNum(e.target.value) ?? 0, ftIn?.inch ?? 0))
              }
            />
            <NumberInput
              value={ftIn?.inch ?? ''}
              min={0}
              max={11}
              placeholder="in"
              aria-label="Height (inches)"
              onChange={(e) =>
                set('heightCm', ftInToCm(ftIn?.ft ?? 0, parseNum(e.target.value) ?? 0))
              }
            />
          </div>
        )}
      </Field>

      <Field label={`Weight (${form.units === 'metric' ? 'kg' : 'lb'})`}>
        <NumberInput
          value={
            form.weightKg == null
              ? ''
              : round1(form.units === 'metric' ? form.weightKg : kgToLb(form.weightKg))
          }
          min={0}
          onChange={(e) => {
            const n = parseNum(e.target.value);
            set(
              'weightKg',
              n == null ? undefined : form.units === 'metric' ? n : lbToKg(n),
            );
          }}
        />
      </Field>

      <Field label="Activity level">
        <Select
          value={form.activityLevel}
          onChange={(e) => set('activityLevel', e.target.value as ActivityLevel | '')}
        >
          <option value="">Select…</option>
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
            <option key={level} value={level}>
              {ACTIVITY_LABELS[level]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Goal">
        <Select
          value={form.goal}
          onChange={(e) => set('goal', e.target.value as Goal | '')}
        >
          <option value="">Select…</option>
          {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => (
            <option key={goal} value={goal}>
              {GOAL_LABELS[goal]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-xl bg-honey-50 p-3 text-sm text-honey-800">
        {energy ? (
          <>
            Maintenance ~<strong>{energy.tdee.toLocaleString()}</strong> kcal/day ·
            target <strong>{energy.target.toLocaleString()}</strong> kcal/day
          </>
        ) : (
          'Fill in your details to see your estimated calorie target.'
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98]"
        >
          Save profile
        </button>
        {saved && (
          <span className="text-sm font-medium text-green-600" role="status">
            Saved ✓
          </span>
        )}
      </div>
    </Card>
  );
}
