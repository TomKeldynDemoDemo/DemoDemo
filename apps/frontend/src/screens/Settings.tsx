import { useState } from "react";
import { Link, Outlet } from "react-router-dom";

const API = import.meta.env.VITE_APP_BACKEND_URL ?? "http://localhost:3000";

export const Settings = () => {
  const [backupId, setBackupId] = useState(
    () => sessionStorage.getItem("accountBackupId") ?? "",
  );
  const [status, setStatus] = useState("");

  async function deleteAccount() {
    setStatus("");
    const res = await fetch(`${API}/v1/me`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.message ?? "Could not delete the account");
      return;
    }
    sessionStorage.setItem("accountBackupId", body.backupId);
    setBackupId(body.backupId);
    setStatus("Account deleted. Use Undo delete if this was a mistake.");
  }

  async function undoDelete() {
    setStatus("");
    const res = await fetch(`${API}/v1/me/undo-delete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.message ?? "Could not restore the account");
      return;
    }
    sessionStorage.removeItem("accountBackupId");
    setBackupId("");
    setStatus(`Restored ${body.name ?? body.email}.`);
  }

  return (
    <div className="max-w-full mt-0">
      <h2 className="text-xl font-bold">Settings</h2>

      <div className="flex mt-8 gap-16">
        <div className="">
          <Link className="flex gap-2 items-center" to="themes">
            <img src="/theme.svg" className="w-8 h-8" alt="icon" />
            <span>Themes</span>
          </Link>
        </div>
        <div className="flex-1 space-y-4">
          <Outlet />
          <div className="border border-border rounded-md p-4 max-w-md">
            <h3 className="font-semibold">Account</h3>
            <p className="text-sm mt-1 mb-3">
              Deleting saves your name, email, and sign-in provider so you can undo it.
            </p>
            <div className="flex gap-2">
              <button type="button" className="underline" onClick={deleteAccount}>
                Delete account
              </button>
              <button
                type="button"
                className="underline disabled:opacity-40"
                onClick={undoDelete}
                disabled={!backupId}
              >
                Undo delete
              </button>
            </div>
            {status ? <p className="text-sm mt-3">{status}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
};
