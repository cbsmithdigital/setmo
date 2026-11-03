/** The practice's own doctor, when it has told us — a lead who mentions the
 *  doctor uses that name instead of making one up. Empty when there's none, so
 *  prompts for practices without a doctor on file are unchanged. */
export function doctorLine(doctorName: string | null | undefined): string {
  const name = doctorName?.trim();
  if (!name) return "";
  return "\n- The practice's doctor is " + name + ". If the doctor comes up, that's who it is — never make up another doctor's name.";
}
