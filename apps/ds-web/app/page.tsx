'use client';

import { useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Banner,
  BottomNav,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  HeaderBar,
  Heading,
  Icon,
  IconButton,
  Input,
  KeyValue,
  LoadingState,
  Modal,
  Progress,
  Radio,
  SegmentedControl,
  Select,
  Sidebar,
  Skeleton,
  Spinner,
  Stat,
  StatusDot,
  Switch,
  Table,
  Tabs,
  Text,
  TextArea,
  useTheme,
} from '@world-pharma/ui-kit/web';

function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="wp-row">
      {(['light', 'dark', 'system'] as const).map((item) => (
        <Button
          key={item}
          variant={preference === item ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setPreference(item)}
        >
          {item}
        </Button>
      ))}
    </div>
  );
}

export default function Page() {
  const [tab, setTab] = useState('buttons');
  const [segment, setSegment] = useState('comfortable');
  const [on, setOn] = useState(true);
  const [modal, setModal] = useState(false);

  return (
    <main className="wp-page">
      <HeaderBar title="World Pharma UI kit">
        <ThemeToggle />
      </HeaderBar>
      <Text tone="secondary">
        Foundation playground only. No store, doctor, lab, vendor, admin, or join product screens.
      </Text>

      <section className="wp-stack" style={{ marginTop: 32 }}>
        <Heading level={2}>Color and type</Heading>
        <div className="wp-row">
          <Badge kind="verified">Verified</Badge>
          <Badge kind="rx">Prescription required</Badge>
          <Badge kind="panic">Urgent clinical</Badge>
          <Badge kind="cod">Cash on delivery</Badge>
          <StatusDot kind="pending" label="Pending" />
        </div>
        <Heading level={1}>Heading one — keep wrapping for translated strings</Heading>
        <Text>
          Body copy uses a calm clinical voice. Status is never color-only: badges include an icon and a
          label.
        </Text>
        <Text size="caption" tabular>
          1,240.00 INR tabular figures
        </Text>
      </section>

      <section className="wp-stack" style={{ marginTop: 32 }}>
        <Heading level={2}>Buttons</Heading>
        <div className="wp-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tertiary">Tertiary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Search">
            <Icon name="search" label="Search" />
          </IconButton>
        </div>
      </section>

      <section className="wp-stack" style={{ marginTop: 32 }}>
        <Heading level={2}>Inputs</Heading>
        <FormField label="Email" hint="We never log this value." required>
          {({ id, describedBy }) => <Input id={id} type="email" aria-describedby={describedBy} />}
        </FormField>
        <FormField label="Password" error="Use at least 12 characters.">
          {({ id, describedBy }) => (
            <Input id={id} type="password" aria-describedby={describedBy} invalid autoComplete="current-password" />
          )}
        </FormField>
        <FormField label="Notes">{({ id }) => <TextArea id={id} />}</FormField>
        <FormField label="Country">
          {({ id }) => (
            <Select id={id} defaultValue="xx">
              <option value="xx">XX — unset</option>
            </Select>
          )}
        </FormField>
        <Checkbox label="Required acknowledgement" />
        <Radio name="channel" label="Email" defaultChecked />
        <Radio name="channel" label="SMS" />
        <Switch checked={on} onCheckedChange={setOn} label="Compact density preview" />
      </section>

      <section className="wp-stack" style={{ marginTop: 32 }}>
        <Heading level={2}>Feedback</Heading>
        <Alert tone="success" title="Saved" />
        <Alert tone="error" title="Could not save">
          Try again. No technical detail is shown.
        </Alert>
        <Banner tone="warning" title="Do not use toast for payment or clinical confirmation." />
        <div className="wp-row">
          <Spinner label="Loading" />
          <Progress value={40} label="Uploading" />
          <Skeleton width={180} height={16} />
        </div>
      </section>

      <section className="wp-stack" style={{ marginTop: 32 }}>
        <Heading level={2}>Navigation primitives</Heading>
        <Tabs
          tabs={[
            { id: 'buttons', label: 'Buttons' },
            { id: 'forms', label: 'Forms' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <SegmentedControl
          options={[
            { id: 'comfortable', label: 'Comfortable' },
            { id: 'compact', label: 'Compact' },
          ]}
          value={segment}
          onChange={setSegment}
        />
        <Breadcrumbs items={[{ label: 'Foundation', href: '#' }, { label: 'Playground' }]} />
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
          <Sidebar
            items={[
              { id: 'home', label: 'Home', icon: 'home' },
              { id: 'search', label: 'Search', icon: 'search' },
            ]}
            current="home"
          />
          <Card>
            <Text>Sidebar and bottom nav are primitives, not product IA.</Text>
          </Card>
        </div>
        <BottomNav
          items={[
            { id: 'home', label: 'Home', icon: 'home' },
            { id: 'search', label: 'Search', icon: 'search' },
          ]}
          current="home"
        />
      </section>

      <section className="wp-stack" style={{ marginTop: 32 }}>
        <Heading level={2}>Data and states</Heading>
        <div className="wp-row">
          <Stat label="Ready packs" value="0" />
          <Avatar name="Ada Lovelace" />
        </div>
        <KeyValue
          items={[
            { key: 'Token set', value: 'interim' },
            { key: 'Brand', value: 'OD-DS-01 open' },
          ]}
        />
        <Table
          caption="Sample foundation table"
          columns={['Token', 'Role']}
          rows={[
            ['space.4', '16px gutter'],
            ['touch.min', '44px'],
          ]}
        />
        <Divider />
        <EmptyState
          title="Nothing here yet"
          description="This is an empty pattern, not a catalog."
          action={{ label: 'Primary action', onClick: () => undefined }}
        />
        <ErrorState />
        <LoadingState />
        <Button variant="secondary" onClick={() => setModal(true)}>
          Open modal
        </Button>
        <Modal open={modal} title="Modal primitive" onClose={() => setModal(false)}>
          <Text>Focus moves into the dialog. Escape closes it. Not a product workflow.</Text>
        </Modal>
      </section>
    </main>
  );
}
