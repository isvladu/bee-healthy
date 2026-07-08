// API structured-output schema for parsing a raw workout string.
// Constraint-free (sent to the API): flat numeric fields, 0 where not applicable.
import { z } from 'zod/v4';

const ExerciseSchema = z.object({
  name: z.string(),
  type: z.enum(['strength', 'cardio']),
  sets: z.number(), // number of sets (0 for cardio)
  reps: z.number(), // reps per set (0 for cardio)
  weightKg: z.number(), // 0 for bodyweight / cardio
  durationMin: z.number(), // 0 for strength
});

const SessionSchema = z.object({
  title: z.string(),
  exercises: z.array(ExerciseSchema),
});

const WeekSchema = z.object({
  weekNumber: z.number(),
  sessions: z.array(SessionSchema),
});

export const ParsedWorkoutSchema = z.object({
  title: z.string(),
  weeks: z.array(WeekSchema),
});

export type ParsedWorkoutAI = z.infer<typeof ParsedWorkoutSchema>;
