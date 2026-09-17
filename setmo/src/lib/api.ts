import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** `extra` carries machine-readable detail (e.g. `{ code: "BULK" }`) so the UI can
 *  react to a specific refusal instead of only printing the message. */
export function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}
