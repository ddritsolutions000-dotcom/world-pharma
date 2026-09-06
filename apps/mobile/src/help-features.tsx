import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  fetchHelpArticle,
  fetchHelpArticles,
  fetchHelpBanners,
  fetchHelpCategories,
  fetchHelpSearch,
  HelpApiError,
  type HelpArticleSummary,
  type HelpBanner,
} from './help-api';
import type { ViewState } from './navigation';

export const HELP_LOCALE = 'en';

export type HelpCtx = {
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
  onBack: () => void;
  country: string;
  onExitApp?: () => void;
  onOpenCategory: (slug: string) => void;
  onOpenArticle: (slug: string) => void;
  onOpenSearch: () => void;
};

function HelpStates({ viewState, onRetry }: { viewState: ViewState; onRetry?: () => void }) {
  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading help" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  return null;
}

export function HelpHomeScreen({ ctx }: { ctx: HelpCtx }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [banners, setBanners] = useState<HelpBanner[]>([]);
  const [searchQ, setSearchQ] = useState('');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const [cats, arts, bns] = await Promise.all([
        fetchHelpCategories(ctx.country, HELP_LOCALE),
        fetchHelpArticles(ctx.country, HELP_LOCALE),
        fetchHelpBanners(ctx.country, HELP_LOCALE),
      ]);
      setCategories(cats.data ?? []);
      setArticles((arts.data ?? []).slice(0, 8));
      setBanners(
        (bns.data ?? []).map((b) => ({ id: b.id, slug: b.slug, title: b.title, body: b.body })),
      );
      ctx.setViewState('idle');
    } catch (err) {
      if (err instanceof HelpApiError && err.status === 0) {
        ctx.setViewState('network');
        return;
      }
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View>
      <NativeText variant="h1">Help Center</NativeText>
      <NativeText variant="caption">Operational help content only — not medical advice.</NativeText>
      {ctx.onExitApp ? <NativeButton label="Back to app" variant="secondary" onPress={ctx.onExitApp} /> : null}
      <HelpStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' ? (
        <>
          <NativeCard>
            <NativeInput label="Search" value={searchQ} onChangeText={setSearchQ} />
            <NativeButton
              label="Search help"
              onPress={() => {
                ctx.onOpenSearch();
              }}
            />
          </NativeCard>
          {banners.map((banner) => (
            <View key={banner.id}>
              <NativeCard>
                <NativeText variant="h2">{banner.title}</NativeText>
                <NativeText>{banner.body}</NativeText>
              </NativeCard>
            </View>
          ))}
          {categories.length === 0 ? (
            <NativeEmptyState title="No categories yet" description="Published categories will appear here." />
          ) : (
            categories.map((slug) => (
              <View key={slug}>
                <NativeButton label={slug} variant="secondary" onPress={() => ctx.onOpenCategory(slug)} />
              </View>
            ))
          )}
          {articles.length === 0 ? (
            <NativeEmptyState title="No articles yet" description="Published articles will appear here." />
          ) : (
            articles.map((article) => (
              <View key={article.id}>
                <NativeCard>
                  <NativeButton label={article.title} variant="secondary" onPress={() => ctx.onOpenArticle(article.slug)} />
                </NativeCard>
              </View>
            ))
          )}
        </>
      ) : null}
    </View>
  );
}

export function HelpCategoryScreen({ ctx, categorySlug }: { ctx: HelpCtx; categorySlug: string }) {
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const body = await fetchHelpArticles(ctx.country, HELP_LOCALE, { category_slug: categorySlug });
      setArticles(body.data ?? []);
      ctx.setViewState('idle');
    } catch (err) {
      if (err instanceof HelpApiError && err.status === 0) {
        ctx.setViewState('network');
        return;
      }
      ctx.setViewState('idle');
    }
  }, [categorySlug, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h1">{`Category: ${categorySlug}`}</NativeText>
      <HelpStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && articles.length === 0 ? (
        <NativeEmptyState title="No articles" description="This category has no published articles." />
      ) : null}
      {ctx.viewState === 'idle'
        ? articles.map((article) => (
            <View key={article.id}>
              <NativeCard>
                <NativeButton label={article.title} variant="secondary" onPress={() => ctx.onOpenArticle(article.slug)} />
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}

export function HelpArticleScreen({ ctx, articleSlug }: { ctx: HelpCtx; articleSlug: string }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const article = await fetchHelpArticle(ctx.country, articleSlug, HELP_LOCALE);
      if (!article) {
        ctx.setViewState('idle');
        setTitle('');
        setSummary('');
        setBody('');
        return;
      }
      setTitle(article.title);
      setSummary(article.summary);
      setBody(article.body);
      ctx.setViewState('idle');
    } catch (err) {
      if (err instanceof HelpApiError && err.status === 0) {
        ctx.setViewState('network');
        return;
      }
      ctx.setViewState('idle');
    }
  }, [articleSlug, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <HelpStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && !title ? (
        <NativeEmptyState title="Article not found" description="This article is not published." />
      ) : null}
      {ctx.viewState === 'idle' && title ? (
        <NativeCard>
          <NativeText variant="h1">{title}</NativeText>
          {summary ? <NativeText variant="caption">{summary}</NativeText> : null}
          <NativeText>{body}</NativeText>
        </NativeCard>
      ) : null}
    </View>
  );
}

export function HelpSearchScreen({ ctx, initialQuery = '' }: { ctx: HelpCtx; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<HelpArticleSummary[]>([]);
  const [message, setMessage] = useState('');

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }
      ctx.setViewState('loading');
      setMessage('');
      try {
        const body = await fetchHelpSearch(ctx.country, trimmed, HELP_LOCALE);
        setResults(body.data ?? []);
        ctx.setViewState('idle');
      } catch (err) {
        if (err instanceof HelpApiError) {
          if (err.status === 0) {
            ctx.setViewState('network');
            return;
          }
          if (err.status === 400) {
            setMessage(err.message);
            ctx.setViewState('idle');
            return;
          }
        }
        ctx.setViewState('idle');
      }
    },
    [ctx],
  );

  useEffect(() => {
    if (initialQuery.trim()) {
      void runSearch(initialQuery);
    }
  }, [initialQuery, runSearch]);

  return (
    <View>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h1">Search help</NativeText>
      <NativeCard>
        <NativeInput label="Query" value={query} onChangeText={setQuery} />
        <NativeButton label="Search" onPress={() => void runSearch(query)} />
      </NativeCard>
      <HelpStates viewState={ctx.viewState} onRetry={() => void runSearch(query)} />
      {ctx.viewState === 'idle' && message ? (
        <NativeEmptyState title="Invalid search" description={message} />
      ) : null}
      {ctx.viewState === 'idle' && query.trim() && results.length === 0 && !message ? (
        <NativeEmptyState title="No results" description="No published articles match your query." />
      ) : null}
      {ctx.viewState === 'idle'
        ? results.map((article) => (
            <View key={article.id}>
              <NativeCard>
                <NativeButton label={article.title} variant="secondary" onPress={() => ctx.onOpenArticle(article.slug)} />
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}
