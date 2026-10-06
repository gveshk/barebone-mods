# Manual checklist (run in a real Claude Code, not under test)

## Automated checks already done

- Unit tests: `claude plugin test ./activity` gives 113 pass, 0 fail (8 files); `claude plugin test ./token-weather` gives 4 pass, 0 fail (1 file).
- `claude plugin validate` passes for `./activity`, `./token-weather` and the marketplace (`.`).
- Real-engine headless load on 2026-10-06 (`claude -p ... --plugin-dir ./activity`): the hooks module loaded with events `session.start`, `command.run`, `tool.call`, `agent.spawn`, `turn.step`, `turn.complete` and `ui.render`, and registered `mcp__activity__flow` and `mcp__activity__step`, with no errors.

Nobody has looked at the panes in a live terminal or the desktop app yet, so every item below is unchecked on purpose. Tick an item only after you have seen it.

## Terminal

Run `claude --plugin-dir ./activity` (add `--plugin-dir ./token-weather` for the stacking item) in a truecolor terminal, fullscreen, 110+ columns.

- [ ] `/activity` opens a docked pane; running it again closes it.
- [ ] Two parallel subagents show two rows with the crab, model, tokens, est. cost and elapsed time.
- [ ] The crab's legs alternate while a row runs and stand still when it finishes; a finished row shows a check.
- [ ] Below 110 columns the pane sits above the prompt.
- [ ] With a pane body of 60 columns or more the 17x7 crab shows; below 60 body columns the crab is hidden and the text lines remain.
- [ ] The `Finished` heading collapses and expands the finished rows.
- [ ] With more than 20 finished agents only the newest 20 show, with a `+N older` line above them.
- [ ] A failed agent shows the frown and a red dot, and the `Finished` heading reads `N failed` even while collapsed.
- [ ] The band above the prompt shows while agents run and goes away after, when no flow was declared.
- [ ] With `token-weather` loaded too, both bands are visible together (the weather line and the activity band stack, neither replaces the other).
- [ ] `✕` on the band hides it for that flow, and the pane still lists the planned tasks (the plan is not deleted).
- [ ] In a terminal without truecolor the crab is still recognisable.
- [ ] In a terminal narrower than 144 columns, a flow with tasks auto-opens nothing visible; running `/activity` then seats the pane and says "opened", not "closed".
- [ ] After a flow is finished (`finished: true`) with no agents running the band vanishes while the pane still lists it; a later batch of agents shows the band again, even if you dismissed it earlier.
- [ ] `/clear` in the middle of a session does not corrupt the panel (rows, band and `/activity` still work).

## Desktop app

Load the plugin with `CLAUDE_CODE_PLUGIN_DIRS` pointing at `activity`.

- [ ] Each agent row is one SVG card with its own dark background, readable in both light and dark themes.
- [ ] The skull on the crab's head has a soft halo on the dark card and reads clearly (there is no outline stroke).
- [ ] The walking legs and the pulsing status dot actually move in the desktop's image-mode SVG, or the crab degrades to a still crab.
- [ ] With the system "reduce motion" setting on, the legs and the dot do not animate.
- [ ] The row width looks right at a narrow pane width and at a wide one (text is cut at a separator, never mid-value).
- [ ] A failed agent shows the frown and a red dot.
- [ ] Rows with untrusted text (an agent description containing `<b>x</b>`) show it as plain text.
- [ ] Opening the pane with 12 or more agents on the desktop app works (the engine's limit on tree size is unverified; one SVG per row may hit it).

## Skills (`reportTools` on)

- [ ] A skill that calls `mcp__activity__flow` with 3 tasks shows 3 planned rows and a band with `phase · done/total`.
- [ ] A subagent that calls `mcp__activity__step` shows a progress bar on its row.
- [ ] With the `reportTools` option set to false, neither tool appears in the model's tool list.
