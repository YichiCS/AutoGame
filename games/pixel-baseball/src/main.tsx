import { render } from 'preact';
import './styles/main.css';
import { App } from './ui/App';
import { loadSettings, settings } from './ui/settings';
import { installUiSounds, setSoundEnabled } from './ui/sound';
import { applyZoom } from './ui/zoom';
import { startLoop } from './ui/loop';

loadSettings();
setSoundEnabled(settings.sound);
// 所有按钮点下去都有声音
installUiSounds();
applyZoom();
startLoop();
render(<App />, document.getElementById('app')!);
