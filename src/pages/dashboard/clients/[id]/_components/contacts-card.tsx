import * as React from "react";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChoiceField, FieldGrid, TextField } from "@/features/clients/components/part-fields";
import {
  CONTACT_FLAGS,
  removeContactAction,
  saveContactAction,
  type ClientCard,
  type ContactInput,
  type ContactView,
} from "@/features/clients/services/clients";
import { useErrorMessage } from "@/i18n/errors";
import { phoneText } from "@/lib/text/phone";

import { ReasonDialog } from "../../../files/_components/reason-dialog";

/**
 * The client's contact people (his forms' people on site) with their five
 * roles: signs the hand-over, receives the invoice, coordinates the site,
 * holds a key, follows the service.
 *
 * Closest academy screen: a student's guardians block (students/[id]/page.tsx):
 * a list in a card, a dialog to add or change one.
 */

const emptyContact = (): ContactInput => ({
  name: "",
  role: null,
  phone: null,
  phone2: null,
  siteId: null,
  note: null,
  flags: { signsHandover: false, receivesInvoice: false, isCoordinator: false, holdsKey: false, followsService: false },
});

export function ContactsCard({ client, writes }: { client: ClientCard; writes: boolean }) {
  const t = useTranslations("Clients");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = React.useState<{ id: string | null; contact: ContactInput } | null>(null);
  const [removing, setRemoving] = React.useState<ContactView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const siteName = (id: string) => {
    const site = client.sites.find((one) => one.id === id);
    return site?.commonName ?? site?.address ?? id;
  };

  async function save() {
    if (!editing) return;
    setBusy(true);
    const result = await saveContactAction({ clientId: client.id, contactId: editing.id, contact: editing.contact });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    setEditing(null);
    toast.success(t("ContactSaved"));
  }

  const contact = editing?.contact;
  const set = (patch: Partial<ContactInput>) =>
    setEditing((current) => current && { ...current, contact: { ...current.contact, ...patch } });

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t("Contacts")}</CardTitle>
          {writes && (
            <Button type="button" variant="add" onClick={() => setEditing({ id: null, contact: emptyContact() })}>
              <Plus />
              {t("AddContact")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {client.contacts.length === 0 ? (
          <p className="text-muted-foreground">{t("NoContacts")}</p>
        ) : (
          <ul className="divide-y">
            {client.contacts.map((one) => (
              <li key={one.id} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-3">
                <div className="min-w-40">
                  <p className="font-semibold">{one.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[one.role, one.siteId ? siteName(one.siteId) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {one.phone && <Ltr className="tabular-nums">{phoneText(one.phone)}</Ltr>}
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {CONTACT_FLAGS.filter((flag) => one.flags[flag]).map((flag) => (
                    <StatusChip key={flag} tone="info" label={t(`ContactFlags.${flag}`)} />
                  ))}
                </div>
                {writes && (
                  <div className="ms-auto flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditing({
                          id: one.id,
                          contact: {
                            name: one.name,
                            role: one.role,
                            phone: one.phone,
                            phone2: one.phone2,
                            siteId: one.siteId,
                            note: one.note,
                            flags: one.flags,
                          },
                        })
                      }
                    >
                      <Pencil />
                      {t("EditContact")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(one)}>
                      <Trash2 />
                      {t("RemoveContact")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {contact && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? t("EditContact") : t("AddContact")}</DialogTitle>
            </DialogHeader>
            <FieldGrid>
              <TextField label={t("ContactName")} value={contact.name} onChange={(name) => set({ name })} />
              <TextField label={t("ContactRole")} value={contact.role ?? ""} onChange={(role) => set({ role })} />
              <TextField label={t("Phone")} ltr value={contact.phone ?? ""} onChange={(phone) => set({ phone })} />
              <TextField
                label={t("Fields.phone2")}
                ltr
                value={contact.phone2 ?? ""}
                onChange={(phone2) => set({ phone2 })}
              />
              <ChoiceField
                label={t("ContactSite")}
                value={contact.siteId ?? null}
                options={client.sites.map((site) => site.id)}
                labelOf={siteName}
                emptyLabel={t("AllSites")}
                onChange={(siteId) => set({ siteId })}
                className="sm:col-span-2"
              />
              {CONTACT_FLAGS.map((flag) => (
                <div key={flag} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={`contact-${flag}`}
                    checked={contact.flags?.[flag] ?? false}
                    onCheckedChange={(checked) =>
                      set({ flags: { ...emptyContact().flags, ...contact.flags, [flag]: checked === true } })
                    }
                  />
                  <Label htmlFor={`contact-${flag}`} className="font-normal">
                    {t(`ContactFlags.${flag}`)}
                  </Label>
                </div>
              ))}
              <TextField
                label={t("Fields.note")}
                multiline
                value={contact.note ?? ""}
                onChange={(note) => set({ note })}
                className="sm:col-span-2"
              />
            </FieldGrid>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {tCommon("Cancel")}
              </Button>
              <Button type="button" variant="success" disabled={busy} onClick={() => void save()}>
                {t("Save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <ReasonDialog
        open={removing !== null}
        title={t("RemoveContact")}
        description={t("RemoveContactHint")}
        confirmLabel={t("RemoveContact")}
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async (reason) => {
          const target = removing;
          setRemoving(null);
          if (!target) return;
          const result = await removeContactAction({ contactId: target.id, reason });
          if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
          else toast.success(t("ContactRemoved"));
        }}
      />
    </Card>
  );
}
