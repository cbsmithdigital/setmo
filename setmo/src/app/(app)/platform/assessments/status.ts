// How each free-assessment status reads in the platform console.
export const ASSESSMENT_STATUS: Record<string, { label: string; chip: string }> = {
  CREATED: { label: "Email not confirmed yet", chip: "" },
  PENDING_APPROVAL: { label: "Waiting for review", chip: "amber" },
  ACTIVE: { label: "Live — call not scored yet", chip: "mint" },
  SCORED: { label: "Report ready", chip: "purple" },
};
