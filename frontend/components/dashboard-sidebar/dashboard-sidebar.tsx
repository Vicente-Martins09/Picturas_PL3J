"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "../ui/sidebar";
import { Plus, Sparkles } from "lucide-react";
import NavUser from "./nav-user-sidebar";
import { usePathname } from "next/navigation";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import NewProjectDialog from "./new-project-dialog";
import ProjectList from "./project-list";
import { useSession } from "@/providers/session-provider";
import ShareLinksSection from "./share-list"; 


export default function DashboardSidebar() {
  const path = usePathname();
  const router = useRouter();
  const session = useSession();
  const isFreePlan = session.user.type === "free";
  const isAnonymous = session.user.type === "anonymous";
  const isProjectPage =
    path.startsWith("/dashboard/") && !path.includes("/dashboard/account");
  const pid = isProjectPage ? path.split("/dashboard/")[1]?.split("/")[0] : "";

  if (!path.includes("/dashboard/account"))
    return (
      <Sidebar>
        <SidebarHeader>
          <Link
            href="/"
            className="font-title text-4xl pt-4 text-center text-primary font-bold"
          >
            PictuRAS
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="gap-2">
            <NewProjectDialog>
              <Button className="inline-flex">
                <Plus /> New Project
              </Button>
            </NewProjectDialog>
            {(isFreePlan || isAnonymous) && (
              <Button
                className="inline-flex"
                variant="outline"
                onClick={() =>
                  router.push(
                    isFreePlan ? "/dashboard/account/upgrade" : "/register",
                  )
                }
              >
                <Sparkles className="text-indigo-500" />{" "}
                {isFreePlan ? "Upgrade to Premium" : "Unlock Features"}
              </Button>
            )}
          </SidebarGroup>
          <ProjectList />
          {pid && session.user.type !== "anonymous" && (
            <ShareLinksSection pid={pid} />
          )}
        </SidebarContent>
        <SidebarFooter>
          {session.user.type !== "anonymous" ? (
            <NavUser
              user={{
                name: session.user.name ?? "",
                email: session.user.email ?? "",
                isPremium: session.user.type === "premium",
              }}
            />
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" asChild className="flex-1">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    );
}
