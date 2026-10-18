import { render } from 'preact';
import './styles/main.css';
import { App } from './ui/App';
import { loadSettings, settings } from './ui/settings';
import { setSoundEnabled } from './ui/sound';
import { applyZoom } from './ui/zoom';
import { startLoop } from './ui/loop';

loadSettings();
setSoundEnabled(settings.sound);
applyZoom();
startLoop();
render(<App />, document.getElementById('app')!);
