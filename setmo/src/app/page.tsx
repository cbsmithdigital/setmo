import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole, getActiveRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homeForRole(getActiveRole(user)));
}
