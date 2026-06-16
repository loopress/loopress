import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { z } from "zod";

import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactSchema, sendContactEmail } from "@/lib/contact";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact - WordPress DX" },
      { name: "description", content: "Get in touch with the WordPress DX team." },
    ],
  }),
  component: ContactPage,
});

type ContactFormValues = z.infer<typeof contactSchema>;

function ContactPage() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });

  async function onSubmit(values: ContactFormValues) {
    setStatus("idle");
    try {
      await sendContactEmail({ data: values });
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="mx-auto max-w-xl px-6 py-24">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Contact</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A question, a partnership request, or a trademark inquiry? Send us a message and we will
            get back to you.
          </p>
        </div>

        {status === "success" ? (
          <div className="rounded-md border border-border bg-card/60 px-6 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Message sent.</p>
            <p className="mt-1 text-sm text-muted-foreground">We will reply as soon as possible.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-6"
              onClick={() => setStatus("idle")}
            >
              Send another message
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Trademark usage request" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your request..."
                        rows={6}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {status === "error" && (
                <p className="text-sm text-destructive">
                  Something went wrong. Please try again or reach out directly.
                </p>
              )}

              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                {form.formState.isSubmitting ? "Sending..." : "Send message"}
              </Button>
            </form>
          </Form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          For trademark or brand asset requests, see the{" "}
          <Link to="/brand-assets" className="underline underline-offset-2 hover:text-foreground">
            usage policy
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}