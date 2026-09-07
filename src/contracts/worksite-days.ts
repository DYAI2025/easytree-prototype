import { z } from "zod";

import { LocalDateSchema, LocalTimeSchema } from "./common";

/** Monatsansicht und Tagesdetail als Lesevertraege (REQ-A-003). */
export const MonthCardSchema = z.object({
  worksiteDayId: z.uuid(),
  date: LocalDateSchema,
  engagementId: z.uuid(),
  title: z.string(),
  colourKey: z.string(),
  worksiteName: z.string(),
  employeeCount: z.number().int().min(0),
  resourceCount: z.number().int().min(0),
  revisionNo: z.number().int().min(1),
  origin: z.enum(["materialized", "day_edit", "series_edit"]),
});

export const SpanSegmentSchema = z.object({
  engagementId: z.uuid(),
  rowIndex: z.number().int().min(0),
  startCol: z.number().int().min(1).max(7),
  endCol: z.number().int().min(1).max(7),
  continuesLeft: z.boolean(),
  continuesRight: z.boolean(),
});

export const MonthPlanningViewSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  today: LocalDateSchema,
  weeks: z.array(
    z.object({
      isoWeek: z.number().int().min(1).max(53),
      days: z.array(z.object({ date: LocalDateSchema, inMonth: z.boolean() })).length(7),
    }),
  ),
  cards: z.array(MonthCardSchema),
  spans: z.array(SpanSegmentSchema),
});

export const WorksiteDayDetailSchema = z.object({
  worksiteDayId: z.uuid(),
  localDate: LocalDateSchema,
  engagementId: z.uuid(),
  engagementTitle: z.string(),
  colourKey: z.string(),
  worksiteName: z.string(),
  customerName: z.string(),
  revisionNo: z.number().int().min(1),
  origin: z.enum(["materialized", "day_edit", "series_edit"]),
  plannedStartTime: LocalTimeSchema.nullable(),
  plannedEndTime: LocalTimeSchema.nullable(),
  note: z.string().nullable(),
  employees: z.array(z.object({ id: z.uuid(), displayName: z.string() })),
  resources: z.array(z.object({ id: z.uuid(), name: z.string(), kind: z.string() })),
});

export const SeriesPreviewSchema = z.object({
  engagementId: z.uuid(),
  fromDate: LocalDateSchema,
  rows: z.array(
    z.object({
      worksiteDayId: z.uuid(),
      date: LocalDateSchema,
      origin: z.enum(["materialized", "day_edit", "series_edit"]),
      status: z.enum(["unchanged", "adjusted_excluded", "adjusted_included", "past_locked"]),
    }),
  ),
  targetIds: z.array(z.uuid()),
  adjustedCount: z.number().int().min(0),
});

export type MonthPlanningViewDto = z.infer<typeof MonthPlanningViewSchema>;
export type WorksiteDayDetailDto = z.infer<typeof WorksiteDayDetailSchema>;
export type SeriesPreviewDto = z.infer<typeof SeriesPreviewSchema>;
