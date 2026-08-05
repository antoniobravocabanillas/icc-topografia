"use client";

import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CartItem } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { addCartItem } from "@/components/cart/cart-store";

type AddToCartButtonProps = {
  item: Omit<CartItem, "quantity">;
  disabled?: boolean;
  disabledLabel?: string;
  label?: string;
  addedLabel?: string;
  className?: string;
};

export function AddToCartButton({
  item,
  disabled,
  disabledLabel = "No disponible para compra directa",
  label = "Agregar al carrito",
  addedLabel = "Ver carrito",
  className
}: AddToCartButtonProps) {
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addCartItem({ ...item, quantity: 1 });
    setAdded(true);
  }

  if (added) {
    return (
      <Button asChild className={cn("w-full", className)}>
        <Link href="/checkout">
          <Check className="h-4 w-4" />
          {addedLabel}
        </Link>
      </Button>
    );
  }

  return (
    <Button type="button" className={cn("w-full", className)} disabled={disabled} onClick={handleAdd}>
      <ShoppingCart className="h-4 w-4" />
      {disabled ? disabledLabel : label}
    </Button>
  );
}
