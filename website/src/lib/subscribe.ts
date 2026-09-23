import { getBrevoClient } from "./brevo";

export async function subscribeEmail(email: string) {
  const brevo = getBrevoClient();

  const res = await brevo.contacts.createContact({ email });

  if (!res?.id) {
    throw new Error(`Brevo error: no id returned`);
  }
}
