import './style.css';
import { createMap } from './map/map';
import { enableSitePlacement } from './map/siteMarker';
import { createSitePanel } from './ui/sitePanel';

const map = createMap(document.getElementById('map')!);
const showSite = createSitePanel(document.getElementById('site-panel')!);
enableSitePlacement(map, showSite);
