export type RecentlyViewedProduct = {
  item_id: string;
  slug: string;
  title: string;
  brand_name: string;
  category_name: string;
  viewed_at: string;
  available: boolean;
  in_stock: boolean;
  rx_required: boolean;
  sell_minor: string | null;
  currency: string;
  best_offer_id: string | null;
  unavailable_reason: string | null;
  href: string;
  image_url: string | null;
};

export type RecentlyViewedResponse = {
  country: string;
  locale: string;
  sandbox: true;
  data: RecentlyViewedProduct[];
};
