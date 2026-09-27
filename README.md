# TIDEPOOL

Pooled AI capacity for people who build together.

Every source of AI capacity you own, in one place, with the level visible — so a
long build session does not stop at three in the afternoon because one window ran
dry while another sat idle in the tab next door.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # 58 unit tests, offline, under a second
pnpm build
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
pnpm tsx scripts/verify-policy.ts
```
