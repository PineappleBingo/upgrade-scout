import { spawn } from "node:child_process";
import { completeJson } from "./llm-json";
import { judgeSchema } from "./schema";

const SCHEMA_HINT = `{ "tier": "required" }`;
export const HINT_RATE = 0.5;
export const TIMEOUT_MS = 3000;
const TOOL = "fetcher";

export async function runJudge(input: string) {
  const system = getPrompt("judge", { schema: SCHEMA_HINT });
  const result = await completeJson({ system, user: input, schema: judgeSchema });
  const clean = sanitizeResult(result);
  return clean;
}

export async function runResearch(q: string) {
  const results = await webSearch(q);
  return completeJson({ system: "s", user: JSON.stringify(results), schema: judgeSchema });
}

export function classifyError(stderr: string) {
  if (/login required/i.test(stderr)) return "needs_cookies";
  if (/unavailable/i.test(stderr)) return "gone";
  return "unknown";
}

export async function update(db: any, id: string) {
  const moved = await db.build.updateMany({ where: { id, status: "done" }, data: { status: "judging" } });
  if (!moved.count) return Response.json({ error: "no" }, { status: 409 });
}

export function run() {
  spawn("yt-dlp", ["--dump-json", "--flat-playlist", "ytsearch5:x"]);
  spawn(TOOL, ["get"]);
  spawn("npx", ["-y", "wigolo", "search"]);
  return fetch("https://api.example.dev/v1/items", { method: "POST" });
}

declare function getPrompt(n: string, v: object): string;
declare function webSearch(q: string): Promise<string[]>;
declare function sanitizeResult<T>(v: T): T;
