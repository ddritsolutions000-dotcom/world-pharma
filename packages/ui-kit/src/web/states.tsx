import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Spinner } from './feedback';
import { Heading, Text } from './text';

function StateFrame({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="wp-state">
      <Icon name={icon} size="lg" decorative />
      <Heading level={3}>{title}</Heading>
      <Text tone="secondary">{description}</Text>
      {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return <StateFrame icon="search" {...props} />;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again. If it continues, contact support.',
  action,
}: {
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return <StateFrame icon="error" title={title} description={description} action={action} />;
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="wp-state">
      <Spinner label={label} />
      <Text tone="secondary">{label}</Text>
    </div>
  );
}

export function NetworkErrorState(props: { action?: { label: string; onClick: () => void } }) {
  return (
    <ErrorState
      title="Connection problem"
      description="Check your network and retry. Nothing was charged."
      action={props.action}
    />
  );
}

export function PermissionDeniedState() {
  return (
    <StateFrame
      icon="lock"
      title="You do not have access"
      description="This area is limited to authorized roles."
    />
  );
}

export function SessionExpiredState(props: { action?: { label: string; onClick: () => void } }) {
  return (
    <StateFrame
      icon="clock"
      title="Session expired"
      description="Sign in again to continue."
      action={props.action}
    />
  );
}
