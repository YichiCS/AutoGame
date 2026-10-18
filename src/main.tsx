import { render } from 'preact';
import './styles/main.css';
import { App } from './ui/App';
import { loadSettings, settings } from './ui/live';
import { setSoundEnabled } from './ui/sound';

loadSettings();
setSoundEnabled(settings.sound);
document.documentElement.style.zoom = String(settings.zoom || 1);
render(<App />, document.getElementById('app')!);
