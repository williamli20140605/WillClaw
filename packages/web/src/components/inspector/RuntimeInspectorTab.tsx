import type { RuntimeInspectorModel } from '../../inspector-types.js';
import { AuthSection } from './AuthSection.js';
import { HostLabSection } from './HostLabSection.js';
import { PairingSection } from './PairingSection.js';
import { RuntimeOperationsSection } from './RuntimeOperationsSection.js';
import { RuntimeStatusSection } from './RuntimeStatusSection.js';

interface RuntimeInspectorTabProps {
  runtime: RuntimeInspectorModel;
}

export function RuntimeInspectorTab({
  runtime,
}: RuntimeInspectorTabProps) {
  return (
    <div className="stack-list">
      <RuntimeOperationsSection {...runtime.operations} />
      <HostLabSection {...runtime.hostLab} />
      <PairingSection {...runtime.pairing} />
      <AuthSection {...runtime.auth} />
      <RuntimeStatusSection {...runtime.status} />
    </div>
  );
}
