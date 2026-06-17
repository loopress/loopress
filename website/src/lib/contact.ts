import { BrevoClient } from "@getbrevo/brevo";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export const sendContactEmail = createServerFn({ method: "POST" })
  .inputValidator(contactSchema)
  .handler(async ({ data }) => {
    const brevo = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY!,
    });

    await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: "Loopress Contact", email: "noreply@loopress.dev" },
      to: [{ email: process.env.CONTACT_EMAIL!, name: "Maxime Blanc" }],
      replyTo: { email: data.email, name: data.name },
      subject: `[Contact] ${data.subject}`,
      htmlContent: `
        <p><strong>From:</strong> ${data.name} (${data.email})</p>
        <p><strong>Subject:</strong> ${data.subject}</p>
        <hr />
        <p>${data.message.replace(/\n/g, "<br />")}</p>
      `,
    });

    return { ok: true };
  });
