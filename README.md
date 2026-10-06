# barebone-mods

Claude Code mods from [Barebone Agents](https://github.com/gveshk). Each mod is a plain Claude Code plugin you can read in a few minutes.

| Mod | What it does |
| --- | --- |
| `activity` | A live crew panel: every agent in your session, its model, effort, tokens, estimated cost and time, with a friendly pixel crab. Terminal and desktop app. |
| `token-weather` | A one-line forecast of your context window above the prompt. |

## Install

```
/plugin marketplace add gveshk/barebone-mods
/plugin install activity@barebone-mods
/plugin install token-weather@barebone-mods
/reload-plugins
```

Mods run with the same access Claude Code has, so read the code first. Neither mod here makes network calls, touches the filesystem or starts a process; the call manifest at the bottom lists every engine API the code uses. To pin what you reviewed, clone the repo at a commit and load it by hand with `claude --plugin-dir ./activity` instead of installing from the marketplace (a marketplace install tracks `main`).

Mods use Claude Code's function-hooks API, which is early access and may change. They were tested on Claude Code 2.1.291. The unit tests and a headless load pass, but the interactive panes have not yet been checked by eye in a live terminal or the desktop app; see `docs/manual-checklist.md`.

## activity

Open or close the pane with `/activity`. In a fullscreen terminal at 110 columns or wider it docks beside the transcript; otherwise it sits above the prompt. It also tries to open by itself once per flow (or per session when no flow is declared), when a flow with tasks is declared or a subagent starts. The engine seats a pane nobody asked for only at 144 columns or wider (110 once you have opened it yourself); below that it waits undrawn until you run `/activity`. In a terminal that is not fullscreen, an opened pane sits above the prompt.

What the pane lists, top to bottom:

- **main**: your own session, pinned first.
- **Running**: every subagent that is working now, each with its model, effort, estimated cost, elapsed time, tokens and context fill.
- **Finished**: a collapsible list (press its heading). It shows the newest 20 and a `+N older` line for the rest. Failures are counted in the heading (`N failed`) even while the list is collapsed.
- **Planned**: tasks a skill declared with the `flow` tool that have not started yet.

How a row is drawn:

- **Terminal**: the Barebone crab is a 17x7 `Raster` of half-block pixels. It needs a truecolor-capable terminal for exact colours and falls back to the nearest palette otherwise. It only appears when the pane body is at least 60 columns wide; a narrower pane shows the text lines only.
- **Desktop app**: every row is an SVG card with its own dark background, so it is legible on any theme. The legs and the status dot animate with CSS, and stay still when the system asks for reduced motion.

Numbers:

- "tokens" means fresh tokens processed: input plus output plus cache writes. Cache reads are left out of the count but are priced in the cost.
- Cost is an **estimate** from the price table in `activity/hooks/prices.ts`, not a bill. Documented prices exist for Fable and Mythos 5 and 5.1, Opus 5.5, Opus 5 and 4.6 to 4.8, Sonnet 5.5, 5 and 4.6, and Haiku 4.5. Cache prices are derived from the input price (reads 0.1x, writes 1.25x) except where the table cites them: cache reads are $1/MTok for Fable 5 and Mythos 5, $0.25 for Fable 5.1 and Mythos 5.1, and $0.20 for Opus 5.5 and Sonnet 5.5. A model that matches none of these uses an Opus-tier fallback price. The session total in the header comes from Claude Code itself.

The band above the prompt:

- One line with the flow title or `agents`, phase and progress, running count, tokens and estimated cost. `×N` toggles the pane.
- It shows while a flow is live (declared and not yet finished) or a subagent runs, and it stacks with other mods that draw there (`token-weather`, next-steps) instead of replacing them.
- The band disappears when a flow finishes (`finished: true`); the pane keeps showing the finished flow and its tasks. A later batch of agents shows the band again.
- `✕` hides it for the current flow. The choice is remembered per flow, and it does not delete the plan: the pane still lists the planned tasks.

Optional tools for skills:

- `mcp__activity__flow` lets a skill report a plan (title, phases, tasks, current phase, done count) and `mcp__activity__step` lets a subagent report its own progress bar. Both exist only when the `reportTools` option is not false; set it to false to leave the model's tool list untouched.

What it never does:

- Hooks only observe. They never change or block a tool call, a spawn or a turn, and the two registered tools answer only their own calls.
- No network, no filesystem access and no process spawning anywhere in either mod.

## Credits and licenses

MIT. The `activity` plugin is derived from `savvy-progress` in [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit) (commit `272a877`), MIT, Copyright (c) 2026 johnnyvizz; see `NOTICE`. The crab mascot and all artwork in this repository are original and are not taken from that project.

## Call manifest

Output of `claude plugin validate`, listing each hook and engine call a plugin makes:
```text
Validating hooks: activity/hooks/hooks.json

  ❯ ./register.tsx hooks: session.start, command.run{command=activity}, tool.call{tool=mcp__activity__flow}, tool.call{tool=mcp__activity__step}, agent.spawn, turn.step, turn.complete, ui.render{component=AbovePrompt}, ui.render{component=Pane, requestId=activity}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=mcp__activity__flow}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=mcp__activity__step}
  ❯ ./register.tsx gating hook without .catch: agent.spawn
  ❯ ./register.tsx calls: $.clock.every, $.clock.now, $.command.register, $.session.model, $.session.usage, $.state.get, $.state.set, $.tool.register, $.ui.close (via togglePane), $.ui.open (via autoOpen, togglePane), $.ui.panes (via togglePane), $.ui.resolve
  ❯ ./register.tsx state writes: activity.crew, activity.flow, activity.now, activity.panel
  ❯ ./register.tsx state reads: activity.crew, activity.flow, activity.now, activity.panel

✔ Validation passed

Validating hooks: token-weather/hooks/hooks.json

  ❯ ./register.tsx hooks: session.start, turn.complete, ui.render{component=AbovePrompt}
  ❯ ./register.tsx calls: $.session.usage (via takeReading), $.state.get, $.state.set, $.ui.resolve
  ❯ ./register.tsx state writes: token-weather.readings
  ❯ ./register.tsx state reads: token-weather.readings

✔ Validation passed
```
