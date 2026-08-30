export const RECOMMENDATION_RULE_VERSION = 'rules_v1';
export const RECOMMENDATION_DEFAULT_LIMIT = 12;
export const RECOMMENDATION_MAX_LIMIT = 24;
export const RECOMMENDATION_RECENTLY_VIEWED_MAX = 20;

export type RecommendationSectionKind =
  | 'related'
  | 'frequently_bought_together'
  | 'recently_viewed'
  | 'wishlist_adjacent';

export interface RecommendationProduct {
  item_id: string;
  title: string;
  slug: string;
  brand_name: string;
  category_name: string;
  in_stock: boolean;
  href: string;
}

export interface RecommendationSection {
  kind: RecommendationSectionKind;
  data: RecommendationProduct[];
}

export interface ItemRecommendationsResponse {
  country: string;
  locale: string;
  item_id: string;
  rule_version: string;
  country_enabled: boolean;
  sections: {
    related: RecommendationSection;
    frequently_bought_together: RecommendationSection;
  };
}

export interface PersonalRecommendationsResponse {
  country: string;
  locale: string;
  rule_version: string;
  country_enabled: boolean;
  sections: {
    recently_viewed: RecommendationSection;
    wishlist_adjacent: RecommendationSection;
  };
}
