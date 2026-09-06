'use client';

import type { ComponentType, ReactNode } from 'react';
import { buildRouteBreadcrumbs, type RouteBreadcrumbOptions, type RouteCrumb } from './route-breadcrumbs';

type LinkProps = { href: string; children: ReactNode; className?: string };

function DefaultLink({ href, children, className }: LinkProps) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function RouteBreadcrumbs({
  items,
  className = 'wp-crumbs',
  LinkComponent = DefaultLink,
}: {
  items: RouteCrumb[];
  className?: string;
  LinkComponent?: ComponentType<LinkProps>;
}) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <nav className={className} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {item.href ? (
            <LinkComponent href={item.href} className="wp-crumb-link">
              {item.label}
            </LinkComponent>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
          {index < items.length - 1 ? <span className="wp-crumb-sep"> › </span> : null}
        </span>
      ))}
    </nav>
  );
}

export function PathBreadcrumbs({
  pathname,
  options,
  className,
  LinkComponent,
}: {
  pathname: string;
  options?: RouteBreadcrumbOptions;
  className?: string;
  LinkComponent?: ComponentType<LinkProps>;
}) {
  const items = buildRouteBreadcrumbs(pathname, options);
  return <RouteBreadcrumbs items={items} className={className} LinkComponent={LinkComponent} />;
}
