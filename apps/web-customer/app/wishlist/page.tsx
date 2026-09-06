import { redirect } from 'next/navigation';

/** Canonical wishlist lives under account hub. */
export default function WishlistAliasPage() {
  redirect('/account/wishlist');
}
