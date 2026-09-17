import { BrevoClient } from "@getbrevo/brevo";

export function getBrevoClient() {
  return new BrevoClient({
    apiKey: process.env.BREVO_API_KEY!,
  });
}
