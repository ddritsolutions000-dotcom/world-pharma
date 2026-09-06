import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import type { FeatureCtx } from './customer-features';
import { createFamilyMember, deleteFamilyMember, fetchFamilyMembers } from './family-api';
import { FAMILY_RELATIONSHIPS, memberSummary, type FamilyMember } from './family-member-ui';

export function FamilyMembersScreen({ ctx, country }: { ctx: FeatureCtx; country: string }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [relationshipCode, setRelationshipCode] = useState('PARENT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchFamilyMembers({ token: ctx.token, country, onUnauthorized: ctx.onUnauthorized });
    if (result.ok) {
      setMembers(result.data.members ?? []);
      ctx.setViewState('idle');
      return;
    }
    if (result.status === 401) {
      ctx.onUnauthorized();
      return;
    }
    ctx.setViewState('network');
  }, [ctx, country]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMember = useCallback(async () => {
    if (!displayName.trim()) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createFamilyMember({
      token: ctx.token,
      country,
      onUnauthorized: ctx.onUnauthorized,
      input: { display_name: displayName.trim(), relationship_code: relationshipCode },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not save member.');
      return;
    }
    setMembers((prev) => [...prev, result.data]);
    setDisplayName('');
  }, [country, ctx, displayName, relationshipCode]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Family members</NativeText>
      <NativeText variant="caption">
        Order for loved ones — saved names only, not separate medical accounts.
      </NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading family" /> : null}
      {ctx.viewState === 'idle' ? (
        <>
          <NativeInput label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Mom" />
          <NativeText variant="caption">Relationship</NativeText>
          {FAMILY_RELATIONSHIPS.map((row) => (
            <NativeButton
              key={row.code}
              label={`${row.label}${relationshipCode === row.code ? ' ✓' : ''}`}
              variant={relationshipCode === row.code ? 'primary' : 'secondary'}
              onPress={() => setRelationshipCode(row.code)}
            />
          ))}
          {error ? <NativeText variant="caption">{error}</NativeText> : null}
          {!busy ? <NativeButton label="Add member" onPress={() => void saveMember()} /> : <NativeLoadingState title="Saving" />}
          {members.length === 0 ? (
            <NativeEmptyState title="No family members" description="Add someone you order medicines for." />
          ) : (
            members.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.display_name}</NativeText>
                <NativeText variant="caption">{memberSummary(row)}</NativeText>
                <NativeButton
                  label="Remove"
                  variant="secondary"
                  onPress={() => {
                    void deleteFamilyMember({ token: ctx.token, id: row.id, onUnauthorized: ctx.onUnauthorized }).then(
                      (result) => {
                        if (result.ok) {
                          setMembers((prev) => prev.filter((item) => item.id !== row.id));
                        }
                      },
                    );
                  }}
                />
              </NativeCard>
            ))
          )}
        </>
      ) : null}
    </View>
  );
}
