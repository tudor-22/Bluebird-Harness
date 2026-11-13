# Computer-use benchmark

A rerunnable benchmark that compares Bluebird's native computer control (the accessibility
layer behind `desktop_look`, `desktop_click` and the other desktop tools) with the
screenshot-and-click approach most computer-use agents take. Both run on the same machine,
against the same app, with the same steps, so the only thing that changes is how each one sees
the screen and acts on it.

## Results

Results come from running the script on your own machine. No numbers are published here,
because they depend on the computer, the operating system and the model. Run it as below and
read the table it prints, or the files it writes.

## What it measures

Each task is a short script of steps against one app. The default tasks use the calculator that
ships with the system, because its buttons and display are the same from one run to the next:

| Task | Steps |
| --- | --- |
| `open-app` | Quit the calculator, then open it and wait for its window. |
| `find-element` | Find the 7 button without pressing it. |
| `click-and-read` | Click 7, +, 8 and =, then read the display and check it says 15. |
| `type-and-read` | Type `12*3=`, then read the display and check it says 36. |

Every task runs under each strategy:

| Strategy | Sees the app through | Picks the element with | Acts with | Needs a model |
| --- | --- | --- | --- | --- |
| `accessibility` | The accessibility outline | Its label, matched by the script | The element's own action (press) | No |
| `accessibility-model` | The accessibility outline | The model, from the outline text | The element's own action (press) | Yes, any model |
| `screenshot` | A screenshot of the window | A vision model, as a point in the picture | The real mouse at that point | Yes, a vision model |

`accessibility` is the floor: how fast the control layer is when nothing has to think.
`accessibility-model` and `screenshot` make the same decision with the same model, one from text
and one from pixels, which is the fair comparison for an agent.

For every step the benchmark records:

- **Latency:** wall time of the step, including the model call, with the model's share kept
  separately (`modelMs`).
- **Success:** whether the step did what it should. A task succeeds when every step does; it
  stops at the first failed step. Reading a value only counts when it matches what is expected,
  so a click that missed shows up as a wrong result at the end.
- **Tokens:** input and output tokens the model reported for the step, summed per task. Strategies
  that call no model show "no model".

Typing and key presses go through the same system calls in every strategy, and every action is
followed by the same short pause (150 ms) so the next look sees the change. Setup (quitting the
app, clearing the display) is not timed. Strategies take turns within each round, so a machine
that slows down during the run affects all of them alike.

## How to run it

On the computer you want to measure, from a checkout of the repository:

```bash
pnpm install
pnpm bench:computer-use                     # accessibility only, no model needed
```

The first run asks for the same permission the desktop tools need. On macOS that is
Accessibility for the app running the benchmark (your terminal), and Screen Recording too for the
screenshot strategy. Grant them in System Settings, Privacy & Security, then run it again.

To include the model strategies, point the benchmark at any model that speaks the Chat
Completions API. It does not use Bluebird's own engine settings or keys.

```bash
# A local vision model in Ollama
ollama pull qwen2.5vl:7b
BENCH_MODEL=qwen2.5vl:7b BENCH_MODEL_COORDS=pixels pnpm bench:computer-use --runs 5

# A hosted model
BENCH_MODEL=gpt-4o BENCH_MODEL_URL=https://api.openai.com/v1 BENCH_MODEL_KEY=sk-... pnpm bench:computer-use
```

| Variable | Meaning | Default |
| --- | --- | --- |
| `BENCH_MODEL` | Model name. Without it, only `accessibility` runs. | none |
| `BENCH_MODEL_URL` | Base address of the Chat Completions API. | `http://127.0.0.1:11434/v1` (Ollama) |
| `BENCH_MODEL_KEY` | API key, sent as a bearer token. | none |
| `BENCH_MODEL_COORDS` | How the model gives positions: `pixels` of the image, `normalized-1000` (0 to 1000, as Qwen-VL models often do) or `normalized-1` (0 to 1). | `pixels` |

Options:

| Option | Meaning | Default |
| --- | --- | --- |
| `--runs N` | Runs per task and strategy. | 5 |
| `--strategies a,b` | Any of `accessibility`, `accessibility-model`, `screenshot`. | All that can run |
| `--tasks file.json` | Your own tasks (below). | The system calculator |
| `--out dir` | Where the results go. | `apps/api/.data/bench/computer-use` |

Close other windows over the calculator before a run with the screenshot strategy, since it
clicks the real mouse.

## Output

Each run writes two files named after its start time:

- `<time>.json`: the machine (platform, release, CPU, memory, Node), the model settings (never
  the key), every task run with every step's latency, model time, tokens, success and detail,
  and a summary per task and strategy.
- `<time>.md`: the summary as a table: success count, median task time, median step time and
  median tokens per task. Times are medians over successful runs.

## Your own tasks

A task file lists tasks with an app and steps. Steps are `open`, `find`, `click`, `type`, `key`
and `read`. A target gives `describe` (what the model is told to look for), `labels` (labels the
scripted strategy accepts) and optionally `role`. `setup` steps run first and are not timed.

```json
{
  "tasks": [
    {
      "id": "textedit-type",
      "title": "Type into a new TextEdit document and read it back",
      "app": "TextEdit",
      "setup": [{ "kind": "open" }, { "kind": "key", "keys": "cmd+n" }],
      "steps": [
        { "kind": "type", "text": "hello from bluebird" },
        { "kind": "read", "expect": "hello from bluebird", "target": { "describe": "the text of the document", "labels": ["text", "document"], "role": "text" } }
      ]
    }
  ]
}
```

## Notes

- The default tasks were written for the macOS Calculator. Windows (Calculator) and Linux
  (`gnome-calculator`) defaults are included but their button and display labels are not
  verified; if a task fails at a `find` or `read` step there, give a task file with the labels
  your system uses.
- On macOS the window screenshot leaves out the window shadow, so a point in the picture maps
  straight onto the window frame. The screenshot strategy needs the window's position from the
  accessibility API to place its click; it does not use the outline to choose where to click.
- The code is in `apps/api/src/bench/computer-use`. The strategies only talk to the
  `DesktopAdapter` interface in `apps/api/src/agent/desktop/adapter.ts`, the same one the
  desktop tools use, so a new platform adapter is benchmarked with no changes here.
