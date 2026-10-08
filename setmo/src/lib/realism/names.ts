import type { Rng } from "@/lib/realism/rng";

// Name pools for generated leads. Deliberately broad so practices hear the range
// of people who actually call them. Names carry no storyline meaning — the
// sampler never ties a name to coverage, tone or difficulty.

const FIRST_MALE = [
  "James", "Robert", "Michael", "David", "William", "Richard", "Thomas", "Charles", "Daniel", "Matthew",
  "Anthony", "Mark", "Steven", "Paul", "Kenneth", "Gregory", "Frank", "Raymond", "Carlos", "Miguel",
  "Luis", "Jose", "Andre", "Marcus", "Terrence", "Darnell", "Wei", "Hiroshi", "Rajesh", "Amir",
  "Dmitri", "Tomasz", "Ethan", "Tyler", "Jordan", "Caleb", "Mason", "Diego", "Omar", "Elias",
];
const FIRST_FEMALE = [
  "Mary", "Patricia", "Linda", "Barbara", "Susan", "Jessica", "Karen", "Nancy", "Betty", "Sandra",
  "Margaret", "Carol", "Michelle", "Laura", "Deborah", "Rosa", "Maria", "Carmen", "Yolanda", "Aisha",
  "Tanya", "Denise", "Latoya", "Mei", "Priya", "Fatima", "Irina", "Agnieszka", "Nicole", "Brianna",
  "Kayla", "Sofia", "Ava", "Maya", "Harper", "Elena", "Noor", "Jasmine", "Gloria", "Evelyn",
];
const LAST = [
  "Harper", "Delgado", "Whitfield", "Alvarez", "Brooks", "Chu", "Lawson", "Morales", "Wilson", "Bell",
  "Ortiz", "Kowalski", "Raman", "Jennings", "Cole", "Reyes", "Dunn", "Holloway", "Whitaker", "Harmon",
  "Nguyen", "Patel", "Okafor", "Ivanov", "Rossi", "Fischer", "Mbeki", "Sutton", "Barnes", "Castillo",
  "Freeman", "Sorensen", "Yamada", "Haddad", "Novak", "Blackfeather", "Kaur", "Duarte", "Boyd", "Lindqvist",
];

// Names that belong to a generation. A 74-year-old Kayla or a 9-year-old Betty
// is the kind of detail a setter notices, so these only go to plausible ages.
const YOUNG_ONLY = new Set(["Ethan", "Tyler", "Jordan", "Caleb", "Mason", "Elias", "Brianna", "Kayla", "Sofia", "Ava", "Maya", "Harper", "Jasmine"]);
const OLDER_ONLY = new Set([
  "Kenneth", "Gregory", "Frank", "Raymond", "Richard", "Charles", "Terrence",
  "Betty", "Barbara", "Linda", "Nancy", "Carol", "Deborah", "Gloria", "Patricia", "Sandra", "Karen", "Yolanda", "Susan", "Mary",
]);

/** A name for someone of this gender — and, given an age, one that fits it.
 *  `notFirst` keeps two people on one call from sharing a first name. */
export function pickName(
  rng: Rng,
  gender: "male" | "female",
  age?: number,
  notFirst?: string
): { firstName: string; lastName: string } {
  const all = (gender === "male" ? FIRST_MALE : FIRST_FEMALE).filter((n) => n !== notFirst);
  const fits =
    age == null ? all : age >= 45 ? all.filter((n) => !YOUNG_ONLY.has(n)) : age <= 30 ? all.filter((n) => !OLDER_ONLY.has(n)) : all;
  return {
    firstName: rng.pick(fits),
    lastName: rng.pick(LAST),
  };
}

/** Whether a first name fits someone of this age (the rule pickName follows). */
export function nameFitsAge(firstName: string, age: number): boolean {
  if (age >= 45) return !YOUNG_ONLY.has(firstName);
  if (age <= 30) return !OLDER_ONLY.has(firstName);
  return true;
}

export const NAME_POOL_SIZE = {
  male: FIRST_MALE.length,
  female: FIRST_FEMALE.length,
  last: LAST.length,
};
