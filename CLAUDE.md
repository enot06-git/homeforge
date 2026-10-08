# HomeForge

Read `HOMEFORGE_SKILL.md` before doing anything else. It holds the architecture,
the athlete's managed conditions (upper-back kyphosis, lumbar disc), the training
rules and the log evidence behind them, and the deploy process.

## How to work here
- Discuss the plan, wait for confirmation, then code. No surprise changes.
- After touching templates, data structures or weight logic: `npm run validate`.
- Verify in the browser before claiming a change works (see "Browser
  verification" in `HOMEFORGE_SKILL.md`); remove any test session or seed file
  afterwards.
- Never change `STORAGE_KEY = "homeforge_data"`.
- Never relax the loaded-spine rule (squat/deadlift/RDL at RIR 3, max 3 sets):
  it is the athlete's own choice to protect the disc, not a tunable.
- Reply in the language of the user's latest message (Russian or English).
- Commits go straight to `main`. Pushing does not deploy: the user drags `dist/`
  to Netlify Drop after `npm run build`.
