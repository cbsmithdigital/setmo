import { generatePersona, buildLeadPrompt, personaLabel, type Difficulty, type Persona } from "@/lib/personas";
import { sampleLead } from "@/lib/realism/sampler";
import { composeLead, templateProse, type LeadProse } from "@/lib/realism/compose";
import { buildLeadPromptV2, leadLabel } from "@/lib/realism/prompt";
import type { LeadChoice, LeadSkeleton } from "@/lib/realism/types";
import type { ServicePack } from "@/lib/packs/types";

// One way in for the call route: hand it a service and get back everything the
// voice agent needs. Implant goes down its original path; every pack with its
// own lead generator goes through the checked engine. New leads always come with
// a lead card (what the practice has on file), and honor "pick your lead".

export type BuiltLead = {
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  personaName: string;
  /** Stored on the session, and reused as-is when a dropped call reconnects. */
  seed: Record<string, unknown>;
};

type OfficeFacts = {
  name?: string | null;
  city?: string | null;
  offerFraming?: string | null;
  appointmentFraming?: string | null;
};

export async function buildImplantLead(opts: {
  difficulty: Difficulty;
  office: OfficeFacts;
  setterFirstName?: string | null;
  stored: Record<string, unknown> | null;
  choice?: LeadChoice | null;
}): Promise<BuiltLead> {
  const persona =
    (opts.stored as unknown as Persona | null) ??
    (await generatePersona(opts.difficulty, { choice: opts.choice ?? undefined, card: true }));
  return {
    systemPrompt: buildLeadPrompt(persona, opts.office, opts.setterFirstName, opts.difficulty),
    firstMessage: persona.openingLine,
    voiceId: persona.voice.id,
    personaName: persona.name,
    seed: { persona: personaLabel(persona), ...persona },
  };
}

export async function buildPackLead(opts: {
  pack: ServicePack;
  seed: string;
  difficulty: Difficulty;
  office: OfficeFacts;
  setterFirstName?: string | null;
  stored: Record<string, unknown> | null;
  choice?: LeadChoice | null;
}): Promise<BuiltLead> {
  const stored = opts.stored as { skeleton?: LeadSkeleton; prose?: LeadProse } | null;
  const callAbout = opts.pack.callAbout ?? opts.pack.name.toLowerCase();
  // The office's own offer wording is written for the implant call, so a pack
  // that brings its own offer uses that instead.
  const office: OfficeFacts = {
    ...opts.office,
    offerFraming: opts.pack.offer ?? opts.office.offerFraming,
    appointmentFraming: opts.pack.appointment ?? opts.office.appointmentFraming,
  };

  const skeleton =
    stored?.skeleton ?? sampleLead(opts.pack.persona!, opts.seed, { difficulty: opts.difficulty, choice: opts.choice ?? undefined });
  const prose =
    stored?.prose ??
    (
      await composeLead({
        skeleton,
        callAbout,
        office,
        lexicon: opts.pack.lexicon ?? { allowImplantWording: opts.pack.service === "IMPLANT" },
      })
    ).prose;

  const { systemPrompt, firstMessage } = buildLeadPromptV2({
    skeleton,
    prose,
    callAbout,
    office,
    adOffer: opts.pack.adOffer,
    setterFirstName: opts.setterFirstName,
    difficulty: opts.difficulty,
  });

  return {
    systemPrompt,
    firstMessage,
    voiceId: skeleton.voice.id,
    personaName: skeleton.caller.firstName,
    seed: { persona: leadLabel(skeleton), skeleton, prose, engine: "realism-v1" },
  };
}

export { templateProse };
