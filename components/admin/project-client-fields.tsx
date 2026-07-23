"use client";

import { useMemo, useState } from "react";
import { ClientLogoUploader } from "@/components/admin/client-logo-uploader";
import { Input } from "@/components/ui/input";

export type ProjectClientOption = {
  id: string;
  label: string;
  email?: string | null;
};

type ProjectClientFieldsProps = {
  clients: ProjectClientOption[];
  defaultClientId?: string | null;
  defaultClientName?: string | null;
};

const createClientValue = "__new_client__";

export function ProjectClientFields({ clients, defaultClientId, defaultClientName }: ProjectClientFieldsProps) {
  const initialValue = defaultClientId || "";
  const [clientId, setClientId] = useState(initialValue);

  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId), [clientId, clients]);
  const isCreatingClient = clientId === createClientValue;
  const resolvedClientName = selectedClient?.label || defaultClientName || "";

  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-4 md:col-span-2">
      <div>
        <p className="font-semibold">Cliente del proyecto</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecciona un cliente existente o crea uno nuevo. Si cargas logo y web, tambien se publica en la seccion de clientes del sitio.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</span>
          <select
            name="clientId"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Seleccionar cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
            <option value={createClientValue}>Crear nuevo cliente</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente visible</span>
          <Input name="clientName" placeholder="Nombre que vera el cliente en la web" value={isCreatingClient ? "" : resolvedClientName} readOnly />
        </label>
      </div>

      {isCreatingClient ? (
        <div className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-2">
          <Input name="newClientName" placeholder="Nombre o razon social" required />
          <Input name="newClientWebsite" placeholder="Web del cliente, ej. https://empresa.com" />
          <Input name="newClientEmail" type="email" placeholder="Correo de referencia opcional" />
          <Input name="newClientSector" placeholder="Rubro del cliente, ej. inmobiliario, mineria..." />
          <ClientLogoUploader inputName="newClientLogoUrl" />
        </div>
      ) : null}
    </div>
  );
}
