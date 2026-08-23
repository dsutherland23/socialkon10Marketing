import { formatMoney } from "./data";
import { useShop } from "./shop";

/* Display-currency hook (PRD §59 — display estimates; charges remain USD).
   Every monetary value on the site must render through this so the
   header currency selector applies everywhere. */
export function useMoney() {
  const { currency } = useShop();
  return (usd: number) => formatMoney(usd, currency);
}
