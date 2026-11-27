/** Firmenverwaltung: Räume und Geräte (`x:Account` mit `@type: "Resource"`). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Package, Plus } from "lucide-react";
import { useState } from "react";
import { type Company, getResources, type Resource } from "@/company-core/api";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { CompanyGate } from "./gate";
import { ResourceDialog } from "./resource-dialog";

const RESOURCES_KEY = ["company", "resources"] as const;

export const ResourcesSection = () => (
  <CompanyGate>{(company) => <Resources company={company} />}</CompanyGate>
);

const detailsOf = (resource: Resource): string => {
  const parts = [
    resource.kind === "room" ? m.company_resource_kind_room() : m.company_resource_kind_equipment(),
    resource.location,
    resource.capacity ? m.company_resource_seats({ count: resource.capacity }) : "",
    resource.booking.mode === "automatic"
      ? m.company_resource_booking_auto()
      : m.company_resource_booking_manual(),
  ].filter(Boolean);
  return parts.join(" · ");
};

const Resources = ({ company }: { company: Company }) => {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: RESOURCES_KEY, queryFn: getResources });
  const [open, setOpen] = useState<string | "new" | null>(null);
  const resources = data?.resources ?? [];
  const editing = resources.find((item) => item.id === open);

  return (
    <>
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <p className="m-0 flex-1 text-[13px] text-muted">{m.company_resources_hint()}</p>
        <Button variant="primary" onClick={() => setOpen("new")}>
          <Plus size={16} /> {m.company_resource_new()}
        </Button>
      </div>
      {resources.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0">
          {resources.map((item) => (
            <li key={item.id} className="flex items-center hover:bg-hover">
              <button
                type="button"
                onClick={() => setOpen(item.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left md:px-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-muted">
                  {item.kind === "room" ? <DoorOpen size={16} /> : <Package size={16} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-medium">
                    {item.description || item.email}
                    {item.description ? (
                      <span className="font-normal text-muted"> · {item.email}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-[13px] text-muted">{detailsOf(item)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">{m.company_no_resources()}</p>
      )}
      {open ? (
        <ResourceDialog
          company={company}
          resource={editing}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: RESOURCES_KEY })}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
};
