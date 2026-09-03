import { useEffect, useRef } from "react";
import setupDesktop from "@loopress/assets/setup-desktop.mp4?url";
import setupMobile from "@loopress/assets/setup-mobile.mp4?url";
import { SectionLabel } from "./Problem";

export function Demo() {
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const pausedByUser = useRef(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Start a clip once it's at least 70% in view, pause it when it scrolls back
    // out. Skipped entirely when the reader asks for reduced motion or has paused
    // it themselves. The display:none breakpoint twin never hits the threshold.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && !reduceMotion.matches && !pausedByUser.current) {
            void video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.7 },
    );

    for (const el of videos.current) {
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  // Click toggles playback and remembers an explicit pause across scrolling.
  const togglePlayback = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.paused) {
      pausedByUser.current = false;
      void video.play().catch(() => {});
    } else {
      pausedByUser.current = true;
      video.pause();
    }
  };

  return (
    <section id="demo" className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <SectionLabel>01 · Demo</SectionLabel>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Wire Loopress into a WordPress project in under a minute.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Install the CLI, authorize in the browser, and start syncing. No SSH, no manual plugin
          upload.
        </p>

        <div className="mt-12 overflow-hidden rounded-xl border border-border/80 bg-background/60">
          {/* ponytail: both <video> tags ship; the display:none one never reaches
              the 70% threshold so it stays paused. Swap to a matchMedia picker if
              the extra fetch ever matters. */}
          <video
            ref={(el) => {
              videos.current[0] = el;
            }}
            muted
            loop
            playsInline
            preload="metadata"
            onClick={togglePlayback}
            title="Click to play or pause"
            className="hidden w-full cursor-pointer md:block"
            src={setupDesktop}
          >
            <p className="p-4 text-sm text-muted-foreground">
              Your browser can't play this video.{" "}
              <a href={setupDesktop} className="text-accent-cyan-ink">
                Download it
              </a>{" "}
              instead.
            </p>
          </video>
          <video
            ref={(el) => {
              videos.current[1] = el;
            }}
            muted
            loop
            playsInline
            preload="metadata"
            onClick={togglePlayback}
            title="Click to play or pause"
            className="mx-auto block max-h-[80vh] w-auto cursor-pointer md:hidden"
            src={setupMobile}
          >
            <p className="p-4 text-sm text-muted-foreground">
              Your browser can't play this video.{" "}
              <a href={setupMobile} className="text-accent-cyan-ink">
                Download it
              </a>{" "}
              instead.
            </p>
          </video>
        </div>
      </div>
    </section>
  );
}
