'use client';

import { MgBtn, Page, PageIntro } from './ui/mg-ui';

/** WorldPharma has no walk-in stores — home delivery only. */
export function StoreLocatorScreen() {
  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Delivery">
        <p className="mg-service-kicker">No walk-in stores</p>
        <h1 className="mg-service-title">Home delivery only</h1>
        <p className="mg-service-sub">
          WorldPharma is fully online. We do not operate physical stores or pickup counters.
        </p>
      </section>
      <PageIntro>
        <p>
          Order medicines, book lab tests, and consult doctors from this site. Licensed partners fulfil orders and
          deliver to your address — there is nothing to visit nearby.
        </p>
      </PageIntro>
      <div className="mg-toolbar">
        <MgBtn href="/">Shop medicines</MgBtn>
        <MgBtn href="/track-order" variant="secondary">
          Track an order
        </MgBtn>
      </div>
    </Page>
  );
}
