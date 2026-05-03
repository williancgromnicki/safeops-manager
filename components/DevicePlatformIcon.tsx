type PlatformKind = 'windows' | 'linux' | 'macos' | 'unknown';
type DeviceKind = 'server' | 'workstation';

type DevicePlatformIconProps = {
  operatingSystem?: string | null;
  deviceName?: string | null;
};

function detectPlatform(operatingSystem?: string | null): PlatformKind {
  const value = (operatingSystem ?? '').toLowerCase();

  if (
    value.includes('windows') ||
    value.includes('win server') ||
    value.includes('microsoft')
  ) {
    return 'windows';
  }

  if (
    value.includes('linux') ||
    value.includes('ubuntu') ||
    value.includes('debian') ||
    value.includes('centos') ||
    value.includes('red hat') ||
    value.includes('rhel') ||
    value.includes('rocky') ||
    value.includes('alma')
  ) {
    return 'linux';
  }

  if (
    value.includes('macos') ||
    value.includes('mac os') ||
    value.includes('os x') ||
    value.includes('darwin')
  ) {
    return 'macos';
  }

  return 'unknown';
}

function detectDeviceKind(
  operatingSystem?: string | null,
  deviceName?: string | null,
): DeviceKind {
  const os = (operatingSystem ?? '').toLowerCase();
  const name = (deviceName ?? '').toLowerCase();

  if (
    os.includes('server') ||
    name.startsWith('srv') ||
    name.includes('-srv') ||
    name.includes('server') ||
    name.includes('dc') ||
    name.includes('erp') ||
    name.includes('files')
  ) {
    return 'server';
  }

  return 'workstation';
}

function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 5.2 10.6 4v7.3H3V5.2Zm8.7-1.4L21 2.4v8.9h-9.3V3.8ZM3 12.7h7.6V20L3 18.8v-6.1Zm8.7 0H21v8.9l-9.3-1.4v-7.5Z"
      />
    </svg>
  );
}

function LinuxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.5c-2.2 0-3.8 1.8-3.8 4.2 0 1.2.3 2.1.7 3.1l-2.8 4.5c-.4.6-.6 1.3-.6 2 0 2.4 2.9 4.2 6.5 4.2s6.5-1.8 6.5-4.2c0-.7-.2-1.4-.6-2l-2.8-4.5c.4-1 .7-1.9.7-3.1 0-2.4-1.6-4.2-3.8-4.2Zm-1.4 4c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9Zm2.8 0c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9ZM12 10.2c.8 0 1.5.4 1.8 1.1h-3.6c.3-.7 1-1.1 1.8-1.1Zm-3.6 5.1 1.6-2.5h4l1.6 2.5c.2.3.3.6.3 1 0 1.1-1.7 2-3.9 2s-3.9-.9-3.9-2c0-.4.1-.7.3-1Z"
      />
    </svg>
  );
}

function MacIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.7 13.1c0-2.4 2-3.6 2.1-3.7-1.1-1.6-2.8-1.8-3.4-1.9-1.5-.1-2.8.9-3.6.9-.8 0-2-.9-3.2-.8-1.7 0-3.2 1-4.1 2.5-1.8 3.2-.5 7.9 1.3 10.5.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.2 3.1-2.5 1-1.5 1.4-2.9 1.4-3-.1 0-2.6-1-2.6-4.5ZM14.5 5.9c.7-.8 1.1-1.9 1-3-.9.1-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.7-1.3Z"
      />
    </svg>
  );
}

function UnknownOsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 18h2v-2h-2v2Zm1-16a7 7 0 0 0-7 7h2a5 5 0 1 1 7.8 4.1c-1.5 1-2.8 2-2.8 4.4h2c0-1.3.7-1.8 1.9-2.6A7 7 0 0 0 12 2Z"
      />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v4h14V5H5Zm0 8h14v4H5v-4Zm-1-2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H4Zm3-4h2V6H7v1Zm0 8h2v-1H7v1Z"
      />
    </svg>
  );
}

function WorkstationIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6v2h3a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h3v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h16V6H4Z"
      />
    </svg>
  );
}

function getPlatformLabel(platform: PlatformKind) {
  if (platform === 'windows') return 'Windows';
  if (platform === 'linux') return 'Linux';
  if (platform === 'macos') return 'macOS';

  return 'Sistema operacional desconhecido';
}

function getDeviceKindLabel(kind: DeviceKind) {
  return kind === 'server' ? 'Servidor' : 'Estação de trabalho';
}

function PlatformIcon({ platform }: { platform: PlatformKind }) {
  if (platform === 'windows') return <WindowsIcon />;
  if (platform === 'linux') return <LinuxIcon />;
  if (platform === 'macos') return <MacIcon />;

  return <UnknownOsIcon />;
}

function DeviceKindIcon({ kind }: { kind: DeviceKind }) {
  if (kind === 'server') return <ServerIcon />;

  return <WorkstationIcon />;
}

export function DevicePlatformIcon({
  operatingSystem,
  deviceName,
}: DevicePlatformIconProps) {
  const platform = detectPlatform(operatingSystem);
  const deviceKind = detectDeviceKind(operatingSystem, deviceName);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-brand-700"
      title={`${getPlatformLabel(platform)} • ${getDeviceKindLabel(deviceKind)}`}
      aria-label={`${getPlatformLabel(platform)} • ${getDeviceKindLabel(deviceKind)}`}
    >
      <PlatformIcon platform={platform} />
      <DeviceKindIcon kind={deviceKind} />
    </span>
  );
}
