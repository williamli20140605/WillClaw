import {
    AuthLoadingScreen,
    AuthUnlockScreen,
} from './components/AuthShell.js';
import { ShellWorkspace } from './components/ShellWorkspace.js';
import { useShellController } from './use-shell-controller.js';

export function App() {
    const screen = useShellController();

    if (screen.kind === 'loading') {
        return <AuthLoadingScreen />;
    }

    if (screen.kind === 'unlock') {
        return <AuthUnlockScreen {...screen.props} />;
    }

    return <ShellWorkspace {...screen.props} />;
}
