import { z } from 'zod'

export const updateSettingsSchema = z.object({
  defaultMapZoom: z.number().int().min(1).max(21).optional(),
  defaultMapLat: z.number().optional(),
  defaultMapLng: z.number().optional(),
  publicMapEnabled: z.boolean().optional(),
  brandLogoUrl: z.string().url().max(500).nullable().optional(),
  brandName: z.string().max(200).nullable().optional(),
  brandWebsiteUrl: z.string().url().max(500).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  brandFooterText: z.string().max(300).nullable().optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
