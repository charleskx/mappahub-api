import { z } from 'zod'

export const createCheckoutSchema = z.object({
  plan: z.enum(['monthly', 'annual']),
})

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>

export const checkoutCreditsSchema = z.object({
  packId: z.enum(['1k', '5k', '10k', '25k']),
})

export type CheckoutCreditsInput = z.infer<typeof checkoutCreditsSchema>
