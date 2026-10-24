import './style.css';
import {
  DEFAULT_RADIO_PROFILE_ID,
  DEFAULT_RX_CHAIN,
  DEFAULT_TX_CHAIN,
  RADIO_PROFILES,
} from './data/defaults';
import { createMap } from './map/map';
import { enableSitePlacement } from './map/siteMarker';
import { talkInBudget, talkOutBudget } from './rf/linkBudget';
import { createBudgetPanel } from './ui/budgetPanel';
import { createRadioForm, createRxForm, createTxForm } from './ui/chainForms';
import { createSitePanel } from './ui/sitePanel';

const map = createMap(document.getElementById('map')!);
const showSite = createSitePanel(document.getElementById('site-panel')!);
enableSitePlacement(map, showSite);

let tx = DEFAULT_TX_CHAIN;
let rx = DEFAULT_RX_CHAIN;
let radio = RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;

const showBudget = createBudgetPanel(document.getElementById('budget')!);
const updateBudget = () => showBudget(talkOutBudget(tx, radio), talkInBudget(rx, radio));

createRadioForm(document.getElementById('radio-form')!, radio, (next) => {
  radio = next;
  updateBudget();
});
createTxForm(document.getElementById('tx-form')!, tx, (next) => {
  tx = next;
  updateBudget();
});
createRxForm(document.getElementById('rx-form')!, rx, (next) => {
  rx = next;
  updateBudget();
});
updateBudget();
