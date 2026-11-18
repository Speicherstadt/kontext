/** Asks for the password of one's own PGP or S/MIME key, when a mail is to be encrypted or signed. */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export type Asking = {
  kind: "pgp" | "smime";
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export const UnlockDialog = ({
  kind,
  unlock,
  onUnlocked,
  onCancel,
}: {
  kind: Asking["kind"];
  unlock: (secret: string) => Promise<unknown>;
  onUnlocked: (opened: unknown) => void;
  onCancel: () => void;
}) => {
  const [passphrase, setPassphrase] = useState("");
  const [wrong, setWrong] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      onUnlocked(await unlock(passphrase));
    } catch {
      setWrong(true);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={m.pgp_unlock()}
      description={kind === "pgp" ? m.pgp_unlock_send_hint() : m.smime_unlock_send_hint()}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Input
          type="password"
          autoFocus
          aria-label={kind === "pgp" ? m.pgp_unlock_passphrase() : m.smime_password()}
          placeholder={kind === "pgp" ? m.pgp_unlock_passphrase() : m.smime_password()}
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
            setWrong(false);
          }}
        />
        {wrong ? (
          <span role="alert" className="text-[13px] text-danger">
            {kind === "pgp" ? m.pgp_wrong_passphrase() : m.smime_wrong_password()}
          </span>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={!passphrase}>
            {m.pgp_unlock()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
