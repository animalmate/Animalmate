---
name: animalmate-design
description: Use this skill to generate well-branded interfaces and assets for 애니멀메이트(AnimalMate), a university animal-volunteer club operations web app. Contains design tokens, colors, type, fonts, logo assets, and a React/Tailwind-ready component + screen library for prototyping or production.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code (React + Tailwind), depending on the need.

Key facts:
- Mobile-first (360px), Korean UI, 해요체 tone, warm & friendly but operationally clear.
- Brand colors from the club logo: blue #5588D2 (primary), coral #EE5A60 (danger/accent), amber #F0A72A (pending). Cream #FAF6EE background, warm-grey ink neutrals.
- Font: Pretendard Variable. Big rounded corners (buttons 12px, cards 16px), warm soft shadows, 44px+ touch targets.
- Design tokens live in tokens/*.css (imported by styles.css) and map 1:1 to a Tailwind config.
- Rendering note: the self-contained HTML kits force Babel transform explicitly (a bootstrap script at end of body transforms #app), because the preview does not auto-run text/babel scripts. Keep that pattern when authoring new standalone kits here.
