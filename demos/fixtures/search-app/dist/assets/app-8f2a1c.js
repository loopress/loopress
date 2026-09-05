// A tiny hand-written "search feature" SPA. No build step: it is already the built output
// `lps app push` ships. Mounts on the element the [loopress_app] shortcode renders.
//
// `loopress.app.json` pins `mountSelector` to a fixed id, so this never has to read the
// name-derived `window.loopressApp_<name>` global: the demo script pushes under a unique,
// timestamped app name (see demos/apps-in-a-page.demo.ts) so re-runs can never collide with
// or delete an app someone else deployed, but the mount point stays constant either way.
const ITEMS = [
  { title: "Reproducible WordPress environments", tag: "guide" },
  { title: "Sync ACF field groups as JSON", tag: "acf" },
  { title: "Version-control code snippets", tag: "snippets" },
  { title: "Install Composer packages without SSH", tag: "composer" },
  { title: "Custom REST API routes from Git", tag: "api" },
  { title: "Ship a single-page app into a page", tag: "apps" },
  { title: "Push menus between environments", tag: "menus" },
  { title: "GitHub Actions and GitLab CI configs", tag: "ci" },
];

const root = document.querySelector("#loopress-demo-search");

root.innerHTML = `
  <div class="sa">
    <input class="sa-input" type="search" placeholder="Search the docs…" autocomplete="off" />
    <ul class="sa-list"></ul>
    <p class="sa-empty" hidden>No match.</p>
  </div>
`;

const input = root.querySelector(".sa-input");
const list = root.querySelector(".sa-list");
const empty = root.querySelector(".sa-empty");

function render(query) {
  const needle = query.trim().toLowerCase();
  const hits = needle
    ? ITEMS.filter((i) => i.title.toLowerCase().includes(needle) || i.tag.includes(needle))
    : ITEMS;
  list.innerHTML = hits
    .map((i) => `<li class="sa-item"><span>${i.title}</span><code>${i.tag}</code></li>`)
    .join("");
  empty.hidden = hits.length > 0;
}

input.addEventListener("input", () => render(input.value));
render("");
