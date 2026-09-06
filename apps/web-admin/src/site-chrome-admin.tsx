'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import {
  DEFAULT_SITE_FOOTER,
  DEFAULT_SITE_HERO,
  DEFAULT_SITE_NAV,
  DEFAULT_SITE_SEO,
  parseSiteFooter,
  parseSiteHero,
  parseSiteNav,
  parseSiteSeo,
  SITE_FOOTER_SLUG,
  SITE_HERO_SLUG,
  SITE_NAV_SLUG,
  SITE_SEO_SLUG,
  type SiteFooterDocument,
  type SiteHeroDocument,
  type SiteLink,
  type SiteNavDocument,
  type SiteNavSection,
  type SiteSeoDocument,
} from '@world-pharma/shared/site-chrome';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, FormField, Heading, Input, LoadingState, PermissionDeniedState, Text, TextArea } from '@world-pharma/ui-kit/web';
import { CmsAdminApiError, listCmsContent } from './cms-admin-api';
import { upsertPublishedPackString } from './site-chrome-save';
import { persistAdminCountry, resolveAdminWorkingCountry } from './working-country';
import { MarketCountrySelect } from './market-country-select';
import { customerSiteUrl } from './site-url';

type Tab = 'nav' | 'footer' | 'home' | 'layout' | 'seo' | 'preview';

