// Mohit platform: Claude AI helpers for your app's server code. Do not edit.
// Needs ANTHROPIC_API_KEY in .env (shared Mohit/.env or the app's .env).
// Never call these from the browser; call them in server/routes.ts.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Response } from "express";
import type { z } from "zod/v4";

export type AiMessage = Anthropic.Beta.BetaMessageParam;

export interface AiOptions {
  /** Instructions for Claude: role, tone, rules. */
  system?: string;
  /** Upper bound on the reply length in tokens. Default 4000. */
  maxTokens?: number;
  /** How hard Claude thinks: "low" for quick chat, "medium" (default), "high" for hard tasks. */
  effort?: "low" | "medium" | "high";
}

const MODEL = process.env.MOHIT_AI_MODEL || "claude-opus-5-5";

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    try {
      client = new Anthropic();
    } catch {
      throw new AiError("AI is not set up: add ANTHROPIC_API_KEY to the .env file, then restart the app.", 503);
    }
  }
  return client;
}

function params(messages: AiMessage[], opts: AiOptions) {
  return {
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    messages,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: { effort: opts.effort ?? "medium" },
    // If Claude declines on safety grounds, let the API retry on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
}

/** Turn any SDK or setup error into an AiError with a readable message and HTTP status. */
function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AiError("AI key rejected: check ANTHROPIC_API_KEY in .env.", 503);
  if (err instanceof Anthropic.RateLimitError) return new AiError("AI is busy right now. Try again in a moment.", 429);
  if (err instanceof Anthropic.APIError) return new AiError(`AI request failed (${err.status}): ${err.message}`);
  const message = err instanceof Error ? err.message : String(err);
  if (/api ?key|auth/i.test(message)) {
    return new AiError("AI is not set up: add ANTHROPIC_API_KEY to the .env file, then restart the app.", 503);
  }
  return new AiError(`AI request failed: ${message}`);
}

function wrap(err: unknown): never {
  throw toAiError(err);
}

function checkStop(stop: string | null): void {
  if (stop === "refusal") throw new AiError("The AI declined this request.", 422);
}

/** One question, one text answer. */
export async function aiText(prompt: string, opts: AiOptions = {}): Promise<string> {
  return aiChat([{ role: "user", content: prompt }], opts);
}

/** A conversation: pass the history as [{ role: "user" | "assistant", content: "..." }, ...]. Returns the reply text. */
export async function aiChat(messages: AiMessage[], opts: AiOptions = {}): Promise<string> {
  try {
    const msg = await getClient().beta.messages.create(params(messages, opts));
    checkStop(msg.stop_reason);
    return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } catch (err) {
    wrap(err);
  }
}

/**
 * Structured answer that matches a zod schema:
 *   const r = await aiJson("Tag this recipe: ...", z.object({ tags: z.array(z.string()) }));
 */
export async function aiJson<S extends z.ZodType>(prompt: string, schema: S, opts: AiOptions = {}): Promise<z.infer<S>> {
  try {
    const p = params([{ role: "user", content: prompt }], opts);
    const msg = await getClient().beta.messages.parse({
      ...p,
      output_config: { ...p.output_config, format: betaZodOutputFormat(schema) },
    });
    checkStop(msg.stop_reason);
    if (msg.parsed_output == null) throw new AiError("The AI reply did not match the expected format.");
    return msg.parsed_output as z.infer<S>;
  } catch (err) {
    wrap(err);
  }
}

/**
 * Stream the reply straight to the browser as plain text, for chat UIs.
 * In a route: router.post("/chat", requireUser, (req, res) => aiStream(res, req.body.messages));
 * In the frontend use streamText() from src/api.ts.
 */
export async function aiStream(res: Response, messages: AiMessage[] | string, opts: AiOptions = {}): Promise<void> {
  const history: AiMessage[] = typeof messages === "string" ? [{ role: "user", content: messages }] : messages;
  try {
    const stream = getClient().beta.messages.stream(params(history, opts));
    stream.on("text", (t) => {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
      }
      res.write(t);
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") res.write("\n\n[The AI declined this request.]");
    res.end();
  } catch (err) {
    const e = toAiError(err);
    if (!res.headersSent) {
      res.status(e.status).json({ error: e.message });
    } else {
      res.end(`\n\n[${e.message}]`);
    }
  }
}
