-- Add whatsappAccountId to ChatConversation for staff AI chat via WhatsApp
ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "whatsappAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "ChatConversation_companyId_userId_whatsappAccountId_idx"
  ON "ChatConversation"("companyId", "userId", "whatsappAccountId");