function FieldInput({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <FormField label={label}>{({ id }) => <Input id={id} {...props} />}</FormField>;
}

function FieldArea({
  label,
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <FormField label={label}>{({ id }) => <TextArea id={id} {...props} />}</FormField>;
}

function moveItem<T>(rows: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir;
  if (next < 0 || next >= rows.length) {
    return rows;
  }
  const copy = [...rows];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function LinkRows({
  rows,
  extra,
  onChange,
}: {
  rows: SiteLink[];
  extra?: 'description' | 'icon';
  onChange: (rows: SiteLink[]) => void;
}) {
  return (
    <div className="wp-stack">
      {rows.map((link, index) => (
        <div key={`${link.href}-${index}`} className="wp-toolbar">
          <Input
            value={link.label}
            onChange={(event) =>
              onChange(rows.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)))
            }
          />
          <Input
            value={link.href}
            onChange={(event) =>
              onChange(rows.map((row, i) => (i === index ? { ...row, href: event.target.value } : row)))
            }
          />
          {extra === 'description' ? (
            <Input
              value={link.description ?? ''}
              onChange={(event) =>
                onChange(rows.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)))
              }
            />
          ) : null}
          {extra ? (
            <Input
              value={link.icon ?? ''}
              onChange={(event) =>
                onChange(rows.map((row, i) => (i === index ? { ...row, icon: event.target.value } : row)))
              }
            />
          ) : null}
          <Button variant="tertiary" size="sm" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => onChange([...rows, { href: '/', label: 'New link' }])}>
        Add link
      </Button>
    </div>
  );
}

function patchSection(nav: SiteNavDocument, index: number, next: SiteNavSection): SiteNavDocument {
  return { ...nav, sections: nav.sections.map((row, i) => (i === index ? next : row)) };
}

export function SiteChromeAdmin() {
  const { getAccessToken, session } = useSession();
  const [country, setCountry] = useState(() =>
    resolveAdminWorkingCountry({ sessionCountry: session.countryCode }),
  );
  const [tab, setTab] = useState<Tab>('nav');
  const [nav, setNav] = useState<SiteNavDocument>(DEFAULT_SITE_NAV);
  const [footer, setFooter] = useState<SiteFooterDocument>(DEFAULT_SITE_FOOTER);
  const [hero, setHero] = useState<SiteHeroDocument>(DEFAULT_SITE_HERO);
  const [seo, setSeo] = useState<SiteSeoDocument>(DEFAULT_SITE_SEO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canWrite = session.permissions.includes('cms:write');
  const canPublish = session.permissions.includes('cms:publish');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (!country) {
      setLoading(false);
      setError('Select a country before loading site chrome packs.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const listed = await listCmsContent(token, { country_code: country, content_type: 'PACK_STRING' });
      const bySlug = new Map(listed.data.map((row) => [row.slug, row]));
      setNav(parseSiteNav(bySlug.get(SITE_NAV_SLUG)?.body));
      setFooter(parseSiteFooter(bySlug.get(SITE_FOOTER_SLUG)?.body));
      setHero(parseSiteHero(bySlug.get(SITE_HERO_SLUG)?.body));
      setSeo(parseSiteSeo(bySlug.get(SITE_SEO_SLUG)?.body));
    } catch (err) {
      if (err instanceof CmsAdminApiError && err.status === 403) {
        setError('cms:read is required');
      } else {
        setError('Could not load published chrome packs');
      }
    } finally {
      setLoading(false);
    }
  }, [country, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  async function save(slug: string, title: string, summary: string, body: unknown) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await upsertPublishedPackString({
        token,
        country,
        slug,
        title,
        summary,
        body: JSON.stringify(body, null, 2),
      });
      setMessage(`Published ${title} to customer 3000`);
    } catch (err) {
      setError(err instanceof CmsAdminApiError ? err.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  }

  if (!session.permissions.includes('cms:read')) {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading storefront chrome" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Header, footer &amp; SEO</Heading>
        <p className="wp-page-intro">
          These packs publish as CMS <code>PACK_STRING</code> documents (<code>site-nav</code>, <code>site-footer</code>,{' '}
          <code>site-hero</code>, <code>site-seo</code>). Customer 3000 reads them from Help after publish. No source
          change is required to rename a menu item. Scripts in URLs are stripped.
        </p>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect
          ariaLabel="Site chrome country"
          value={country}
          onChange={(iso) => setCountry(persistAdminCountry(iso))}
        />
        <Button variant={tab === 'nav' ? 'primary' : 'secondary'} onClick={() => setTab('nav')}>
          Navigation
        </Button>
        <Button variant={tab === 'footer' ? 'primary' : 'secondary'} onClick={() => setTab('footer')}>
          Footer
        </Button>
        <Button variant={tab === 'home' ? 'primary' : 'secondary'} onClick={() => setTab('home')}>
          Homepage copy
        </Button>
        <Button variant={tab === 'layout' ? 'primary' : 'secondary'} onClick={() => setTab('layout')}>
          Home sections
        </Button>
        <Button variant={tab === 'preview' ? 'primary' : 'secondary'} onClick={() => setTab('preview')}>
          Preview
        </Button>
        <Button variant={tab === 'seo' ? 'primary' : 'secondary'} onClick={() => setTab('seo')}>
          SEO &amp; redirects
        </Button>
        <Link href={customerSiteUrl()} target="_blank" rel="noreferrer">
          <Button variant="tertiary">Preview customer 3000</Button>
        </Link>
        <Link href="/cms">
          <Button variant="tertiary">Open CMS versions</Button>
        </Link>
      </div>
      {message ? <Text>{message}</Text> : null}
      {error ? <Text>{error}</Text> : null}

      {tab === 'nav' ? (
        <Card>
          <Heading level={2}>Primary menu · {country}</Heading>
          <Heading level={3}>Top strip</Heading>
          <LinkRows rows={nav.topStrip} onChange={(topStrip) => setNav({ ...nav, topStrip })} />
          {nav.sections.map((section, index) => (
            <div key={section.id} className="wp-stack" style={{ borderTop: '1px solid var(--wp-border, #ddd)', paddingTop: 12 }}>
              <FieldInput
                label={`Tab ${index + 1} label`}
                value={section.label}
                onChange={(event) => setNav(patchSection(nav, index, { ...section, label: event.target.value }))}
              />
              <FieldInput
                label="Direct link (empty = mega menu)"
                value={section.href ?? ''}
                onChange={(event) =>
                  setNav(patchSection(nav, index, { ...section, href: event.target.value || undefined }))
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={(event) => setNav(patchSection(nav, index, { ...section, enabled: event.target.checked }))}
                />{' '}
                Visible
              </label>
              <Heading level={3}>Featured tiles</Heading>
              <LinkRows
                extra="description"
                rows={section.featured ?? []}
                onChange={(featured) => setNav(patchSection(nav, index, { ...section, featured }))}
              />
              <Heading level={3}>Mega menu columns</Heading>
              {(section.columns ?? []).map((col, colIndex) => (
                <div key={`${col.title}-${colIndex}`} className="wp-stack">
                  <FieldInput
                    label={`Column ${colIndex + 1} heading`}
                    value={col.title}
                    onChange={(event) =>
                      setNav(
                        patchSection(nav, index, {
                          ...section,
                          columns: (section.columns ?? []).map((row, i) =>
                            i === colIndex ? { ...row, title: event.target.value } : row,
                          ),
                        }),
                      )
                    }
                  />
                  <LinkRows
                    extra="icon"
                    rows={col.links}
                    onChange={(links) =>
                      setNav(
                        patchSection(nav, index, {
                          ...section,
                          columns: (section.columns ?? []).map((row, i) => (i === colIndex ? { ...row, links } : row)),
                        }),
                      )
                    }
                  />
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() =>
                      setNav(
                        patchSection(nav, index, {
                          ...section,
                          columns: (section.columns ?? []).filter((_, i) => i !== colIndex),
                        }),
                      )
                    }
                  >
                    Remove column
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setNav(
                    patchSection(nav, index, {
                      ...section,
                      columns: [...(section.columns ?? []), { title: 'New column', links: [] }],
                    }),
                  )
                }
              >
                Add column
              </Button>
              <div className="wp-toolbar">
                <Button variant="secondary" size="sm" onClick={() => setNav({ ...nav, sections: moveItem(nav.sections, index, -1) })}>
                  Move up
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setNav({ ...nav, sections: moveItem(nav.sections, index, 1) })}>
                  Move down
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setNav({
                      ...nav,
                      sections: [
                        ...nav.sections.slice(0, index + 1),
                        { ...section, id: `${section.id}-copy-${Date.now()}`, label: `${section.label} copy` },
                        ...nav.sections.slice(index + 1),
                      ],
                    })
                  }
                >
                  Duplicate
                </Button>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => setNav({ ...nav, sections: nav.sections.filter((_, i) => i !== index) })}
                >
                  Remove tab
                </Button>
              </div>
            </div>
          ))}
          <div className="wp-toolbar">
            <Button
              variant="secondary"
              onClick={() =>
                setNav({
                  ...nav,
                  sections: [
                    ...nav.sections,
                    { id: `tab-${Date.now()}`, label: 'New tab', href: '/', enabled: true, featured: [], columns: [] },
                  ],
                })
              }
            >
              Add menu tab
            </Button>
            <Button
              disabled={saving || !canWrite || !canPublish}
              onClick={() => void save(SITE_NAV_SLUG, 'Storefront navigation', 'Primary menu JSON', nav)}
            >
              Publish navigation
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === 'footer' ? (
        <Card>
          <Heading level={2}>Footer</Heading>
          <FieldArea
            label="Tagline"
            value={footer.tagline}
            onChange={(event) => setFooter({ ...footer, tagline: event.target.value })}
          />
          <FieldInput
            label="Copyright (year is added on the site)"
            value={footer.copyright}
            onChange={(event) => setFooter({ ...footer, copyright: event.target.value })}
          />
          <FieldArea
            label="Disclaimer"
            value={footer.disclaimer}
            onChange={(event) => setFooter({ ...footer, disclaimer: event.target.value })}
          />
          {footer.columns.map((col, index) => (
            <div key={`${col.title}-${index}`} className="wp-stack">
              <FieldInput
                label={`Column ${index + 1} heading`}
                value={col.title}
                onChange={(event) =>
                  setFooter({
                    ...footer,
                    columns: footer.columns.map((row, i) => (i === index ? { ...row, title: event.target.value } : row)),
                  })
                }
              />
              {col.links.map((link, linkIndex) => (
                <div key={`${link.href}-${linkIndex}`} className="wp-toolbar">
                  <Input
                    value={link.label}
                    onChange={(event) =>
                      setFooter({
                        ...footer,
                        columns: footer.columns.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                links: row.links.map((item, j) =>
                                  j === linkIndex ? { ...item, label: event.target.value } : item,
                                ),
                              }
                            : row,
                        ),
                      })
                    }
                  />
                  <Input
                    value={link.href}
                    onChange={(event) =>
                      setFooter({
                        ...footer,
                        columns: footer.columns.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                links: row.links.map((item, j) =>
                                  j === linkIndex ? { ...item, href: event.target.value } : item,
                                ),
                              }
                            : row,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setFooter({
                    ...footer,
                    columns: footer.columns.map((row, i) =>
                      i === index ? { ...row, links: [...row.links, { href: '/', label: 'New link' }] } : row,
                    ),
                  })
                }
              >
                Add link
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setFooter({
                ...footer,
                columns: [...footer.columns, { title: 'New column', links: [{ href: '/help', label: 'Help' }] }],
              })
            }
          >
            Add column
          </Button>
          <Button
            disabled={saving || !canWrite || !canPublish}
            onClick={() => void save(SITE_FOOTER_SLUG, 'Storefront footer', 'Footer JSON', footer)}
          >
            Publish footer
          </Button>
        </Card>
      ) : null}

      {tab === 'home' ? (
        <Card>
          <Heading level={2}>Homepage copy</Heading>
          <FieldInput
            label="Promo kicker"
            value={hero.promoKicker}
            onChange={(event) => setHero({ ...hero, promoKicker: event.target.value })}
          />
          <FieldInput
            label="Promo title"
            value={hero.promoTitle}
            onChange={(event) => setHero({ ...hero, promoTitle: event.target.value })}
          />
          <FieldArea
            label="Promo subtitle"
            value={hero.promoSub}
            onChange={(event) => setHero({ ...hero, promoSub: event.target.value })}
          />
          <FieldInput
            label="Consult kicker"
            value={hero.consultKicker}
            onChange={(event) => setHero({ ...hero, consultKicker: event.target.value })}
          />
          <FieldInput
            label="Consult title"
            value={hero.consultTitle}
            onChange={(event) => setHero({ ...hero, consultTitle: event.target.value })}
          />
          <FieldArea
            label="Consult body"
            value={hero.consultBody}
            onChange={(event) => setHero({ ...hero, consultBody: event.target.value })}
          />
          <Heading level={3}>Consult buttons</Heading>
          <LinkRows rows={hero.consultLinks} onChange={(consultLinks) => setHero({ ...hero, consultLinks })} />
          <FieldInput
            label="Rx banner title"
            value={hero.rxTitle}
            onChange={(event) => setHero({ ...hero, rxTitle: event.target.value })}
          />
          <FieldArea
            label="Rx banner body"
            value={hero.rxBody}
            onChange={(event) => setHero({ ...hero, rxBody: event.target.value })}
          />
          <FieldInput
            label="Rx CTA"
            value={hero.rxCta}
            onChange={(event) => setHero({ ...hero, rxCta: event.target.value })}
          />
          <FieldInput
            label="Rx link"
            value={hero.rxHref}
            onChange={(event) => setHero({ ...hero, rxHref: event.target.value })}
          />
          <Heading level={3}>Stat strip</Heading>
          {hero.stats.map((stat, index) => (
            <div key={`${stat.label}-${index}`} className="wp-toolbar">
              <Input
                value={stat.value}
                onChange={(event) =>
                  setHero({
                    ...hero,
                    stats: hero.stats.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)),
                  })
                }
              />
              <Input
                value={stat.label}
                onChange={(event) =>
                  setHero({
                    ...hero,
                    stats: hero.stats.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)),
                  })
                }
              />
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => setHero({ ...hero, stats: hero.stats.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setHero({ ...hero, stats: [...hero.stats, { value: '0', label: 'New stat' }] })}
          >
            Add stat
          </Button>
          <Heading level={3}>Service shortcuts</Heading>
          {hero.shortcuts.map((item, index) => (
            <div key={`${item.href}-${index}`} className="wp-toolbar">
              <Input
                value={item.icon}
                onChange={(event) =>
                  setHero({
                    ...hero,
                    shortcuts: hero.shortcuts.map((row, i) => (i === index ? { ...row, icon: event.target.value } : row)),
                  })
                }
              />
              <Input
                value={item.label}
                onChange={(event) =>
                  setHero({
                    ...hero,
                    shortcuts: hero.shortcuts.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)),
                  })
                }
              />
              <Input
                value={item.sub}
                onChange={(event) =>
                  setHero({
                    ...hero,
                    shortcuts: hero.shortcuts.map((row, i) => (i === index ? { ...row, sub: event.target.value } : row)),
                  })
                }
              />
              <Input
                value={item.href}
                onChange={(event) =>
                  setHero({
                    ...hero,
                    shortcuts: hero.shortcuts.map((row, i) => (i === index ? { ...row, href: event.target.value } : row)),
                  })
                }
              />
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => setHero({ ...hero, shortcuts: hero.shortcuts.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setHero({
                ...hero,
                shortcuts: [
                  ...hero.shortcuts,
                  { href: '/', label: 'New shortcut', sub: 'NEW', bg: '#f4f4f5', icon: '•' },
                ],
              })
            }
          >
            Add shortcut
          </Button>
          <Button
            disabled={saving || !canWrite || !canPublish}
            onClick={() => void save(SITE_HERO_SLUG, 'Homepage copy', 'Home hero JSON', hero)}
          >
            Publish homepage copy
          </Button>
        </Card>
      ) : null}

      {tab === 'layout' ? (
        <Card>
          <Heading level={2}>Homepage section order</Heading>
          <Text tone="secondary">Enable, disable, and reorder rails. Publish with homepage copy pack (site-hero).</Text>
          {hero.rails.map((rail, index) => (
            <div key={rail.id} className="wp-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={rail.enabled}
                  onChange={(event) =>
                    setHero({
                      ...hero,
                      rails: hero.rails.map((row, i) => (i === index ? { ...row, enabled: event.target.checked } : row)),
                    })
                  }
                />{' '}
                {rail.label}
              </label>
              <Button variant="secondary" size="sm" onClick={() => setHero({ ...hero, rails: moveItem(hero.rails, index, -1) })}>
                Up
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setHero({ ...hero, rails: moveItem(hero.rails, index, 1) })}>
                Down
              </Button>
            </div>
          ))}
          <Button
            disabled={saving || !canWrite || !canPublish}
            onClick={() => void save(SITE_HERO_SLUG, 'Homepage copy', 'Home hero JSON', hero)}
          >
            Publish homepage layout
          </Button>
        </Card>
      ) : null}

      {tab === 'preview' ? (
        <Card>
          <Heading level={2}>Customer preview</Heading>
          <Text tone="secondary">Live 3000 after publish. Desktop vs mobile width only — not a separate CMS renderer.</Text>
          <div className="wp-toolbar">
            <a href={customerSiteUrl()} target="_blank" rel="noreferrer">
              Open 3000
            </a>
          </div>
          <iframe title="Desktop preview" src={customerSiteUrl()} style={{ width: '100%', height: 480, border: '1px solid #ddd' }} />
          <iframe
            title="Mobile preview"
            src={customerSiteUrl()}
            style={{ width: 390, height: 640, border: '1px solid #ddd', marginTop: 12 }}
          />
        </Card>
      ) : null}

      {tab === 'seo' ? (
        <Card>
          <Heading level={2}>SEO defaults &amp; redirects</Heading>
          <FieldInput
            label="Site title"
            value={seo.siteTitle}
            onChange={(event) => setSeo({ ...seo, siteTitle: event.target.value })}
          />
          <FieldArea
            label="Default meta description"
            value={seo.defaultDescription}
            onChange={(event) => setSeo({ ...seo, defaultDescription: event.target.value })}
          />
          <FieldInput
            label="OG title"
            value={seo.ogTitle}
            onChange={(event) => setSeo({ ...seo, ogTitle: event.target.value })}
          />
          <FieldArea
            label="OG description"
            value={seo.ogDescription}
            onChange={(event) => setSeo({ ...seo, ogDescription: event.target.value })}
          />
          <FieldInput
            label="Organization name (JSON-LD)"
            value={seo.organizationName}
            onChange={(event) => setSeo({ ...seo, organizationName: event.target.value })}
          />
          <FieldInput
            label="Organization URL (JSON-LD, https only)"
            value={seo.organizationUrl}
            onChange={(event) => setSeo({ ...seo, organizationUrl: event.target.value })}
          />
          <FieldArea
            label="robots.txt"
            value={seo.robotsTxt}
            onChange={(event) => setSeo({ ...seo, robotsTxt: event.target.value })}
          />
          <FieldArea
            label="noindex paths (one per line)"
            value={seo.noindexPaths.join('\n')}
            onChange={(event) =>
              setSeo({
                ...seo,
                noindexPaths: event.target.value
                  .split('\n')
                  .map((row) => row.trim())
                  .filter((row) => row.startsWith('/')),
              })
            }
          />
          <Heading level={3}>Redirects</Heading>
          <Text tone="secondary">Internal paths only. javascript: URLs are stripped on publish.</Text>
          {seo.redirects.map((row, index) => (
            <div key={`${row.from}-${index}`} className="wp-form-grid">
              <FieldInput
                label="From"
                value={row.from}
                onChange={(event) => {
                  const redirects = seo.redirects.slice();
                  redirects[index] = { ...row, from: event.target.value };
                  setSeo({ ...seo, redirects });
                }}
              />
              <FieldInput
                label="To"
                value={row.to}
                onChange={(event) => {
                  const redirects = seo.redirects.slice();
                  redirects[index] = { ...row, to: event.target.value };
                  setSeo({ ...seo, redirects });
                }}
              />
              <FieldInput
                label="Status"
                value={String(row.status ?? 301)}
                onChange={(event) => {
                  const redirects = seo.redirects.slice();
                  const status = Number(event.target.value) === 302 ? 302 : 301;
                  redirects[index] = { ...row, status };
                  setSeo({ ...seo, redirects });
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSeo({ ...seo, redirects: seo.redirects.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setSeo({ ...seo, redirects: [...seo.redirects, { from: '/', to: '/', status: 301 }] })}
          >
            Add redirect
          </Button>
          <Button
            disabled={saving || !canWrite || !canPublish}
            onClick={() => void save(SITE_SEO_SLUG, 'Storefront SEO', 'SEO JSON', seo)}
          >
            Publish SEO
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
