# TIDEPOOL

Pooled AI capacity for people who build together.

Every source of AI capacity you own, in one place, with the level visible — so a
long build session does not stop at three in the afternoon because one window ran
dry while another sat idle in the tab next door.

## Run it

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm test             # 129 unit tests, offline, ~1s
pnpm build
pnpm check:bundle     # per-route gzip budget, fails on regression
pnpm check:policy     # which provider policy files need re-reading
```

Browser tests run on demand against a deployment rather than in the default
suite, which has to stay fast enough that people keep running it:

```bash
pnpm build && pnpm start &
E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
```

Nothing is required to run it. No database, no keys, no services.

## Deploy to Vercel

Import the repository and deploy — it is a stock Next.js App Router project with
no build configuration. `vercel.json` registers the preload cron.

Everything in `.env.example` is optional and each variable turns on a capability
the preview deliberately refuses to fake.

## What is here

| | |
|---|---|
| `src/lib/policy` | The provider register and the dispatch guard (§4). A source whose credential type has no policy entry cannot be dispatched to at all. |
| `src/lib/router` | Headroom interpolation and selection (§8). Pure — no I/O, tested in milliseconds. |
| `src/lib/meter` | Pricing and the double-entry ledger (§9). Pure. |
| `src/lib/ladder` | The always-on ladder: drop a rung rather than stall, and rework it when the tide returns. |
| `src/lib/orchestrate` | Idea intake, triage and ordering. Thirty ideas in, one execution plan out. |
| `src/lib/preload` | The 3am scheduler. Pure. |
| `src/lib/room` | Room events, the SSE contract and the task graph DAG. Pure. |
| `src/components/motion` | Odometer, sparkline and the animated request pipeline. |
| `src/app` | The interface. |
| `policy/providers/*.json` | Vendor terms as data, so a terms change is a data change rather than a code change. |

Selection, headroom, pricing, the ledger, the ladder and the scheduler are pure
functions with unit tests, and every number on screen comes from them rather than
from a mock.

## The capacity model

A capacity source has a **class**, and the class gates every code path that
touches it.

- **Class A — metered API credentials.** Pools across people. An API key exists to
  serve traffic from third parties; that is its designed purpose.
- **Class B — owned compute.** Pools across people. It is hardware. Open-weight
  models on a machine you own raise no vendor question, and they are the floor
  that makes always-on true: they never run out, they only get slower.
- **Class C — personal seats.** Never pools. A subscription is a personal
  entitlement, not a developer credential, and the credential never enters the
  system at all.

The invariant, enforced in the guard, mirrored by database check constraints, and
re-checked on the node itself:

> A unit of work may execute against a Class C source if and only if the human who
> owns that source is the human the work is attributed to.

## Tide preload

A rolling window replenishes at three in the morning whether or not anyone is
awake for it. Capacity you do not spend before the window turns over is capacity
you never had.

Queue prompts — an overnight repo digest, a triage pass over the failing suite, a
cache warm of the files you will open first — and they run while the tide is in.

- The window defaults to **03:00 local for three hours**, and the trough finder
  proposes your own quietest stretch from the observed hourly load. 3am is the
  default, not the answer.
- Vercel Cron fires hourly in UTC; the scheduler dispatches only items whose own
  local window is open, so 3am means 3am wherever the person is.
- Every item dispatches as `bulk`, so a source below 10% of its window stops
  taking preload while interactive work keeps running. Preload never competes
  with a person.
- An item only spends a basin already at or above its headroom threshold — 70% by
  default. It uses capacity that would otherwise expire, not tomorrow's.
- On a personal seat it runs only on the owner's own online node with unattended
  mode explicitly enabled. Nodes default to `offer`; nothing runs while you are
  asleep unless you said it could.

## Always on

Running out of frontier capacity is not a reason to stop. It is a reason to drop
a rung.

- `pickRung` walks down from the tier the work asked for until it finds one a
  connected provider can actually serve. It returns "stalled" only when even the
  floor is gone.
- **Owned compute is the floor.** An open-weight model on your own hardware never
  runs out — it only gets slower. That is what makes always-on true rather than
  aspirational, and it is why `/connect` pushes you toward registering a runtime.
- Work that ran below its target is **flagged for rework**, not silently accepted.
  When a capable rung replenishes, the flagged runs surface on the pool page and
  in the 3am window, where the rewrite is cheapest: the capable rung is full and
  nobody is waiting.

So a stall becomes a quality dip that repairs itself.

`/models` is the whole ladder on one screen — tier, serving provider, live
availability, latency, next tide — which is also the screen that explains why any
given request landed where it did.

Model names in the ladder are **supplied by you and unverified**. Confirm the exact
ids with each provider before this routes real traffic; a wrong id fails at
dispatch and a silently retired one is a production incident. The ladder mechanism
does not depend on what the rungs are called.

## Orchestrate

Ideas arrive thirty at once, usually while you are busy with the twenty-ninth. What
kills the burst is not capacity — it is that ordering them is itself work, and
doing it by hand costs exactly the attention the ideas needed.

`/orchestrate` takes the dump one idea per line and returns an order: priority as
impact × urgency ÷ effort, dependencies resolved topologically, a tier per task,
and a slot — runnable now, waiting for the tide, or blocked.

- Scoping runs on the **cheapest rung that can plan**, never the expensive one.
- A circular dependency is reported, never guessed at. An agent that quietly drops
  a dependency produces work in the wrong order and nobody notices until it has
  been done twice.
- The plan is a function of the tide, not a fixed list: the same task is a frontier
  job at 9am and a light-rung job at 4pm with a rewrite queued for 3am.

## Open source

Three different things get called open-source support, and running them together
is how you end up with a connect screen nobody understands:

- **Runtimes** *are* capacity — Ollama, vLLM, llama.cpp, LM Studio, TGI. Class B.
- **Gateways** *meter* capacity — OpenCode Zen, OpenRouter. Class A.
- **Clients** *spend* it — Cline, OpenCode, Continue, Aider, Goose. Point them at
  TIDEPOOL's OpenAI-compatible endpoint and every request they make is routed,
  metered and attributed like any other run.

## Rooms

A run is a first-class shared object: anyone in the room watches it live, sees what
it costs as it costs it, or picks it up when the person who started it goes to bed.

- **SSE, not WebSockets.** One-directional, survives proxies, reconnects natively.
  Every client action is an ordinary POST, so a second protocol would buy nothing.
- **Exact replay.** Every event carries a sequence number; a reconnecting client
  sends the last one it actually saw and gets back precisely the gap. The room has
  a *Drop the connection* button so you can watch it work.
- **A heartbeat every 15 seconds**, regardless of model output — intermediaries
  close long-lived connections when they go quiet.
- **Backpressure.** Cost and headroom ticks capped at 2/s, text deltas coalesced
  to 30/s. A room with six agents must not push 400 events/sec at a phone.
- **A real DAG, not a transcript.** Cycles are rejected at insert with the
  offending path. Claiming is first-write-wins, which is what stops two people
  doing the same thing at 2am.

## Nodes

The local daemon is what makes owned compute and personal seats possible at all.
It is outbound-only — no inbound ports, no tunnel to configure — generates a
keypair whose private half never leaves the device, and signs every report.

It may not read, copy, export or transmit a vendor CLI's credential store, run
work attributed to anyone else, or accept a dispatch for a source it does not own,
and there is no configuration flag that enables any of those. The environment it
spawns a vendor client into is stripped of every credential-bearing variable named
in any policy file first, so one vendor's key can never reach another's client.

Unattended pool work defaults to `offer`. Whether an automated dispatcher assigning
tasks to a member's own seat stays inside a vendor's personal-use terms is genuinely
unresolved, so the conservative setting is the default and `auto` is opt-in per node.

## The capacity field

An ambient generative canvas behind the pool and the room — and not one pixel of
it is decoration. Every quantity in it is read off the pool:

| what you see | what it is |
|---|---|
| one lane per source | the connected sources, ordered as the basins are |
| particle density in a lane | tokens of headroom remaining there |
| drift speed | how fast that bucket is actually refilling, right now |
| lane colour | that source's tide level |
| a lane pulling down, current accelerating | a run streaming against it, tokens leaving |
| still water, nothing moving | nothing connected — the empty state |

This is what lets it be atmospheric *and* honest. A token-bucket provider
replenishes continuously, so the field drifts even when nobody is working —
because capacity genuinely is coming back at that moment. It stops dead when every
bucket is full, which is equally true.

Canvas rather than SVG, because a thousand particles in the DOM is a different
kind of mistake. Measured at a locked 60fps with no dropped frames; it draws
exactly zero times while the tab is hidden, and exactly one frame under
`prefers-reduced-motion`.

## Motion

Motion shows a value changing; that is its whole job.

- The request pipeline animates off real run state — packets travel the edges only
  while work is in flight, and the stage a run is in lights up.
- A droplet lands on a basin each time tokens are actually drawn, and the surface
  rings where it hits.
- Numbers roll rather than crossfade, because the direction of travel is information.
- A basin's waterline moves only while a run is streaming against that source.
- Task graph edges march only while the dependency they carry is running.

None of it is SMIL or a JS timer, so the single `prefers-reduced-motion` rule in
the stylesheet stops all of it at once. Nothing animates while the system is idle.

## The five states

Every data surface ships all five, and the interface has a way to reach each one
rather than leaving them as untested code paths.

- **Empty** — nothing connected. The screen that decides whether anyone finishes
  onboarding, so it teaches the three capacity classes in one pass.
- **Loading** — skeletons matching the final dimensions exactly, so nothing shifts.
  Never a spinner where a shape is known. The shimmer is bounded: it stops the
  moment the real element replaces it.
- **Partial** — a half-arrived stream renders correctly; the room is built from it.
- **Error** — what failed, which source, what happens next, one action. Never a raw
  provider error string.
- **Saturated** — *Simulate a full hackathon* on the pool page seeds forty sources,
  twelve members and three hundred runs. Basins group by provider past a dozen and
  the run list windows. Designed before the data existed, because a real hackathon
  produces it in hour one.

## Buy me compute

A support page and an embeddable widget, so a creator, speaker or maintainer can
be given the *work* rather than the coffee.

The units are named for what they buy, because "500,000 tokens" means nothing to
anybody and "one overnight run" means something immediately:

| | | |
|---|---|---|
| A cup | one long conversation | 50k |
| A tide | one overnight run | 250k |
| A spring tide | a full night of batch work | 1M |

Prices come from the same price book the ledger uses, so what a supporter is
quoted and what the creator is charged cannot drift apart.

**Two rails, and TIDEPOOL never touches the money on either.**

- **Cash** — the supporter pays the creator directly through the creator's own
  payment link (Stripe, Ko-fi, GitHub Sponsors, anything). TIDEPOOL records the
  gift and raises the creator's budget. It never holds, routes or takes a cut:
  taking a percentage of someone else's inference bill is the one revenue model
  the plan rules out, and standing between a supporter and a creator's money is
  how a side project acquires a compliance department.
- **Capacity** — a supporter lends a capped, time-boxed window on an API key or a
  GPU box they already own. Nothing is bought or sold, which keeps it clear of the
  unresolved question about reselling prepaid credit: no consideration, nothing to
  resell.
- **Never a personal seat.** §3 holds at the gifting boundary exactly as it holds
  everywhere else, and a support page is precisely where someone would try.

### The embed

`/support` generates a snippet; `/embed/[handle]` renders it; `/c/[handle]` is the
full public page for a bio, a README or a talk's last slide.

- **An iframe, not a script.** A script tag on a creator's site is code we could
  change under them at any time, with access to everything on the page. A frame
  can only ever draw inside its own box. For a widget that shows a number and
  links out, the script buys nothing and costs the creator their site's integrity.
- It ships **sandboxed** (`allow-scripts allow-popups`, and deliberately *not*
  `allow-same-origin`, which together with `allow-scripts` would undo the sandbox).
- The embed has **its own root layout** in a separate route group. A nested layout
  still renders inside the app's, and the first version shipped the whole masthead
  stapled to the widget.
- **`frame-ancestors` is `*` on `/embed/` and `'none'` everywhere else.** The app
  has revoke, connect and spend controls on it; a clickjacked click on any of them
  is somebody's capacity gone.
- The **frame height is computed from the options the creator picked**, because a
  sandboxed cross-origin frame cannot resize itself and the only way to let it
  would be a script on their page. Every configuration is verified to fit — a
  clipped Give button makes the whole widget decorative.

## Performance

`pnpm check:bundle` measures gzipped first-load JavaScript from Next's own build
manifest, and measures **two** numbers rather than one:

- **shared** — what every route in a layout group pays before any page code runs.
  Budget 120 KB, the plan's number applied to the thing every route genuinely
  loads. Currently 116.6 KB, so **3.4 KB of headroom left**, and that shrinking is
  the real thing to watch.
- **route** — the page's own code on top of its shell, computed from the chunk
  sets rather than by subtracting totals. Budget 14 KB; the heaviest page is
  11.6 KB.

An earlier version reported one total per route against a flat 120 KB. Once the
shared shell reached 116 KB that was failing six pages over three kilobytes of
their own code, which tells you nothing and trains people to add exceptions.
Splitting the two puts the failure where the cause is, and the check now passes
with no exceptions at all.

Regressions over 3 KB against the committed baseline fail the build. Both failure
modes are verified by making them fire, not assumed. Splitting the two diagrams out with `next/dynamic`
was tried and reverted: both render above the fold, so deferring them buys a
skeleton flash rather than a faster first paint.

## What this deployment is not, yet

- **No vault.** With no KMS configured the connect flow refuses to accept a key
  rather than collecting a secret it cannot protect.
- **No gateway.** Long agent runs exceed a serverless ceiling, and a run that dies
  at the ceiling loses its metering tail — the one thing that must never be lost.
  That service is separate by design.
- **No node daemon.** Class B and Class C sources are stand-ins with simulated
  headroom.
- **The price book is synthetic** and labelled as such on every screen showing
  money. `scripts/seed-prices.ts` publishes a real dated version.

## Verification

Only the Anthropic policy file was populated from a primary source during this
build; the other documentation hosts were unreachable from the build environment.
They ship marked unverified rather than filled in from memory, and the connect
screen says so.

```bash
pnpm check:policy
```

## Verified rather than asserted

- The SSE contract, end to end: a fresh client gets everything, a resume gets
  exactly the gap, both `Last-Event-ID` and the query parameter work, and live
  events arrive while connected.
- All four of the room's acceptance criteria, in a real browser: a teammate's run
  streams in, a dropped connection replays with no gaps and no duplicates, two
  browsers see the same run, and a claim holds.
- No accessibility findings across eight routes — every control named, every
  meaningful SVG labelled, no horizontal overflow, keyboard reaches the interface.
- Under `prefers-reduced-motion`, nothing on the page animates at all.
- The shipped demo data satisfies the double-entry invariant.
