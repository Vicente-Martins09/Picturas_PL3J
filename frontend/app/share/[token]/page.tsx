"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { validateShare } from "@/lib/share";

export default function ShareTokenPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token || "");
  const [error, setError] = useState("");

  useEffect(() => {
    async function run() {
      try {
        const data = await validateShare(token); // { projectId, permission }

        sessionStorage.setItem("share_token", token);
        sessionStorage.setItem("share_permission", data.permission);

        router.replace(`/dashboard/${data.projectId}`);
      } catch (e: any) {
        setError(e?.message ?? "Invalid or expired link");
      }
    }

    if (token) run();
  }, [token, router]);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold">Share link</h1>
        <p className="mt-2 text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Share link</h1>
      <p className="mt-2">A abrir projeto…</p>
    </div>
  );
}
