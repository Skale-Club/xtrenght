import { redirect } from "next/navigation";

/** Profile editing moved into Settings. Kept as a redirect for old links. */
export default function ProfilePage() {
  redirect("/settings");
}
