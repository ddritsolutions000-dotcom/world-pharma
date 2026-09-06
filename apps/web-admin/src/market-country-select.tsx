'use client';

import { FormField, Select } from '@world-pharma/ui-kit/web';
import { MARKET_COUNTRY_CODES, marketCountryPickerValue } from './working-country';

export function MarketCountrySelect(props: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  ariaLabel?: string;
  allowEmpty?: boolean;
}) {
  const selected = props.value || marketCountryPickerValue(props.value);
  return (
    <FormField label={props.label ?? 'Country'}>
      {({ id }) => (
        <Select
          id={id}
          aria-label={props.ariaLabel}
          value={selected}
          onChange={(event) => props.onChange(event.target.value)}
        >
          {props.allowEmpty !== false ? (
            <option value="">Select country</option>
          ) : null}
          {MARKET_COUNTRY_CODES.map((iso) => (
            <option key={iso} value={iso}>
              {iso}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
}
