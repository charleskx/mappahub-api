ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
-- Invalida todos os refresh tokens existentes: com hash ativo, lookup por texto puro não funciona mais
UPDATE "refresh_tokens" SET "revoked_at" = NOW() WHERE "revoked_at" IS NULL;--> statement-breakpoint
-- Limpa tokens de verificação/reset em texto puro: usuários reenviam o e-mail normalmente
UPDATE "users" SET
  "email_verify_token" = NULL,
  "email_verify_expires_at" = NULL,
  "reset_password_token" = NULL,
  "reset_password_expires_at" = NULL
WHERE "email_verify_token" IS NOT NULL OR "reset_password_token" IS NOT NULL;