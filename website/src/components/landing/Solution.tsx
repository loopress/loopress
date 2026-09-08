import { SectionLabel } from "./Problem";
import { WorkflowDiagram } from "./WorkflowDiagram";

export function Solution() {
  return (
    <section id="solution" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>03 · The Solution</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Declare the desired state. Loopress reconciles.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A versioned file describes how a resource should look: a hook, a plugin version, a
          Composer dependency, an API route, an app bundle. Loopress diffs that file against the
          live site and applies only what changed. The same loop for every resource, and never your
          content or your database.
        </p>

        <div className="mt-12">
          <WorkflowDiagram />
        </div>
      </div>
    </section>
  );
}
