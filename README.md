# SpecSight case study

Interactive case study for SpecSight, a VS Code companion that verifies AI-generated code against a task's specs before peer review. UX research and design, GD 503 Design Studio, Fall 2026.

A plain static site: no build step.

- `index.html`, `site.js`, `screens.json`: the case study
- `assets/`: maps, wireframe screens, feature clips and images
- `demo.html`: the working SpecSight prototype, embedded in the "Try it" section

## Run locally

Open the folder with any static server, for example `python3 -m http.server`, then visit http://localhost:8000.

## Host on Netlify

Add a new site from this repository. Leave the build command empty and set the publish directory to the repository root (`.`).
