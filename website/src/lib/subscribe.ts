import { BrevoClient } from "@getbrevo/brevo";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const subscribe = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const brevo = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY!,
    });

    try {
      const res = await brevo.contacts.createContact({
        email: data.email,
      });

      if (!res?.id) {
        throw new Error(`Brevo error ${res?.id}`);
      }

      return { ok: true };
    } catch (error) {
      console.error(error);
    }
  });
