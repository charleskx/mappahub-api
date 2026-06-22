import type Stripe from 'stripe'
import { env } from '../../config/env'
import { stripe } from '../../config/stripe'
import { AppError } from '../../shared/errors'
import { sendMail, trialExpiringHtml } from '../../shared/mailer'
import { geocodingCreditsRepository } from '../geocoding/geocoding-credits.repository'
import { findPack, GEO_PACKS } from '../geocoding/geocoding.limits'
import { billingRepository } from './billing.repository'
import type { CheckoutCreditsInput, CreateCheckoutInput } from './billing.schema'

const PRICE_MAP: Record<string, string | undefined> = {
  monthly: env.STRIPE_PRICE_MONTHLY,
  annual: env.STRIPE_PRICE_ANNUAL,
}

/** Garante (criando se preciso) o Stripe customer do tenant e devolve seu id. */
async function ensureCustomerId(tenantId: string): Promise<string> {
  const sub = await billingRepository.findSubscriptionByTenantId(tenantId)
  if (!sub) throw new AppError('SUBSCRIPTION_NOT_FOUND', 404, 'Assinatura não encontrada')
  if (sub.stripeCustomerId) return sub.stripeCustomerId

  const tenant = await billingRepository.findTenantById(tenantId)
  const owner = await billingRepository.findTenantOwner(tenantId)
  const customer = await stripe.customers.create({
    name: tenant?.name,
    email: owner?.email,
    metadata: { tenantId },
  })
  await billingRepository.updateSubscription(tenantId, { stripeCustomerId: customer.id })
  return customer.id
}

export const billingService = {
  async getSubscription(tenantId: string) {
    const sub = await billingRepository.findSubscriptionByTenantId(tenantId)
    if (!sub) throw new AppError('SUBSCRIPTION_NOT_FOUND', 404, 'Assinatura não encontrada')
    return sub
  },

  async createCheckoutSession(tenantId: string, input: CreateCheckoutInput) {
    if (!env.STRIPE_SECRET_KEY) throw new AppError('STRIPE_NOT_CONFIGURED', 500, 'Stripe não configurado')

    const priceId = PRICE_MAP[input.plan]
    if (!priceId) throw new AppError('PLAN_NOT_CONFIGURED', 400, 'Plano não configurado')

    const customerId = await ensureCustomerId(tenantId)

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/billing?success=1`,
      cancel_url: `${env.APP_URL}/billing?canceled=1`,
      metadata: { tenantId },
    })

    return { url: session.url }
  },

  // Catálogo de pacotes de créditos extras de geocoding (para exibição no front)
  listCreditPacks() {
    return GEO_PACKS.map(({ id, credits, validityDays, priceCents }) => ({
      id,
      credits,
      validityDays,
      priceCents,
    }))
  },

  async createCreditsCheckoutSession(tenantId: string, input: CheckoutCreditsInput) {
    if (!env.STRIPE_SECRET_KEY) throw new AppError('STRIPE_NOT_CONFIGURED', 500, 'Stripe não configurado')

    const pack = findPack(input.packId)
    if (!pack?.priceId) throw new AppError('PACK_NOT_CONFIGURED', 400, 'Pacote não configurado')

    const customerId = await ensureCustomerId(tenantId)

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: pack.priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/geocoding-logs?credits=success`,
      cancel_url: `${env.APP_URL}/geocoding-logs?credits=canceled`,
      metadata: { tenantId, packId: pack.id },
    })

    return { url: session.url }
  },

  async createPortalSession(tenantId: string) {
    const sub = await billingRepository.findSubscriptionByTenantId(tenantId)
    if (!sub?.stripeCustomerId) {
      throw new AppError('NO_STRIPE_CUSTOMER', 400, 'Nenhuma assinatura ativa encontrada')
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${env.APP_URL}/billing`,
    })

    return { url: session.url }
  },

  async handleWebhookEvent(rawBody: Buffer, signature: string) {
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) throw new AppError('WEBHOOK_NOT_CONFIGURED', 500, 'Webhook não configurado')

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', 400, 'Assinatura inválida')
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const tenantId = session.metadata?.tenantId
        if (!tenantId) break

        // Compra avulsa de pacote de créditos extras de geocoding
        if (session.mode === 'payment' && session.metadata?.packId) {
          const pack = findPack(session.metadata.packId)
          if (!pack) break
          const expiresAt = new Date(Date.now() + pack.validityDays * 24 * 60 * 60 * 1000)
          await geocodingCreditsRepository.grantPack(tenantId, {
            quantity: pack.credits,
            expiresAt,
            stripeSessionId: session.id,
            amountCents: session.amount_total ?? pack.priceCents,
          })
          break
        }

        if (!session.subscription) break

        const stripeSub = await stripe.subscriptions.retrieve(String(session.subscription))
        const priceId = stripeSub.items.data[0]?.price.id
        const planType = priceId === env.STRIPE_PRICE_ANNUAL ? 'annual' : 'monthly'

        await billingRepository.updateSubscription(tenantId, {
          stripeSubscriptionId: String(session.subscription),
          status: 'active',
          planType,
          currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        })
        break
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        const tenantRow = await billingRepository.findTenantByStripeCustomerId(
          String(stripeSub.customer),
        )
        if (!tenantRow) break

        const item = stripeSub.items.data[0]
        const priceId = item?.price.id
        const planType = priceId === env.STRIPE_PRICE_ANNUAL ? 'annual' : 'monthly'

        await billingRepository.updateSubscription(tenantRow.tenantId, {
          status: stripeSub.status,
          planType,
          currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        })
        break
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const tenantRow = await billingRepository.findTenantByStripeCustomerId(
          String(stripeSub.customer),
        )
        if (!tenantRow) break

        await billingRepository.updateSubscription(tenantRow.tenantId, {
          status: 'canceled',
          canceledAt: new Date(),
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const tenantRow = await billingRepository.findTenantByStripeCustomerId(
          String(invoice.customer),
        )
        if (!tenantRow) break

        await billingRepository.updateSubscription(tenantRow.tenantId, { status: 'past_due' })
        break
      }
    }
  },

  async checkExpiringTrials(daysFromNow: number) {
    const target = new Date()
    target.setDate(target.getDate() + daysFromNow)

    const expiring = await billingRepository.findExpiringTrials(target)

    await Promise.allSettled(
      expiring.map(row =>
        sendMail({
          to: row.ownerEmail,
          subject: `Seu trial do MappaHub expira em ${daysFromNow} ${daysFromNow === 1 ? 'dia' : 'dias'}`,
          html: trialExpiringHtml(row.tenantName, daysFromNow, env.APP_URL),
        }),
      ),
    )

    return expiring.length
  },
}
