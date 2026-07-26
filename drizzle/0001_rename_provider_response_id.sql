-- conversations.openai_response_id was left over from the pre-Anthropic-migration
-- schema and was never written to. Renamed to match the provider-neutral field
-- now populated by the chat route.
ALTER TABLE "conversations" RENAME COLUMN "openai_response_id" TO "provider_response_id";
