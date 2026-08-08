"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CartItem, getCartSubtotal } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";
import { readCart, writeCart } from "@/components/cart/cart-store";
import { LocationSelect } from "@/components/location/location-select";

type CheckoutStatus = "idle" | "loading" | "success" | "error";

export function CheckoutClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [message, setMessage] = useState("");
  const subtotal = useMemo(() => getCartSubtotal(items), [items]);

  useEffect(() => {
    setItems(readCart());
  }, []);

  function updateCart(nextItems: CartItem[]) {
    setItems(nextItems);
    writeCart(nextItems);
  }

  function updateQuantity(productId: string, quantity: number) {
    updateCart(
      items.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, Math.min(quantity, Math.max(item.stock, 1))) }
          : item
      )
    );
  }

  function removeItem(productId: string) {
    updateCart(items.filter((item) => item.productId !== productId));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items.length || status === "loading") return;

    setStatus("loading");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const company = String(formData.get("company") || "").trim();
    const country = String(formData.get("country") || "PE").trim();
    const subdivision = String(formData.get("subdivision") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      notes: [
        company ? `Empresa: ${company}` : "",
        [country, subdivision, city].filter(Boolean).length ? `Ubicacion: ${[country, subdivision, city].filter(Boolean).join(" / ")}` : "",
        notes,
      ].filter(Boolean).join("\n\n"),
      items: items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
    };

    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus("error");
      setMessage(result?.error?.message || "No pudimos registrar el pedido. Revisa los datos e intentalo nuevamente.");
      return;
    }

    updateCart([]);
    setStatus("success");
    setMessage(`Pedido registrado. Codigo interno: ${result?.id || result?.data?.id || "pendiente"}.`);
  }

  if (!items.length && status !== "success") {
    return (
      <section className="container py-16">
        <div className="rounded-lg border bg-card p-8 shadow-technical">
          <ShoppingCart className="h-8 w-8 text-primary" />
          <h1 className="mt-5 text-4xl font-bold">Tu carrito esta vacio</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Agrega equipos con precio publicado desde la tienda. Para productos bajo cotizacion, usa el formulario de la ficha tecnica.
          </p>
          <Button asChild className="mt-6">
            <Link href="/tienda">Ir a tienda tecnica <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="container grid gap-10 py-16 lg:grid-cols-[1fr_420px]">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Checkout B2B</p>
        <h1 className="mt-3 text-4xl font-bold">Confirmar pedido consultivo</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Revisamos disponibilidad, condiciones comerciales, entrega y soporte antes de cerrar la operacion.
        </p>

        <div className="mt-8 space-y-4">
          {items.map((item) => (
            <Card key={item.productId} className="overflow-hidden">
              <CardContent className="grid gap-4 p-4 md:grid-cols-[120px_1fr_auto] md:items-center">
                <Link href={`/tienda/${item.slug}`} className="relative aspect-[4/3] overflow-hidden rounded-md border bg-white">
                  {item.image ? <Image src={item.image} alt={item.name} fill sizes="120px" className="object-contain p-2" /> : null}
                </Link>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{item.brand}{item.model ? ` - ${item.model}` : ""}</p>
                  <Link href={`/tienda/${item.slug}`} className="mt-1 block text-lg font-bold hover:text-primary">{item.name}</Link>
                  <p className="mt-2 text-sm text-muted-foreground">{item.stock} disponible(s)</p>
                  <div className="mt-4 inline-flex items-center rounded-md border">
                    <Button type="button" variant="ghost" size="icon" aria-label="Restar unidad" onClick={() => updateQuantity(item.productId, item.quantity - 1)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-10 text-center text-sm font-bold">{item.quantity}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label="Sumar unidad" onClick={() => updateQuantity(item.productId, item.quantity + 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 md:block md:text-right">
                  <p className="text-lg font-bold">{formatCurrency(item.price * item.quantity, item.currency)}</p>
                  <Button type="button" variant="ghost" size="icon" aria-label="Eliminar producto" className="mt-2 text-destructive" onClick={() => removeItem(item.productId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Resumen comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal referencial</span>
              <span className="font-bold">{formatCurrency(subtotal)}</span>
            </div>
            <p className="rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
              El pedido queda registrado para validacion comercial. Impuestos, despacho, garantia, calibracion y capacitacion se confirman con un asesor.
            </p>
          </CardContent>
        </Card>

        <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-card p-5 shadow-technical">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Input required name="name" placeholder="Nombre y apellido" autoComplete="name" />
            <Input required name="email" type="email" placeholder="Correo corporativo" autoComplete="email" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Input name="company" placeholder="Empresa" autoComplete="organization" />
            <Input name="phone" placeholder="Telefono / WhatsApp" autoComplete="tel" />
          </div>
          <LocationSelect required />
          <Textarea name="notes" placeholder="Indica ciudad, plazo, RUC, despacho o condiciones comerciales que necesitas" />
          <Button disabled={status === "loading" || status === "success"} type="submit">
            {status === "loading" ? "Registrando..." : status === "success" ? "Pedido registrado" : "Registrar pedido"}
          </Button>
          {message ? <p className={status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-accent"}>{message}</p> : null}
        </form>
      </aside>
    </section>
  );
}
