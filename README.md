# OpenPath — Library of Congress demo

OpenPath helps event organizers explore how simulated obstacles affect step-free access. This interactive demonstration uses a cropped Library of Congress ground-floor visitor map.

## Try the demo

The initial scenario has two of four modeled destinations reachable. Move or drag the simulated check-in table to reveal two additional routes. Select a destination for its modeled route and suggested action. Simulate an elevator outage or a cloakroom obstruction, compare the results, and reset the scenario.

The [full OpenPath planner](https://openpath-campus-planner.santipabtongchan.chatgpt.site/) supports uploading a floor-plan image and adding pins and routes. It is a separate application hosted on Sites. The AI floor-plan reader has been tested separately and is not part of the live demo.

## Run locally

Requires Node.js 20.19 or later (or 22.12 or later).

```sh
npm ci
npm run dev
```

Run `npm run build` to type-check and build the static site in `dist/`.

## Limitations

The floor plan is real, but the routes, check-in table, elevator outage, and cloakroom obstruction are simulated. Reachability is a planning estimate based on the modeled scenario, not an on-site accessibility assessment. Verify routes and measurements with wheelchair users before an event.

## Credits

The map is cropped from the [Library of Congress Thomas Jefferson Building ground-floor visitor map](https://www.loc.gov/visit/maps-and-floor-plans/thomas-jefferson-building/ground-floor/). Third-party notices for dependencies and assets are in `public/licenses/THIRD_PARTY_NOTICES.txt`.
