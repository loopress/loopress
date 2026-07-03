export const prerender = true;

import schema from "@loopress/cli/schema/snippet";

export async function GET() {
  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
