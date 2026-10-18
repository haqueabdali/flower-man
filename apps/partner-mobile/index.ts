import { registerRootComponent } from 'expo';

// Must run at startup (also when the OS wakes the app in the background) so the task is defined.
import './src/tracking';
import { App } from './src/App';

registerRootComponent(App);
