import { CUSTOM_PROFILE_ID, RADIO_PROFILES } from '../data/defaults';
import type { RadioProfile, SiteRxChain, SiteTxChain } from '../rf/linkBudget';
import { createFieldGroup, type NumberFieldSpec } from './fields';

// Rangos: ITM admite de 20 MHz a 20 GHz y antenas desde 0,5 m de altura.
const FREQUENCY: Omit<NumberFieldSpec, 'key'> = { label: 'Frecuencia', unit: 'MHz', min: 20, max: 3000 };
const LINE_LENGTH: Omit<NumberFieldSpec, 'key'> = { label: 'Longitud de la línea', unit: 'm', min: 0, max: 1000 };
const LINE_LOSS: Omit<NumberFieldSpec, 'key'> = { label: 'Pérdida de la línea', unit: 'dB/100 m', min: 0, max: 50 };

const TX_FIELDS: readonly NumberFieldSpec<keyof SiteTxChain>[] = [
  { key: 'frequencyMHz', ...FREQUENCY },
  { key: 'transmitterPowerW', label: 'Potencia del transmisor', unit: 'W', min: 0, max: 1000, minExclusive: true },
  { key: 'combinerLossDb', label: 'Pérdida del combinador o duplexor', unit: 'dB', min: 0, max: 30 },
  { key: 'lineLengthM', ...LINE_LENGTH },
  { key: 'lineLossDbPer100m', ...LINE_LOSS },
  { key: 'connectorLossDb', label: 'Pérdida de conectores', unit: 'dB', min: 0, max: 10 },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena TX', unit: 'dBd', min: -10, max: 25 },
  { key: 'antennaHeightM', label: 'Altura de la antena TX', unit: 'm', min: 0.5, max: 1000 },
];

const RX_FIELDS: readonly NumberFieldSpec<keyof SiteRxChain>[] = [
  { key: 'frequencyMHz', ...FREQUENCY },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena RX', unit: 'dBd', min: -10, max: 25 },
  { key: 'antennaHeightM', label: 'Altura de la antena RX', unit: 'm', min: 0.5, max: 1000 },
  {
    key: 'towerAmplifierGainDb',
    label: 'Ganancia del amplificador de torre',
    unit: 'dB',
    min: 0,
    max: 40,
    hint: '0 si el sitio no tiene. Solo compensa las pérdidas de línea y multiacoplador.',
  },
  { key: 'lineLengthM', ...LINE_LENGTH },
  { key: 'lineLossDbPer100m', ...LINE_LOSS },
  { key: 'multicouplerLossDb', label: 'Pérdida del multiacoplador y conectores', unit: 'dB', min: 0, max: 30 },
  { key: 'receiverSensitivityDbm', label: 'Sensibilidad del receptor del sitio', unit: 'dBm', min: -150, max: -60 },
];

type RadioValues = Omit<RadioProfile, 'id' | 'name'>;

const RADIO_FIELDS: readonly NumberFieldSpec<keyof RadioValues>[] = [
  { key: 'powerW', label: 'Potencia', unit: 'W', min: 0, max: 200, minExclusive: true },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena', unit: 'dBd', min: -20, max: 15 },
  { key: 'heightM', label: 'Altura de la antena', unit: 'm', min: 0.5, max: 100 },
  { key: 'bodyLossDb', label: 'Pérdida por el cuerpo o el vehículo', unit: 'dB', min: 0, max: 40 },
  { key: 'sensitivityDbm', label: 'Sensibilidad', unit: 'dBm', min: -150, max: -60 },
];

export function createTxForm(
  container: HTMLElement,
  initial: SiteTxChain,
  onChange: (tx: SiteTxChain) => void,
): { setValues(tx: SiteTxChain): void } {
  return createFieldGroup(container, TX_FIELDS, initial, onChange);
}

export function createRxForm(
  container: HTMLElement,
  initial: SiteRxChain,
  onChange: (rx: SiteRxChain) => void,
): { setValues(rx: SiteRxChain): void } {
  return createFieldGroup(container, RX_FIELDS, initial, onChange);
}

/**
 * Selector de perfil de radio y sus campos. Elegir un perfil carga sus valores;
 * editar cualquier campo pasa el selector a "Personalizado" conservando lo escrito.
 */
export function createRadioForm(
  container: HTMLElement,
  initial: RadioProfile,
  onChange: (radio: RadioProfile) => void,
): void {
  const selectId = 'perfil-radio';
  const wrapper = document.createElement('div');
  wrapper.className = 'field field-select';
  wrapper.innerHTML = `<label for="${selectId}">Perfil</label><select id="${selectId}"></select>`;
  const select = wrapper.querySelector('select')!;
  for (const profile of RADIO_PROFILES) select.add(new Option(profile.name, profile.id));
  select.add(new Option('Personalizado', CUSTOM_PROFILE_ID));
  select.value = initial.id;
  container.append(wrapper);

  let current = initial;

  const fields = createFieldGroup<RadioValues>(container, RADIO_FIELDS, initial, (values) => {
    current = { ...values, id: CUSTOM_PROFILE_ID, name: 'Personalizado' };
    select.value = CUSTOM_PROFILE_ID;
    onChange(current);
  });

  select.addEventListener('change', () => {
    const profile = RADIO_PROFILES.find((p) => p.id === select.value);
    // "Personalizado" parte de los valores que haya en pantalla.
    current = profile ?? { ...current, id: CUSTOM_PROFILE_ID, name: 'Personalizado' };
    fields.setValues(current);
    onChange(current);
  });
}
