# DERELICT — Phase 2 Spec (v1.1)

**Status: DRAFT, awaiting ratification.** Derived from the interview of 29 July
2026. Nothing here is built. Once ratified this becomes locked on the same terms
as v1: if we change something during the build, we change this document first.

Supersedes part of v1 §4. Everything in v1 not named here still stands, including
Amendment 1.

---

## 1. The one-liner

The two power cells stop being a number on a panel and become objects. You find
them, carry them, and seat them — and neither one is reachable until the machine
holding it has been dealt with.

## 2. What phase 2 demonstrates

That the engine and the asset pipeline support **mechanics**, not just set
dressing.

v1 proved a generated asset set could assemble into a finished game. Every
interaction in it was the same interaction: walk up to a thing, press a button,
a counter goes up. Phase 2 proves the same foundation carries objects with
identity, machines with state, and an order that has to be respected — without
the level growing, without a second art style, and without giving up the
guarantee that the game cannot be broken.

Every tradeoff during the build gets settled against that sentence.

## 3. The revised loop

The ship, the five spaces and the route are unchanged. What changes is what the
switches actually do.

1. **Airlock Bay.** The panel reads 0/2 as before. Below it, two empty **cell
   sockets** — visibly waiting for something.
2. **Storage Hold.** Power Cell 1 sits in a **charging cradle**, clamped. The
   wall switch no longer credits a cell; it powers the Hold, which releases the
   clamp. Take the cell.
3. **Back to the Bay.** Seat the cell. The panel reads 1/2, and the Bay comes up
   on its own power.
4. **Engine Annex.** Cell 2's cradle is dead until the Bay is live — so it
   cannot be taken before step 3. The Annex switch powers the room and the
   shortcut hatch as it does today; the cradle releases only once the Bay has a
   cell in it.
5. **Back through the shortcut.** Seat the second cell. 2/2, airlock cycles,
   walk out.

That is a six-step chain in which no step can be taken early. The route, the
lighting states, the squeeze and the shortcut all keep working exactly as they
do now.

## 4. What gets built

**Three new interactive types. No more.**

| Type | What it does |
|---|---|
| **Power cell** | Carryable. Two instances. One carry slot — you hold one or none. |
| **Cell socket** | Two, on the Bay's airlock panel. Accepts a cell. One-way: nothing comes back out. |
| **Charging cradle** | Two, one per objective room. Holds a cell until its release condition is met. |

**Carrying rules**, chosen to make the correctness bar provable rather than to
maximise freedom:

- One cell at a time.
- Interact with a cell to take it; interact with a socket while carrying to seat
  it; interact with anything else while carrying to set the cell down.
- Setting down places the cell on the floor at the player's feet. It is never
  thrown, never placed inside geometry, and never enters a room the player
  cannot re-enter.
- Sockets are one-way. Once a cell is seated it is spent. This deletes an entire
  class of failure rather than testing for it.

**New assets**, through the existing pipeline: `power_cell` and `cell_cradle`
models, and two sounds — cell lift and cell seat. Existing style bible, existing
budgets, existing post-process.

**Unchanged:** the five spaces, the two wall switches, the lighting states, the
airlock, the shortcut hatch, the retro rendering treatment, the HUD.

## 5. Scope guardrails

Lifted from v1 §4: **inventory**, narrowly — a single carry slot, no UI, no
management, no dropping at range.

Still permanently out, unchanged from v1: **combat, enemies, saving, settings
menus, procedural generation, additional levels or rooms.**

Depth comes from machines that hold state and gate each other, not from more
space and not from more verbs.

## 6. Definition of done

| | Verified by |
|---|---|
| **No unwinnable states.** No sequence of player actions leaves the game uncompletable. A cell can always be recovered and every socket can always be reached. | Me — an adversarial harness that searches action sequences for dead ends, run in CI |
| **Real dependency depth.** The critical path is six ordered steps and no step can be completed before its predecessor. | Me — asserted structurally against the interaction table, not by playing |
| **Still a short vignette.** A player who knows the route finishes inside five minutes. | Me — the on-foot walkthrough harness reports game-clock duration |
| **Solvable without hints.** A player finishes cold, with no tutorial text and no instruction beyond the existing controls card. | **You.** I cannot verify this and will not claim to |

Plus everything v1 §11 already required, which must not regress: the loop stays
playable start to finish, all three harnesses stay green, every asset still comes
from the pipeline, and the Vercel deployment stays live.

## 7. The box

Three new interactive types, two new models, two new sounds, zero new rooms.

If the design wants a fourth type, that is a signal to change this document
first — not to add it.

## 8. Build order

1. **Mechanics greybox** — carrying, sockets, cradles and the gating chain, on
   the existing props. Fully playable before any new asset exists, exactly as in
   v1.
2. **Dead-end harness** — the adversarial search, red before it is green.
3. **Assets** — the two models and two sounds through the pipeline.
4. **Integration and ship** — real assets, audio, deploy.
