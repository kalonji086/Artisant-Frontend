import { getCallingCodes, getCountries } from '@amplifiedhq/countries-atlas';
import { getTranslation } from '@amplifiedhq/countries-atlas/translations';

export type Country = { name: string; iso2: string; dial: string };

export const COUNTRIES: Country[] = getCountries()
  .map((country) => ({
    name: getTranslation(country.iso2, 'fr') ?? country.name,
    iso2: country.iso2,
    dial: country.callingCodes[0] ? `+${country.callingCodes[0]}` : '',
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export const COUNTRY_BY_NAME = new Map(COUNTRIES.map((country) => [country.name, country]));

export const DEFAULT_DIAL = '+33';

const dialNames = new Map<string, Set<string>>();
for (const { code, country } of getCallingCodes()) {
  const dial = `+${code}`;
  const names = dialNames.get(dial) ?? new Set<string>();
  names.add(getTranslation(country.iso2, 'fr') ?? country.name);
  dialNames.set(dial, names);
}

export const DIAL_CODES: { dial: string; label: string }[] = Array.from(dialNames, ([dial, names]) => ({
  dial,
  label: `${dial}  ${Array.from(names).sort((a, b) => a.localeCompare(b, 'fr')).join(' / ')}`,
})).sort((a, b) => a.dial.length - b.dial.length || a.dial.localeCompare(b.dial));

export const AGE_MIN = 18;
export const AGE_MAX = 90;
export const AGE_OPTIONS = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => String(AGE_MIN + i));
