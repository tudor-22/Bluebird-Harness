// Seeds 5 days of demo history (an ML engineer's assistant thread) into the installed Bluebird app's DB.
// Every row is tagged metadata.demo = true.  usage: node seed-demo.mjs [seed|clean]
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
const require = createRequire("/Users/tudor/Documents/GitHub/Bluebird-Harness/apps/api/package.json");
const { Client } = require("pg");

const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/Bluebird/data/desktop.json`, "utf8"));
const client = new Client({ host: "127.0.0.1", port: 49159, user: "postgres", password: cfg.dbPassword, database: "bluebird" });
await client.connect();
const mode = process.argv[2] ?? "seed";

if (mode === "clean") {
  await client.query("DELETE FROM messages WHERE metadata->>'demo' = 'true'");
  await client.query("DELETE FROM memories WHERE metadata->>'demo' = 'true'");
  await client.query("DELETE FROM day_summaries WHERE summary LIKE '%​'");
  console.log("demo rows removed");
  await client.end();
  process.exit(0);
}

const { rows: [u] } = await client.query("SELECT id FROM users LIMIT 1");
const { rows: [c] } = await client.query("SELECT id FROM conversations WHERE user_id = $1", [u.id]);
const userId = u.id, convId = c.id;

// [day, "HH:MM", role, content]
const T = [];
const add = (day, time, role, content) => T.push([day, time, role, content]);

// ---------- Fri 6 Nov... Sat 7 Nov ----------
add("2026-11-07", "09:12", "user", "Morning. I'm starting a LoRA fine-tune of Llama 3.1 8B on our support-ticket data (about 12k labelled tickets, 9 categories). What rank and learning rate would you start with?");
add("2026-11-07", "09:12", "assistant", "Good starting point for an 8B classifier-style task:\n\n- **Rank:** `r=16`, `alpha=32` is a safe default. Go to 32 only if validation loss plateaus early.\n- **Targets:** all attention projections plus the MLP (`q,k,v,o,gate,up,down`). Attention-only underfits on label-heavy tasks.\n- **LR:** `2e-4` with cosine decay and 3% warmup. LoRA tolerates a much higher LR than full fine-tuning.\n- **Epochs:** 2-3. With 12k samples you will overfit by epoch 4.\n\n```python\nfrom peft import LoraConfig\n\nconfig = LoraConfig(\n    r=16,\n    lora_alpha=32,\n    lora_dropout=0.05,\n    target_modules=[\"q_proj\", \"k_proj\", \"v_proj\", \"o_proj\", \"gate_proj\", \"up_proj\", \"down_proj\"],\n    task_type=\"CAUSAL_LM\",\n)\n```\n\nWhat GPU are you training on? That decides the batch size and whether you need QLoRA.");
add("2026-11-07", "09:15", "user", "Single RTX 4090, 24 GB. I like PyTorch with bf16, and please keep answers short with the code first. I'm calling the project ticket-triage-v2.");
add("2026-11-07", "09:15", "assistant", "Noted: 4090 (24 GB), PyTorch + bf16, code first, project **ticket-triage-v2**.\n\n```python\ntraining_args = TrainingArguments(\n    output_dir=\"runs/ticket-triage-v2\",\n    per_device_train_batch_size=4,\n    gradient_accumulation_steps=8,   # effective batch 32\n    learning_rate=2e-4,\n    lr_scheduler_type=\"cosine\",\n    warmup_ratio=0.03,\n    num_train_epochs=3,\n    bf16=True,\n    gradient_checkpointing=True,\n    logging_steps=20,\n    report_to=\"wandb\",\n)\n```\n\nOn 24 GB an 8B model in bf16 is about 16 GB of weights, so LoRA fits with gradient checkpointing and batch 4. No need for 4-bit.");
add("2026-11-07", "14:40", "user", "Run 1 finished. Train loss 0.41, eval loss 0.58. Is that a gap I should worry about?");
add("2026-11-07", "14:41", "assistant", "A 0.17 gap after 3 epochs is mild overfitting, not alarming. Check two things before changing anything:\n\n1. **Per-class F1**, not just loss. A rare category can hide behind a good average.\n2. **Where eval loss bottomed out.** If it was lowest at epoch 2, take that checkpoint.\n\nIf you want it tighter: raise `lora_dropout` to 0.1 and add weight decay `0.01`. I would try that before touching rank.");

// ---------- Sun 8 Nov ----------
add("2026-11-08", "10:05", "user", "Run 2 crashed with CUDA out of memory at step 340. Same config, just a longer max sequence length (2048).");
add("2026-11-08", "10:05", "assistant", "That is expected: activation memory grows with sequence length, and a few very long tickets can spike a single batch.\n\n```python\n# 1. Sort-free fix: cap and pack\nmax_seq_length = 1536\n# 2. Smaller micro-batch, same effective batch\nper_device_train_batch_size = 2\ngradient_accumulation_steps = 16\n# 3. Fragmentation\n# export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True\n```\n\nCheck the length distribution first. If the 99th percentile is under 1200 tokens, a 2048 cap is wasting memory on a handful of outliers.");
add("2026-11-08", "10:20", "user", "p99 is 1180 tokens. Capped at 1536 and it's stable now, 19.8 GB peak.");
add("2026-11-08", "10:20", "assistant", "19.8 GB peak on a 24 GB card is a healthy margin. Keep `expandable_segments` on. That alone usually removes the random late-run OOMs.");
add("2026-11-08", "16:30", "user", "Can you remind me where the dataset lives and what I'm tracking runs in?");
add("2026-11-08", "16:30", "assistant", "From what you have told me: the data is the 12k labelled support tickets for **ticket-triage-v2**, and you track runs in Weights & Biases (`report_to=\"wandb\"`). You train on the RTX 4090 and prefer bf16.");

// ---------- Mon 9 Nov ----------
add("2026-11-09", "09:30", "user", "Eval time. I have base Llama 3.1 8B, run 1 and run 3 (higher dropout). Can you compare macro-F1 for me? Base 0.71, run 1 0.86, run 3 0.89.");
add("2026-11-09", "09:31", "assistant", "| Model | Macro-F1 | Gain vs base |\n|---|---|---|\n| Base Llama 3.1 8B | 0.71 | - |\n| Run 1 (dropout 0.05) | 0.86 | +0.15 |\n| Run 3 (dropout 0.10, wd 0.01) | **0.89** | +0.18 |\n\nRun 3 is the one to ship. The extra regularisation bought +0.03 for free. You are 0.01 away from the 0.90 target.\n\nNext cheapest lever is data, not hyperparameters: look at the confusion matrix for the two weakest categories.");
add("2026-11-09", "09:45", "user", "Weakest are billing-dispute (0.78) and account-recovery (0.80). They get confused with each other.");
add("2026-11-09", "09:46", "assistant", "Those two overlap semantically (\"I can't access my account after a charge\"). Options, cheapest first:\n\n1. Relabel ~200 ambiguous tickets with a multi-label review.\n2. Add 300-500 synthetic hard negatives for each class.\n3. Add a one-line category definition to the prompt template.\n\nI would do #3 today, it is a ten-minute change. Then retrain once.");
add("2026-11-09", "17:10", "user", "Added the category definitions to the prompt. Macro-F1 is now 0.905.");
add("2026-11-09", "17:10", "assistant", "That clears your 0.90 goal. Log it in W&B as `ticket-triage-v2-r4` and keep the exact prompt template next to the adapter weights, since the definitions are now part of the model.");

// ---------- Tue 10 Nov ----------
add("2026-11-10", "11:00", "user", "Now I need to deploy it on a Mac Studio for inference. Merge the adapter and quantize, which format?");
add("2026-11-10", "11:00", "assistant", "For a Mac Studio, use **GGUF** with llama.cpp or MLX.\n\n```bash\n# merge adapter into base\npython merge_lora.py --base meta-llama/Llama-3.1-8B --adapter runs/ticket-triage-v2-r4 --out merged/\n\n# convert and quantize\npython convert_hf_to_gguf.py merged/ --outfile ticket-triage-v2.f16.gguf\n./llama-quantize ticket-triage-v2.f16.gguf ticket-triage-v2.Q5_K_M.gguf Q5_K_M\n```\n\n`Q5_K_M` loses very little on classification tasks (usually under 0.5 F1). Re-run your eval on the quantized file to confirm, do not assume.");
add("2026-11-10", "11:40", "user", "Q5_K_M scored 0.902 and runs at 41 tokens/s on the Studio. Q4_K_M is 0.894 at 52 tokens/s.");
add("2026-11-10", "11:41", "assistant", "| Quant | Macro-F1 | Speed | Size |\n|---|---|---|---|\n| F16 | 0.905 | 18 tok/s | 16.1 GB |\n| Q5_K_M | 0.902 | 41 tok/s | 5.7 GB |\n| Q4_K_M | 0.894 | 52 tok/s | 4.9 GB |\n\nSince classification outputs are a handful of tokens, speed is not your bottleneck. Take **Q5_K_M**: it stays above 0.90 and the throughput is plenty.");
add("2026-11-10", "15:20", "user", "I want a nightly eval on the newest tickets so I catch drift. Where would that live?");
add("2026-11-10", "15:21", "assistant", "Bluebird can run that itself on a schedule: use `/cron` with a line like `0 2 * * *` and a prompt that runs your eval script, then reports macro-F1 and anything that dropped more than 0.02 from yesterday. A message to your chat app can carry the result so you see it with your coffee.");

// ---------- Wed 11 Nov ----------
add("2026-11-11", "09:20", "user", "I'm reading the DoRA paper. Worth switching from plain LoRA for ticket-triage-v3?");
add("2026-11-11", "09:21", "assistant", "**DoRA** splits each weight update into magnitude and direction and applies LoRA only to the direction. Reported gains are small but consistent (about +0.5 to +1 points) at the same rank, for ~10% more training time.\n\nFor you:\n\n- Your target is already met, so the gain is marginal.\n- It is one flag in PEFT (`use_dora=True`), cheap to test.\n- Run it as an ablation on the same seed, not as a replacement, and compare per-class F1.");
add("2026-11-11", "10:00", "user", "Fine, one ablation. Also my manager asked for a one-page summary of ticket-triage-v2 for Friday. Outline it?");
add("2026-11-11", "10:01", "assistant", "**ticket-triage-v2: one-page summary**\n\n1. **Problem:** manual triage of ~1.2k tickets a week, 9 categories.\n2. **Approach:** LoRA (r=16, dropout 0.10) on Llama 3.1 8B, 12k labelled tickets.\n3. **Result:** macro-F1 0.71 (base) to 0.905, 0.902 after Q5_K_M quantization.\n4. **Deployment:** Mac Studio, 41 tok/s, 5.7 GB, fully on-prem.\n5. **Risks:** drift (mitigated by nightly eval), billing-dispute vs account-recovery confusion.\n6. **Next:** DoRA ablation, v3 data refresh.");
add("2026-11-11", "17:50", "user", "Thanks, that's Friday handled. Switching to the data refresh tomorrow.");
add("2026-11-11", "17:50", "assistant", "Sounds good. Tomorrow's order: pull the newest 2k tickets, dedupe against the training set, then run the nightly eval script on them before labelling anything. I will remember where you left ticket-triage-v2.");

const SUMMARIES = {
  "2026-11-07": "Set up a LoRA fine-tune of Llama 3.1 8B on the ticket data.",
  "2026-11-08": "Fixed a CUDA out-of-memory crash on the 4090.",
  "2026-11-09": "Compared runs and pushed macro-F1 past 0.90.",
  "2026-11-10": "Quantized to GGUF and planned a nightly drift eval.",
  "2026-11-11": "Read about DoRA and outlined the Friday summary.",
};

const MEMORIES = [
  ["technical_context", "Trains models on a single RTX 4090 (24 GB) and serves them on a Mac Studio.", 0.9],
  ["preference", "Prefers PyTorch with bf16 mixed precision, short answers and code first.", 0.85],
  ["project", "Working on ticket-triage-v2: a LoRA fine-tune of Llama 3.1 8B on 12k labelled support tickets, 9 categories.", 0.95],
  ["goal", "Wants ticket-triage-v2 above 0.90 macro-F1 (reached 0.905; 0.902 after Q5_K_M quantization).", 0.9],
  ["technical_context", "Tracks experiments in Weights & Biases; the latest run is ticket-triage-v2-r4.", 0.7],
  ["professional_context", "Machine learning engineer; owes their manager a one-page ticket-triage-v2 summary on Friday.", 0.75],
];

await client.query("BEGIN");
await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
for (const [day, time, role, content] of T) {
  await client.query(
    `INSERT INTO messages (conversation_id, user_id, role, content, created_at, metadata)
     VALUES ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)`,
    [convId, userId, role, content, `${day}T${time}:00Z`, JSON.stringify(role === "assistant" ? { demo: true, model: "deepseek-flash" } : { demo: true })],
  );
}
for (const [day, summary] of Object.entries(SUMMARIES)) {
  await client.query(
    `INSERT INTO day_summaries (user_id, conversation_id, day, summary) VALUES ($1,$2,$3,$4)
     ON CONFLICT (conversation_id, day) DO UPDATE SET summary = EXCLUDED.summary`,
    [userId, convId, day, summary + "​"],
  );
}
for (const [type, content, importance] of MEMORIES) {
  await client.query(
    `INSERT INTO memories (user_id, type, content, importance, confidence, source_conversation_id, created_at, metadata)
     VALUES ($1,$2,$3,$4,0.9,$5,'2026-11-09T12:00:00Z','{"demo":true}'::jsonb)`,
    [userId, type, content, importance, convId],
  );
}
await client.query("COMMIT");
const { rows } = await client.query("SELECT count(*) FROM messages");
console.log("seeded; messages:", rows[0].count);
await client.end();
