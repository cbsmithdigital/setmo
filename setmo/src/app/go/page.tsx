import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole, getActiveRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Resolver: sends a signed-in user to their active role's home. Used after
// login and when a role guard bounces someone off a page they can't access.
export default async function GoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homeForRole(getActiveRole(user)));
}
