import { SectionLabel } from "./Problem";
import { WorkflowDiagram } from "./WorkflowDiagram";

export function Solution() {
  return (
    <section id="solution" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>03 · The Solution</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          One CLI. One plugin. Every workflow.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Pull config to files, review it in Git, push it back. The same loop for snippets, plugins,
          pages, and Composer.
        </p>

        <div className="mt-12">
          <WorkflowDiagram />
        </div>
      </div>
    </section>
  );
}
