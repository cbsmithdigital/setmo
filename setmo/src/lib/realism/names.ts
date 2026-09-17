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

export function pickName(rng: Rng, gender: "male" | "female"): { firstName: string; lastName: string } {
  return {
    firstName: rng.pick(gender === "male" ? FIRST_MALE : FIRST_FEMALE),
    lastName: rng.pick(LAST),
  };
}

export const NAME_POOL_SIZE = {
  male: FIRST_MALE.length,
  female: FIRST_FEMALE.length,
  last: LAST.length,
};
