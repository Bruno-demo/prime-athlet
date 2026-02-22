import { getAuthenticatedUser } from "@/lib/auth";
import { SiteHeaderClient } from "@/components/site-header-client";
export async function SiteHeader() {
  let user = null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    user = null;
  }
  return <SiteHeaderClient isAuthenticated={Boolean(user)} />;
}
