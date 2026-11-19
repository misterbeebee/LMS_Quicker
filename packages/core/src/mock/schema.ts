import { z } from 'zod';

/**
 * Structured offline datastore schema capturing all Canvas LMS and StudentVUE/ParentVUE
 * endpoints supported by Velm. Generated once by the account downloader CLI and replayed
 * by `createMockDatastoreBackend` for offline UI previews, unit tests, and E2E testing.
 */
export const VelmMockCanvasStoreSchema = z.object({
  domain: z.string().min(1),
  self: z.record(z.string(), z.unknown()).nullable(),
  profile: z.record(z.string(), z.unknown()).nullable(),
  courses: z.array(z.record(z.string(), z.unknown())),
  courseNicknames: z.array(z.record(z.string(), z.unknown())),
  todo: z.array(z.record(z.string(), z.unknown())),
  upcomingEvents: z.array(z.record(z.string(), z.unknown())),
  announcements: z.array(z.record(z.string(), z.unknown())),
  courseDetailsById: z.record(z.string(), z.record(z.string(), z.unknown())),
  enrollmentsByCourseId: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  assignmentsByCourseId: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  assignmentGroupsByCourseId: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  modulesByCourseId: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type VelmMockCanvasStore = z.infer<typeof VelmMockCanvasStoreSchema>;

export const VelmMockSynergyStoreSchema = z.object({
  domain: z.string().min(1),
  isParent: z.boolean().default(false),
  data: z.record(z.string(), z.record(z.string(), z.unknown())),
  errors: z.record(z.string(), z.string()).default({}),
});

export type VelmMockSynergyStore = z.infer<typeof VelmMockSynergyStoreSchema>;

export const VelmMockDatastoreV1Schema = z.object({
  version: z.literal(1),
  recordedAt: z.string(),
  sanitized: z.boolean(),
  canvas: VelmMockCanvasStoreSchema.optional(),
  synergy: VelmMockSynergyStoreSchema.optional(),
  scrapeErrors: z.record(z.string(), z.string()).default({}),
});

export type VelmMockDatastoreV1 = z.infer<typeof VelmMockDatastoreV1Schema>;
